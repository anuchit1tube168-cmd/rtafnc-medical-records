// Inert security policy for proposed RTAFNC Chart AI review workflow.
// No network requests, patient data access, or writes. Must be called server-side
// AFTER verified user/session lookup; never trust actor roles from client input.
const STATES = new Set(['DRAFT', 'PENDING', 'IN_REVIEW', 'NEEDS_CHANGES', 'SIGNED', 'CLOSED']);
const EDGES = {
  DRAFT: { submit: 'PENDING' },
  PENDING: { claim: 'IN_REVIEW', request_changes: 'NEEDS_CHANGES' },
  IN_REVIEW: { sign: 'SIGNED', request_changes: 'NEEDS_CHANGES' },
  NEEDS_CHANGES: { resubmit: 'PENDING' },
  SIGNED: { close: 'CLOSED' },
  CLOSED: {}
};
const MAY = {
  Staff: new Set(['submit', 'claim', 'request_changes', 'resubmit']),
  Doctor: new Set(['submit', 'claim', 'request_changes', 'resubmit', 'sign', 'close']),
  Admin: new Set(),
  Viewer: new Set()
};
export const chartReviewStates = Object.freeze([...STATES]);
export function chartReviewDecision({ actor, review, action, expectedRevision, requestId, reason, enabled = false }) {
  if (enabled !== true) return { ok: false, code: 'WRITE_DISABLED' };
  if (!actor?.verified || actor.active !== true || !MAY[actor.role]) return { ok: false, code: 'UNAUTHORIZED' };
  if (!actor.unitId || !review?.unitId || actor.unitId !== review.unitId) return { ok: false, code: 'FORBIDDEN_SCOPE' };
  if (!MAY[actor.role].has(action)) return { ok: false, code: 'FORBIDDEN_ROLE' };
  if (!STATES.has(review.status)) return { ok: false, code: 'BAD_STATUS' };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== review.revision) return { ok: false, code: 'REVISION_CONFLICT' };
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) return { ok: false, code: 'INVALID_REQUEST_ID' };
  const nextStatus = EDGES[review.status][action];
  if (!nextStatus) return { ok: false, code: 'INVALID_TRANSITION' };
  if ((action === 'sign' || action === 'request_changes') && (!reason || String(reason).trim().length < 8)) return { ok: false, code: 'REASON_REQUIRED' };
  if (action === 'sign' && (!review.latestCommitId || review.sourceCommitId !== review.latestCommitId || review.codingVerified !== true)) return { ok: false, code: 'SIGNOFF_GATES_MISSING' };
  // Return mutation plan only. Persistence/audit/idempotency belong to trusted GAS backend.
  return { ok: true, nextStatus, nextRevision: expectedRevision + 1, requestId };
}
