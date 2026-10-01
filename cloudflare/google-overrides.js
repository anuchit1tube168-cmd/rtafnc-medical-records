// Replaces matching legacy functions only in the generated Cloudflare backend.
function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('ยังไม่ได้กำหนดฐานข้อมูล');
  return SpreadsheetApp.openById(id);
}

function initializeAdminUser() {
  // Never reset an existing account or password during a read/sync.
  throw new Error('ต้องจัดเตรียมบัญชีผู้ดูแลระบบผ่านขั้นตอนติดตั้ง');
}

function ensureSampleStudentsExist() { return; }
function isDemoEnabled() { return false; }

function loginUser(username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');
  if (!username || username.length > 100 || password.length < 12 || password.length > 256) {
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ระบบใหม่ต้องตั้งรหัสผ่านอย่างน้อย 12 ตัวอักษร)');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'CF_LOGIN_' + hashPassword(username);
    const now = Date.now();
    let attempt = JSON.parse(props.getProperty(key) || '{"count":0,"until":0}');
    if (attempt.until <= now) attempt = { count: 0, until: now + 900000 };
    if (attempt.count >= 5) throw new Error('ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที');
    const ss = getSpreadsheet();
    const users = ss.getSheetByName('Users').getDataRange().getValues();
    const user = users.slice(1).find(row => String(row[0]).trim().toLowerCase() === username);
    // Unknown usernames are not persisted, avoiding unbounded properties growth.
    if (!user) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    if (user[1] !== hashPassword(password) || String(user[4]).toLowerCase() !== 'true' || !['ADMIN', 'MEDICAL', 'STAFF', 'VIEWER'].includes(user[2])) {
      attempt.count++;
      props.setProperty(key, JSON.stringify(attempt));
      throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    props.deleteProperty(key);
    const token = 'SES-CF-' + Utilities.getUuid();
    const sessions = ss.getSheetByName('Sessions');
    if (!sessions) throw new Error('ยังไม่ได้เตรียมตาราง Sessions');
    sessions.appendRow([token, user[0], user[2], new Date(now), new Date(now + 8 * 3600000)]);
    return { success: true, sessionToken: token, username: user[0], role: user[2], fullName: user[3] };
  } finally { lock.releaseLock(); }
}

function validateSession(token) {
  if (typeof token !== 'string' || !/^SES-CF-[a-f0-9-]{36}$/.test(token)) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  const ss = getSpreadsheet();
  const sessions = ss.getSheetByName('Sessions').getDataRange().getValues();
  const session = sessions.slice(1).find(row => row[0] === token && new Date(row[4]).getTime() > Date.now());
  if (!session) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  const users = ss.getSheetByName('Users').getDataRange().getValues();
  const user = users.slice(1).find(row => row[0] === session[1] && String(row[4]).toLowerCase() === 'true');
  if (!user || !['ADMIN', 'MEDICAL', 'STAFF', 'VIEWER'].includes(user[2])) throw new Error('บัญชีไม่มีสิทธิ์ใช้งาน');
  return { sessionToken: token, username: user[0], role: user[2], fullName: user[3], isActive: true };
}

function getCurrentUser(token) {
  const user = validateSession(token);
  return { username: user.username, role: user.role, fullName: user.fullName, isActive: true };
}

function getSettings(token) {
  validateSession(token);
  const sheet = getSpreadsheet().getSheetByName('Settings');
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1)
    .filter(row => row[0] && !/TOKEN|SECRET|PASSWORD|CHAT_ID|SPREADSHEET_ID|SYNC_SOURCE_IDS|GOOGLE_.*ID/.test(row[0]))
    .map(row => ({ SettingKey: row[0], SettingValue: String(row[1]), Description: row[2] || '' }));
}

function getAuditLogs(token) {
  if (validateSession(token).role !== 'ADMIN') throw new Error('ไม่มีสิทธิ์');
  const sheet = getSpreadsheet().getSheetByName('AuditLogs');
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  return values.slice(1).reverse().slice(0, 500).map(row => {
    const result = {}; values[0].forEach((key, i) => { result[key] = row[i]; }); return result;
  });
}

function changeUserPassword(token, username, password) {
  const session = validateSession(token);
  if (session.role !== 'ADMIN' && session.username !== username) throw new Error('ไม่มีสิทธิ์');
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('รหัสผ่านต้องยาว 12–256 ตัวอักษร');
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Users');
  const users = sheet.getDataRange().getValues();
  const index = users.findIndex((row, i) => i > 0 && row[0] === username);
  if (index < 1) throw new Error('ไม่พบผู้ใช้');
  sheet.getRange(index + 1, 2).setValue(hashPassword(password));
  const sessions = ss.getSheetByName('Sessions');
  const rows = sessions.getDataRange().getValues();
  for (let i = rows.length - 1; i > 0; i--) if (rows[i][1] === username) sessions.deleteRow(i + 1);
  return { success: true };
}

function sendTelegramNotification(message) {
  if (getBackendConfig('CF_NOTIFICATIONS_ENABLED') !== 'TRUE') return;
  const token = getBackendConfig('TELEGRAM_BOT_TOKEN');
  const chat = getBackendConfig('TELEGRAM_CHAT_ID');
  if (!token || !chat) return;
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chat, text: message, parse_mode: 'HTML' })
  });
  if (response.getResponseCode() !== 200) throw new Error('ส่ง Telegram ไม่สำเร็จ');
}

function syncFollowUpToGoogleCalendar() {
  // Enabling scheduled/external writes needs a separate deployment step.
  return;
}
