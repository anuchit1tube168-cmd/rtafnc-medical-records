function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'rtafnc-cloudflare-bridge' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function config_(key) {
  const props = PropertiesService.getScriptProperties().getProperty(key);
  if (props) return props;
  return key === 'GAS_BRIDGE_SECRET' ? CF_CONFIG_.bridgeSecret : CF_CONFIG_.spreadsheetId;
}

function verifyEnvelope_(envelope) {
  const props = PropertiesService.getScriptProperties();
  const secret = config_('GAS_BRIDGE_SECRET');
  // Distinct messages so a misconfiguration is diagnosable without leaking the secret.
  if (!secret || secret.length < 32) throw new Error('ยังไม่ได้ตั้งค่ารหัสลับของสะพาน');
  if (typeof envelope.payload !== 'string' || envelope.payload.length > 131072 ||
      !Number.isSafeInteger(envelope.timestamp) || !/^[a-f0-9-]{36}$/.test(envelope.nonce) ||
      !/^[a-f0-9]{64}$/.test(envelope.signature)) throw new Error('รูปแบบคำขอไม่ถูกต้อง');
  if (Math.abs(Date.now() - envelope.timestamp) > 60000) throw new Error('คำขอหมดอายุ');
  const signed = envelope.timestamp + '\n' + envelope.nonce + '\n' + envelope.payload;
  const expected = Utilities.computeHmacSha256Signature(signed, secret, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
  if (different) throw new Error('ลายเซ็นไม่ถูกต้อง');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    // Durable replay ledger, protected by a lock. Cache eviction cannot permit replay.
    const all = props.getProperties(); const now = Date.now();
    const key = 'CF_NONCE_' + envelope.nonce;
    if (Object.prototype.hasOwnProperty.call(all, key)) throw new Error('คำขอซ้ำ กรุณาตรวจรายการเดิม');
    Object.keys(all).filter(k => k.startsWith('CF_NONCE_') && Number(all[k]) < now).forEach(k => props.deleteProperty(k));
    props.setProperty(key, String(envelope.timestamp + 61000));
  } finally { lock.releaseLock(); }
}

function verifyStudent_(input) {
  const props = PropertiesService.getScriptProperties();
  const channel = props.getProperty('LINE_LOGIN_CHANNEL_ID');
  if (!channel || typeof input.idToken !== 'string' || input.idToken.length > 8192) throw new Error('กรุณาเข้าสู่ระบบ LINE');
  const response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', payload: { id_token: input.idToken, client_id: channel }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('ตัวตน LINE ไม่ถูกต้องหรือหมดอายุ');
  const identity = JSON.parse(response.getContentText());
  if (!identity.sub || identity.aud !== channel || identity.iss !== 'https://access.line.me' || identity.exp * 1000 <= Date.now()) throw new Error('ตัวตน LINE ไม่ถูกต้อง');
  // Binding is created by an administrator; never trust a student ID claimed by the browser.
  const studentId = props.getProperty('LINE_STUDENT_' + identity.sub);
  const requested = input.method === 'lookupStudentByStudentId' ? input.args[0] : input.args[0] && input.args[0].studentId;
  if (!studentId || String(requested) !== studentId) throw new Error('บัญชี LINE ยังไม่ผูกกับรหัสนักเรียนนี้ กรุณาติดต่อเจ้าหน้าที่');
  if (input.method === 'submitLiffSelfCheckin') input.args[0].lineDisplayName = identity.name || '';
}

function doPost(e) {
  let result;
  try {
    if (!e || !e.postData || e.postData.contents.length > 150000) throw new Error('รูปแบบคำขอไม่ถูกต้อง');
    const envelope = JSON.parse(e.postData.contents);
    verifyEnvelope_(envelope);
    const input = JSON.parse(envelope.payload);
    if (!Object.prototype.hasOwnProperty.call(Backend_, input.method) || input.method === 'validateSession' || !Array.isArray(input.args) || input.args.length > 4) throw new Error('ไม่รองรับคำสั่งนี้');
    if (STUDENT_METHODS_.includes(input.method)) {
      verifyStudent_(input);
    } else if (!PUBLIC_METHODS_.includes(input.method)) {
      const session = Backend_.validateSession(input.args[0]);
      const admin = ['getUsers', 'saveUser', 'updateUserStatus', 'saveSettings', 'getAuditLogs'];
      const medical = ['saveVisit', 'cancelVisit', 'saveVitals', 'saveAssessment', 'saveTreatment', 'saveMedicine', 'receiveMedicineStock', 'adjustMedicineStock', 'dispenseMedicine', 'cancelDispensingAndReturnStock', 'saveReferral', 'saveFollowUp'];
      if (admin.includes(input.method) && session.role !== 'ADMIN') throw new Error('ไม่มีสิทธิ์');
      if (medical.includes(input.method) && !['ADMIN', 'MEDICAL'].includes(session.role)) throw new Error('ไม่มีสิทธิ์');
      if (/^(save|update)/.test(input.method) && session.role === 'VIEWER') throw new Error('สิทธิ์อ่านอย่างเดียว');
      if (session.role === 'STAFF' && !['getCurrentUser', 'logoutUser', 'getSettings', 'getDashboardData', 'getServiceRecipients', 'getServiceRecipientById', 'saveServiceRecipient', 'updateServiceRecipientStatus', 'changeUserPassword'].includes(input.method)) throw new Error('ไม่มีสิทธิ์');
      if (input.method === 'saveUser' && (input.args[1]?.Password && (input.args[1].Password.length < 12 || input.args[1].Password.length > 256))) throw new Error('รหัสผ่านต้องยาว 12–256 ตัวอักษร');
      if (input.method === 'saveUser' && !['ADMIN', 'MEDICAL', 'STAFF', 'VIEWER'].includes(input.args[1]?.Role)) throw new Error('ไม่มีสิทธิ์กำหนดบทบาทนี้');
      if (input.method === 'saveSettings' && Object.keys(input.args[1] || {}).some(k => /TOKEN|SECRET|PASSWORD|_ID$|SYNC_SOURCE|CF_/.test(k))) throw new Error('กรุณาตั้งค่าการเชื่อมต่อใน Script Properties');
    }
    if (/^(save|update|receive|adjust|dispense|submit)/.test(input.method)) validateWriteInput_(input.args.slice(1).concat(STUDENT_METHODS_.includes(input.method) ? input.args : []));
    result = { ok: true, data: Backend_[input.method].apply(null, input.args) };
  } catch (error) {
    // Do not return upstream URLs, tokens or internal exception details.
    const message = String(error.message || '');
    result = { ok: false, error: /^(กรุณา|ไม่มีสิทธิ์|สิทธิ์|เซสชัน|บัญชี|ชื่อผู้ใช้|รหัสผ่าน|ลองเข้าสู่ระบบ|คำขอ|ตัวตน LINE|ไม่รองรับ|ยังไม่ได้|ต้องจัดเตรียม)/.test(message) && !/https?:/.test(message)
      ? message : 'ดำเนินการไม่สำเร็จ กรุณาให้ผู้ดูแลตรวจสอบระบบ' };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function validateWriteInput_(value, depth) {
  depth = depth || 0;
  if (depth > 12) throw new Error('คำขอซับซ้อนเกินไป');
  if (typeof value === 'string' && (/^\s*[=+@]/.test(value) || /^\s*-\D/.test(value) || /[<>]/.test(value))) throw new Error('คำขอมีข้อความหรือสูตรที่ไม่รองรับ');
  if (value && typeof value === 'object') Object.keys(value).forEach(key => {
    if (key !== 'Password') validateWriteInput_(value[key], depth + 1);
  });
}
