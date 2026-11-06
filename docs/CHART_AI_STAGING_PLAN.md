# RTAFNC Medical Records — Doctor Chart × AI adaptation (staging plan)

## Status
Design and inert fail-closed policy only. No medical records were imported or modified. Production write is OFF. An interactive standalone demo with synthetic data was built separately for review.

## What the reference video shows
A Doctor Chart × AI interface with aggregate charts, pending clinical chart reviews, workflow queues, ICD-10 suggestions, autopilot-style work queues, audit and clinician validation. This project adapts those workflows, not the source application's code or brand.

## Reuse existing source-of-truth
Keep existing Cloudflare Worker static assets + HMAC GAS bridge + Apps Script + Google Sheets + Drive + LIFF. Existing Recipients, Visits, Medicines, MedicineUsage, Referrals, FollowUps, Users, Roles and AuditLogs remain canonical. Do not duplicate the patient master or replace Google Sheets without a migration plan. Link the separate EMS case workflow by validated Encounter/Visit reference rather than patient name.

## Target screens
S01 dashboard, S02 role-scoped chart queue with aging/filter, S03 encounter clinical detail, S04 explainable AI draft coding reviewer, S05 follow-up/referral, S06 reports and read-only audit. Hide clinical identifiers in dashboard/exports, and ensure student LIFF never exposes other students' charts.

## Proposed state machine
DRAFT → PENDING → IN_REVIEW → SIGNED → CLOSED. Rejection goes to NEEDS_CHANGES then resubmission to PENDING. Doctor signoff requires verified session, same authorized unit, latest source CommitID, server-confirmed catalog code and revision match. Admin-only role cannot independently sign clinical codes. Policy module is not wired to runtime yet and cannot authorize a request on its own.

## Proposed new Sheets
- ChartReviews: ReviewID, VisitID, UnitID, Status, Revision, SourceCommitID, LatestCommitID, RequestID, AssignedTo, SignedBy, CreatedAtUTC, UpdatedAtUTC, SignedAtUTC. Index VisitID, UnitID + Status; unique ReviewID and idempotency RequestID.
- ChartAiSuggestions: SuggestionID, ReviewID, SourceRevision, SourceHash, ICDSystem, ICDVersion, ProposedCode, EvidencePointer, Caveat, ModelVersion, Decision, DecisionReason, ReviewedBy, ReviewedAtUTC. No raw note in telemetry.
- ChartReviewAudit: EventID, ReviewID, ActorID, UnitID, Action, TimestampUTC, Revision, RequestID, Outcome. Append-only, no clinical narratives.

## Backend endpoints after authorization tests
getChartReviewQueue, getChartReviewDetail, createChartReviewDraft, getChartCodeSuggestions, decideChartSuggestion and getChartReviewAudit. Add to RPC allow-list only after server-verified authentication, scope and role tests exist. Require optimistic concurrency and idempotent writes with audit. Use Asia/Bangkok for display, UTC for storage.

## Blocking security findings from existing worker.mjs
Review publicly reachable /api/telegram/test, /api/telegram/referral, /api/telegram/triage and /api/students before enabling patient data flows. Current code paths precede the /api/rpc Origin and GAS HMAC guards and do not visibly validate a staff session. Telegram payloads include clinical fields and identifiers. Gate or disable these endpoints, minimize all notifications, verify student lookups and remove hardcoded LIFF fallback before clinical pilot. Same-origin checks do NOT authenticate a user.

## AI governance
No automatic diagnosis, medication changes, coding signoff or external AI upload. Use organization-approved ICD-10 version with clinician/coder verification; do not assume US ICD-10-CM and ICD-11 are the same as local catalog. If source documentation is incomplete, explicitly return insufficient-documentation. Keep AI off by default until clinical and PDPA approvals and security UAT. No PHI in GitHub, frontend static assets, browser analytics, logs, URLs or demo fixtures.

## Gates before staging integration
1. /api/health and configuration fail-closed.
2. Unauthorized and cross-unit GET/POST rejected (including older notification/student routes).
3. Student cannot view other records; Doctor signoff cannot be impersonated by Admin/Staff.
4. Invalid/stale CommitID and revision produce conflict without writes.
5. Duplicate RequestID never double-writes.
6. Audit and logs contain no PHI; aggregate exports suppress identifying fields.
7. Existing inventory, referrals, LIFF, daily health reporting do not regress.
8. Synthetic UAT completed; production writes remain OFF.

## Delivery order
A. Review clickable standalone demo and plan (current).
B. Fix legacy exposed routes and add negative tests.
C. Add schema and role-scoped staged chart queue.
D. Add human approval and fake suggestions, then clinical validation of approved ICD catalogue.
E. Enable reviewed AI suggestions only after formal governance; never silently enable production writes.

**Estimated size:** L–XL. Hardest parts: sensitive-data authorization, trustworthy clinical coding, and revision consistency across Sheets/GAS/Cloudflare/EMS.
