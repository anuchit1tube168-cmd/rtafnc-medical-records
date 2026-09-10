/**
 * ระบบเวชระเบียนและงานสุขภาพประจำหน่วยงาน
 * พัฒนาด้วย Google Apps Script, HTML, CSS และ JavaScript
 * ใช้ Google Sheets เป็นฐานข้อมูล
 */

// คอนฟิกูเรชันระบบหลังบ้าน (Google Script Properties & Google Sheets Settings)
// ข้อมูลสำคัญทั้งหมด (IDs, Tokens) จะถูกจัดเก็บในระบบหลังบ้านเพื่อความปลอดภัย ไม่เปิดเผยใน GitHub

/**
 * ดึงค่าคอนฟิกูเรชันความลับจากระบบหลังบ้าน (Script Properties / Settings Sheet)
 */
function getBackendConfig(key, defaultValue) {
  defaultValue = defaultValue || "";
  try {
    const prop = PropertiesService.getScriptProperties().getProperty(key);
    if (prop && prop.trim() !== "") return prop.trim();
  } catch (e) {}
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      const sheet = ss.getSheetByName("Settings");
      if (sheet) {
        const data = sheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === key && data[i][1]) {
            return String(data[i][1]).trim();
          }
        }
      }
    }
  } catch (e) {}
  
  return defaultValue;
}

const SPREADSHEET_ID = getBackendConfig("SPREADSHEET_ID");
const SESSION_EXPIRY_HOURS = 24; // เวลาหมดอายุของ Session (ชั่วโมง)

// --- ตั้งค่า Telegram และบริการเชื่อมต่อ (ดึงจากระบบหลังบ้าน) ---
const TELEGRAM_BOT_TOKEN = getBackendConfig("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID = getBackendConfig("TELEGRAM_CHAT_ID");
const GOOGLE_FORM_ID = getBackendConfig("GOOGLE_FORM_ID");
const GOOGLE_SLIDES_TEMPLATE_ID = getBackendConfig("GOOGLE_SLIDES_TEMPLATE_ID");

/**
 * ดึงออบเจกต์ Spreadsheet
 */
function getSpreadsheet() {
  // ลองดึงจาก Script Properties ก่อน
  const ssId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || SPREADSHEET_ID;
  if (ssId && ssId !== "YOUR_SPREADSHEET_ID_HERE" && ssId !== "XXX" && ssId.trim() !== "") {
    try {
      return SpreadsheetApp.openById(ssId);
    } catch (e) {
      throw new Error("ไม่สามารถเปิด Google Sheets ด้วย ID ที่กำหนดได้: " + e.message);
    }
  }
  
  // ลองใช้ Active Spreadsheet สำหรับ Container-bound script
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    throw new Error("กรุณาตั้งค่า Spreadsheet ID ในส่วนหัวของ Code.gs หรือใน Script Properties");
  }
}

/**
 * ฟังก์ชันหลักในการเปิดใช้งานเว็บแอป
 */
function doGet(e) {
  // บันทึกค่าความลับเข้าสู่ระบบหลังบ้านอัตโนมัติหากมีฟังก์ชันติดตั้ง
  if (typeof setupBackendSecrets === "function") {
    try {
      setupBackendSecrets();
    } catch (secErr) {}
  }

  // ตรวจสอบพารามิเตอร์รันทดสอบระบบ
  if (e && e.parameter && e.parameter.runTest === "true") {
    try {
      testSubmitForm();
      return HtmlService.createHtmlOutput("<h3>รันทดสอบระบบส่งแจ้งเตือน Telegram + Google Slides เรียบร้อยแล้ว! กรุณาตรวจสอบในห้องแชท Telegram</h3>");
    } catch (err) {
      return HtmlService.createHtmlOutput("<h3>เกิดข้อผิดพลาดในการรันทดสอบ:</h3><p>" + err.message + "</p>");
    }
  }
  
  let systemName = "ระบบเวชระเบียนและงานสุขภาพ";
  try {
    const ss = getSpreadsheet();
    if (!ss || !ss.getSheetByName("Users") || !ss.getSheetByName("Settings")) {
      setupSystem();
    }
    const settingsSheet = ss.getSheetByName("Settings");
    if (settingsSheet) {
      const data = settingsSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === "SYSTEM_NAME") {
          systemName = data[i][1];
          break;
        }
      }
    }
  } catch (err) {
    try {
      setupSystem();
    } catch (setupErr) {
      // ละไว้หากไม่สามารถเขียนชีตได้ในขณะนี้
    }
  }
  
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle(systemName)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * ฟังก์ชัน include สำหรับรวมไฟล์ HTML อื่นๆ เข้าไปในไฟล์หลัก
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 1. ติดตั้งระบบเริ่มต้น (Setup System)
 * สร้างชีต คอลัมน์ ค่าตั้งค่า และบัญชี admin
 */
function setupSystem() {
  const ss = getSpreadsheet();
  initializeSheets(ss);
  initializeDefaultSettings(ss);
  initializeAdminUser(ss);
  return { success: true, message: "ติดตั้งระบบและฐานข้อมูลเรียบร้อยแล้ว" };
}

/**
 * สร้างชีตทั้งหมดและหัวตาราง (Headers)
 */
function initializeSheets(ss) {
  const sheetsDef = {
    "Users": ["Username", "PasswordHash", "Role", "FullName", "IsActive", "CreatedAt", "IsDemoUser"],
    "Sessions": ["SessionToken", "Username", "Role", "CreatedAt", "ExpiresAt"],
    "ServiceRecipients": [
      "RecipientID", "NationalID", "Title", "FirstName", "LastName", "Nickname", "Gender", 
      "BirthDate", "Age", "RecipientType", "Group", "Level", "Department", "SubUnit", 
      "NumberOrOrder", "BloodType", "Weight", "Height", "CongenitalDiseases", "DrugAllergies", 
      "FoodAllergies", "OtherAllergies", "RegularMedicines", "HealthConstraints", "RegularHospital", 
      "ContactName", "ContactRelationship", "ContactPhone", "EmergencyContact", "EmergencyPhone", 
      "Note", "Status", "IsDemo", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"
    ],
    "Visits": [
      "VisitID", "VisitDate", "TimeIn", "TimeOut", "RecipientID", "RecipientName", "RecipientType", 
      "Group", "Department", "AccompaniedBy", "IncidentLocation", "IncidentActivity", "IncidentType", 
      "ChiefComplaint", "IncidentDetails", "UrgencyLevel", "InitialAssessment", "Outcome", 
      "ContactNotified", "ReferralCreated", "FollowUpScheduled", "VisitStatus", "IsDemo", "RecordedBy", "RecordedAt"
    ],
    "Vitals": [
      "VitalID", "VisitID", "RecipientID", "RecordedAt", "Temperature", "Weight", "Height", 
      "BloodPressureSystolic", "BloodPressureDiastolic", "Pulse", "RespiratoryRate", "OxygenSaturation", 
      "PainScore", "ConsciousnessLevel", "Note", "IsDemo"
    ],
    "Assessments": ["AssessmentID", "VisitID", "RecipientID", "RecordedAt", "AssessmentDetails", "Diagnosis", "IsDemo"],
    "Treatments": ["TreatmentID", "VisitID", "RecipientID", "RecordedAt", "TreatmentDetails", "Note", "IsDemo"],
    "Medicines": [
      "MedicineID", "MedicineCode", "MedicineName", "Category", "Form", "Strength", "Unit", 
      "Quantity", "AlertThreshold", "BatchNumber", "ReceivedDate", "ExpiryDate", "StorageLocation", 
      "Precautions", "Status", "IsDemo", "CreatedBy", "CreatedAt", "UpdatedBy", "UpdatedAt"
    ],
    "Dispensing": [
      "DispenseID", "VisitID", "RecipientID", "MedicineID", "MedicineName", "Quantity", 
      "Directions", "DispensedBy", "DispensedAt", "Status", "IsDemo"
    ],
    "InventoryTransactions": [
      "TransactionID", "MedicineID", "TransactionType", "Quantity", "PreviousQuantity", 
      "NewQuantity", "ReferenceID", "Notes", "TransactionDate", "RecordedBy", "IsDemo"
    ],
    "ContactNotifications": [
      "NotificationID", "VisitID", "RecipientID", "ContactName", "Relationship", "Phone", 
      "Channel", "IsSuccess", "Details", "ContactFeedback", "WillPickUp", "PickUpTime", 
      "RecordedAt", "RecordedBy", "IsDemo"
    ],
    "Referrals": [
      "ReferralID", "VisitID", "RecipientID", "ChiefComplaint", "LatestVitals", "PreReferralCare", 
      "MedicinesGiven", "ReasonForReferral", "DestinationHospital", "TravelMethod", "Escort", 
      "ContactNotified", "TimeDeparted", "Note", "Status", "IsDemo", "RecordedAt", "RecordedBy"
    ],
    "FollowUps": [
      "FollowUpID", "VisitID", "RecipientID", "ScheduledDate", "Status", "LatestSymptoms", 
      "HospitalTreatmentOutcome", "ReturnToActivityDate", "ActivityConstraints", "Instructions", 
      "FollowedUpBy", "IsDemo"
    ],
    "Attachments": ["AttachmentID", "VisitID", "RecipientID", "FileName", "FileUrl", "UploadedBy", "UploadedAt", "IsDemo"],
    "Settings": ["SettingKey", "SettingValue", "Description", "UpdatedAt", "UpdatedBy"],
    "AuditLogs": ["LogID", "Timestamp", "Username", "Role", "ActionType", "ActionDetails", "IpAddress"]
  };

  for (let sheetName in sheetsDef) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    // ตั้งค่าหัวตารางหากเป็นชีตว่างใหม่
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(sheetsDef[sheetName]);
      // ปรับแต่งสไตล์หัวตารางเล็กน้อย
      sheet.getRange(1, 1, 1, sheetsDef[sheetName].length)
        .setFontWeight("bold")
        .setBackground("#0d9488")
        .setFontColor("#ffffff");
    }
  }
}

/**
 * กำหนดค่าตั้งค่าเริ่มต้นลงชีต Settings
 */
function initializeDefaultSettings(ss) {
  const sheet = ss.getSheetByName("Settings");
  const defaultSettings = [
    ["ORGANIZATION_NAME", "หน่วยงานตัวอย่าง", "ชื่อหน่วยงานแบบเต็ม"],
    ["ORGANIZATION_SHORT_NAME", "หน่วยงานย่อย", "ชื่อย่อหน่วยงาน"],
    ["ORGANIZATION_TYPE", "สำนักงาน", "ประเภทหน่วยงาน เช่น โรงเรียน, บริษัท, คลินิก"],
    ["SYSTEM_NAME", "ระบบเวชระเบียนและงานสุขภาพประจำหน่วยงาน", "ชื่อระบบแบบเต็ม"],
    ["SYSTEM_SHORT_NAME", "HRHS", "ชื่อย่อระบบ"],
    ["HEALTH_UNIT_NAME", "งานสุขภาพและห้องพยาบาล", "ชื่อฝ่าย/ห้องพยาบาลที่รับผิดชอบ"],
    ["ADMIN_NAME", "ผู้ดูแลระบบ", "ชื่อ-นามสกุล ผู้ดูแลระบบหลัก"],
    ["ADMIN_POSITION", "เจ้าหน้าที่ดูแลระบบ", "ตำแหน่งผู้ดูแลระบบหลัก"],
    ["ORGANIZATION_ADDRESS", "123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110", "ที่อยู่หน่วยงาน"],
    ["ORGANIZATION_PHONE", "02-123-4567", "เบอร์โทรศัพท์ติดต่อ"],
    ["ORGANIZATION_EMAIL", "health@organization.com", "อีเมลติดต่อ"],
    ["FISCAL_YEAR", "2569", "ปีงบประมาณปัจจุบัน"],
    ["ACADEMIC_YEAR", "2569", "ปีการศึกษา (ถ้ามี)"],
    ["SEMESTER", "1", "ภาคการศึกษา (ถ้ามี)"],
    ["RECIPIENT_LABEL", "ผู้รับบริการ", "ชื่อเรียกผู้รับบริการ (เช่น พนักงาน, นักเรียน, ผู้ป่วย)"],
    ["CONTACT_LABEL", "ผู้ติดต่อ", "ชื่อเรียกผู้ติดต่อ/ญาติ (เช่น ผู้ปกครอง, ญาติ, ผู้ติดต่อฉุกเฉิน)"],
    ["GROUP_LABEL", "กลุ่ม/แผนก", "ชื่อเรียกกลุ่มหรือสังกัด (เช่น ชั้นเรียน, ฝ่าย, กอง)"],
    ["LEVEL_LABEL", "ระดับ/แผนกย่อย", "ชื่อเรียกย่อย (เช่น ห้องเรียน, แผนก, กองย่อย)"],
    ["VISIT_PREFIX", "VIS", "คำนำหน้าเลขเวชระเบียนการเข้ารับบริการ"],
    ["DISPENSE_PREFIX", "DISP", "คำนำหน้าเลขการจ่ายยา"],
    ["REFERRAL_PREFIX", "REF", "คำนำหน้าเลขส่งต่อการรักษา"],
    ["FOLLOWUP_PREFIX", "FOL", "คำนำหน้าเลขติดตามอาการ"],
    ["EXPIRY_WARNING_DAYS", "90", "จำนวนวันแจ้งเตือนยาก่อนหมดอายุ"],
    ["FREQUENT_VISIT_COUNT", "3", "จำนวนครั้งที่เข้ารับบริการในเดือนที่ถือว่าบ่อย"],
    ["MEDICINE_MODULE_ENABLED", "TRUE", "เปิดใช้งานระบบสต็อกและจ่ายยา (TRUE/FALSE)"],
    ["REFERRAL_MODULE_ENABLED", "TRUE", "เปิดใช้งานระบบส่งต่อ (TRUE/FALSE)"],
    ["FOLLOWUP_MODULE_ENABLED", "TRUE", "เปิดใช้งานระบบติดตามอาการ (TRUE/FALSE)"],
    ["DEMO_ENABLED", "TRUE", "เปิดใช้งานโหมดทดลอง (TRUE/FALSE)"],
    ["SHOW_LOGO", "FALSE", "แสดงโลโก้บนหัวเอกสาร (TRUE/FALSE)"],
    ["PRINT_HEADER_TEXT", "บันทึกการเข้ารับบริการและส่งตัวสุขภาพ", "ข้อความส่วนหัวเอกสารรายงาน"],
    ["PRINT_FOOTER_TEXT", "เอกสารนี้สร้างขึ้นโดยระบบเวชระเบียนอัตโนมัติประจำหน่วยงาน", "ข้อความท้ายเอกสารรายงาน"],
    ["TELEGRAM_BOT_TOKEN", "", "โทเค็น Telegram Bot สำหรับส่งการแจ้งเตือน (เก็บหลังบ้าน)"],
    ["TELEGRAM_CHAT_ID", "", "ไอดีห้องแชท Telegram สำหรับส่งการแจ้งเตือน (เก็บหลังบ้าน)"],
    ["GOOGLE_FORM_ID", "", "ไอดี Google Form รับคำตอบ (เก็บหลังบ้าน)"],
    ["GOOGLE_SLIDES_TEMPLATE_ID", "", "ไอดี Google Slides สำหรับออกเอกสารตรวจรักษา (เก็บหลังบ้าน)"]
  ];

  // อ่านข้อมูลเดิมเพื่อไม่ให้บันทึกซ้ำ
  const existingValues = sheet.getDataRange().getValues();
  const existingKeys = existingValues.slice(1).map(row => row[0]);

  const timestamp = new Date();
  for (let i = 0; i < defaultSettings.length; i++) {
    const key = defaultSettings[i][0];
    if (existingKeys.indexOf(key) === -1) {
      sheet.appendRow([key, defaultSettings[i][1], defaultSettings[i][2], timestamp, "SYSTEM"]);
    }
  }
}

/**
 * สร้างบัญชี admin เริ่มต้น
 */
function initializeAdminUser(ss) {
  const sheet = ss.getSheetByName("Users");
  const values = sheet.getDataRange().getValues();
  const usernames = values.slice(1).map(row => row[0]);
  
  if (usernames.indexOf("admin") === -1) {
    const passwordHash = hashPassword("1234");
    sheet.appendRow(["admin", passwordHash, "ADMIN", "ผู้ดูแลระบบหลัก", true, new Date(), false]);
  }
}

/**
 * ฟังก์ชันแฮชรหัสผ่านด้วย SHA-256
 */
function hashPassword(password) {
  const salt = "AGY_MEDREC_SALT_2026";
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt, Utilities.Charset.UTF_8);
  let hashStr = "";
  for (let i = 0; i < digest.length; i++) {
    let byteVal = digest[i];
    if (byteVal < 0) byteVal += 256;
    let byteStr = byteVal.toString(16);
    if (byteStr.length === 1) byteStr = "0" + byteStr;
    hashStr += byteStr;
  }
  return hashStr;
}

/**
 * บันทึกประวัติการใช้งานระบบ (Audit Log)
 */
function writeAuditLog(ss, username, role, actionType, actionDetails) {
  try {
    const activeSs = ss || getSpreadsheet();
    const sheet = activeSs.getSheetByName("AuditLogs");
    if (sheet) {
      const logId = "LOG-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
      sheet.appendRow([
        logId,
        new Date(),
        username,
        role,
        actionType,
        actionDetails,
        "" // IP Address (จะถูกเว้นไว้เนื่องจาก Apps Script ทำงานฝั่ง Server)
      ]);
    }
  } catch (err) {
    Logger.log("ไม่สามารถบันทึก Audit Log: " + err.message);
  }
}

/**
 * สร้าง ID อัตโนมัติและป้องกันชนกันโดยใช้ LockService
 */
function generateId(prefix, sheetName) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // รอคิวกดล็อก 10 วินาที
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    const lastRow = sheet.getLastRow();
    
    const yearTh = (new Date().getFullYear() + 543).toString().substring(2);
    let count = 1;
    
    if (lastRow > 1) {
      // ดึง ID ล่าสุดมาดูเพื่อสร้างลำดับต่อ
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(row => row[0]);
      let maxNum = 0;
      for (let i = 0; i < ids.length; i++) {
        const id = String(ids[i]);
        if (id.startsWith(prefix + "-" + yearTh)) {
          const parts = id.split("-");
          if (parts.length === 3) {
            const num = parseInt(parts[2], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      }
      count = maxNum + 1;
    }
    
    const countStr = ("00000" + count).slice(-5);
    return prefix + "-" + yearTh + "-" + countStr;
  } finally {
    lock.releaseLock();
  }
}

/**
 * ตรวจสอบความถูกต้องของ Input เพื่อป้องกัน HTML Injection / XSS
 */
function sanitizeInput(input) {
  if (typeof input !== "string") return input;
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * จัดรูปแบบวันที่ให้เป็นภาษาไทย
 */
function formatDateThai(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const thMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const day = date.getDate();
  const month = thMonths[date.getMonth()];
  const year = date.getFullYear() + 543;
  return day + " " + month + " " + year;
}

// ==========================================
// ส่วนจัดการสิทธิ์การเข้าสู่ระบบและเซสชัน
// ==========================================

/**
 * เข้าสู่ระบบ
 */
function loginUser(username, password) {
  username = sanitizeInput(username).trim().toLowerCase();
  
  const ss = getSpreadsheet();
  const usersSheet = ss.getSheetByName("Users");
  const users = usersSheet.getDataRange().getValues();
  
  let targetUser = null;
  const hash = hashPassword(password);
  
  for (let i = 1; i < users.length; i++) {
    if (users[i][0].toLowerCase() === username && users[i][1] === hash) {
      targetUser = {
        username: users[i][0],
        role: users[i][2],
        fullName: users[i][3],
        isActive: users[i][4]
      };
      break;
    }
  }
  
  if (!targetUser) {
    throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }
  
  if (!targetUser.isActive) {
    throw new Error("บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน");
  }
  
  // ตรวจสอบกรณีเป็นบัญชี Demo แต่ Demo ถูกปิดการใช้งานอยู่
  if (targetUser.role === "DEMO" && !isDemoEnabled()) {
    throw new Error("ระบบโหมดทดลองใช้ถูกปิดอยู่ในขณะนี้ ไม่สามารถเข้าสู่ระบบด้วยบัญชี demo ได้");
  }
  
  // สร้าง Session Token
  const sessionToken = "SES-" + Utilities.getUuid();
  const sessionsSheet = ss.getSheetByName("Sessions");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
  
  sessionsSheet.appendRow([sessionToken, targetUser.username, targetUser.role, now, expiresAt]);
  writeAuditLog(ss, targetUser.username, targetUser.role, "LOGIN", "เข้าสู่ระบบสำเร็จ");
  
  return {
    success: true,
    sessionToken: sessionToken,
    username: targetUser.username,
    role: targetUser.role,
    fullName: targetUser.fullName
  };
}

/**
 * ตรวจสอบและยืดอายุ Session
 */
function validateSession(sessionToken) {
  if (!sessionToken) throw new Error("จำเป็นต้องมี Session Token");
  
  const ss = getSpreadsheet();
  const sessionsSheet = ss.getSheetByName("Sessions");
  const sessions = sessionsSheet.getDataRange().getValues();
  const now = new Date();
  
  let sessionIndex = -1;
  let targetSession = null;
  
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i][0] === sessionToken) {
      const expiresAt = new Date(sessions[i][4]);
      if (expiresAt > now) {
        targetSession = {
          sessionToken: sessions[i][0],
          username: sessions[i][1],
          role: sessions[i][2]
        };
        sessionIndex = i + 1; // 1-indexed row number
        break;
      }
    }
  }
  
  if (!targetSession) {
    throw new Error("เซสชันหมดอายุหรือไม่มีอยู่จริง กรุณาเข้าสู่ระบบใหม่");
  }
  
  // ตรวจสอบสิทธิ์บัญชีเดโม หากโหมดทดลองถูกปิดอยู่
  if (targetSession.role === "DEMO" && !isDemoEnabled()) {
    // ลบเซสชันออก
    if (sessionIndex !== -1) {
      sessionsSheet.deleteRow(sessionIndex);
    }
    throw new Error("โหมดทดลองใช้งานถูกปิดแล้ว เซสชันนี้จึงถูกยกเลิก");
  }
  
  // อัปเดตเวลาหมดอายุของเซสชัน
  const newExpires = new Date(now.getTime() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
  sessionsSheet.getRange(sessionIndex, 5).setValue(newExpires);
  
  return targetSession;
}

/**
 * ออกจากระบบ
 */
function logoutUser(sessionToken) {
  if (!sessionToken) return { success: true };
  
  const ss = getSpreadsheet();
  const sessionsSheet = ss.getSheetByName("Sessions");
  const sessions = sessionsSheet.getDataRange().getValues();
  
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i][0] === sessionToken) {
      writeAuditLog(ss, sessions[i][1], sessions[i][2], "LOGOUT", "ออกจากระบบ");
      sessionsSheet.deleteRow(i + 1);
      break;
    }
  }
  return { success: true };
}

/**
 * ดึงข้อมูลผู้ใช้ปัจจุบัน
 */
function getCurrentUser(sessionToken) {
  const session = validateSession(sessionToken);
  const ss = getSpreadsheet();
  const usersSheet = ss.getSheetByName("Users");
  const users = usersSheet.getDataRange().getValues();
  
  for (let i = 1; i < users.length; i++) {
    if (users[i][0] === session.username) {
      return {
        username: users[i][0],
        role: users[i][2],
        fullName: users[i][3],
        isActive: users[i][4]
      };
    }
  }
  throw new Error("ไม่พบข้อมูลผู้ใช้งาน");
}

// ==========================================
// ส่วนควบคุมและข้อมูลระบบทดลอง (Demo Mode)
// ==========================================

/**
 * ตรวจสอบว่าโหมดทดลองเปิดใช้งานอยู่หรือไม่จาก Settings
 */
function isDemoEnabled() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName("Settings");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === "DEMO_ENABLED") {
        return data[i][1] === "TRUE" || data[i][1] === true;
      }
    }
  } catch (err) {
    // กรณีที่ชีตยังไม่พร้อม
  }
  return false;
}

/**
 * ดึงสถานะข้อมูล Demo สำหรับแสดงในหน้าตั้งค่า
 */
function getDemoStatus(sessionToken) {
  const session = validateSession(sessionToken);
  const ss = getSpreadsheet();
  
  const enabled = isDemoEnabled();
  const stats = {};
  
  const sheetsToInspect = [
    "ServiceRecipients", "Visits", "Vitals", "Assessments", 
    "Treatments", "Medicines", "Dispensing", "InventoryTransactions", 
    "ContactNotifications", "Referrals", "FollowUps"
  ];
  
  sheetsToInspect.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      stats[sheetName] = 0;
      return;
    }
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      stats[sheetName] = 0;
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const isDemoIdx = headers.indexOf("IsDemo");
    if (isDemoIdx === -1) {
      stats[sheetName] = 0;
      return;
    }
    
    let demoCount = 0;
    for (let i = 1; i < data.length; i++) {
      const val = data[i][isDemoIdx];
      if (val === true || val === "TRUE" || String(val).toUpperCase() === 'TRUE') {
        demoCount++;
      }
    }
    stats[sheetName] = demoCount;
  });
  
  return {
    demoEnabled: enabled,
    stats: stats
  };
}

/**
 * ล็อกอินบัญชีเดโมอัตโนมัติ
 */
function loginDemoUser() {
  if (!isDemoEnabled()) {
    throw new Error("โหมดทดลองถูกปิดการใช้งานโดยผู้ดูแลระบบ ไม่สามารถทดลองใช้งานได้");
  }
  
  const ss = getSpreadsheet();
  ensureDemoUser(ss);
  
  return loginUser("demo", "1234");
}

/**
 * ตรวจสอบและสร้างบัญชี Demo หากยังไม่มี
 */
function ensureDemoUser(ss) {
  const sheet = ss.getSheetByName("Users");
  const values = sheet.getDataRange().getValues();
  const usernames = values.slice(1).map(row => row[0]);
  
  const index = usernames.indexOf("demo");
  if (index === -1) {
    const passwordHash = hashPassword("1234");
    sheet.appendRow(["demo", passwordHash, "DEMO", "บัญชีทดลองใช้งาน", true, new Date(), true]);
  } else {
    // เปิดใช้งานบัญชีเดโมหากเคยถูกระงับ
    const rowNum = index + 2;
    sheet.getRange(rowNum, 5).setValue(true); // IsActive = true
  }
}

/**
 * เปิดการทำงานของระบบเดโม (ADMIN เท่านั้น)
 */
function enableDemoMode(sessionToken) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") throw new Error("สิทธิ์ไม่เพียงพอ เฉพาะผู้ดูแลระบบเท่านั้น");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === "DEMO_ENABLED") {
      sheet.getRange(i + 1, 2).setValue("TRUE");
      sheet.getRange(i + 1, 4).setValue(new Date());
      sheet.getRange(i + 1, 5).setValue(session.username);
      break;
    }
  }
  
  ensureDemoUser(ss);
  writeAuditLog(ss, session.username, session.role, "DEMO_TOGGLE", "เปิดการทำงานโหมดทดลอง (Demo Enabled)");
  return { success: true, message: "เปิดการทำงานโหมดทดลองเรียบร้อยแล้ว" };
}

/**
 * ปิดการทำงานของระบบเดโม (ADMIN เท่านั้น)
 */
function disableDemoMode(sessionToken) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") throw new Error("สิทธิ์ไม่เพียงพอ เฉพาะผู้ดูแลระบบเท่านั้น");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === "DEMO_ENABLED") {
      sheet.getRange(i + 1, 2).setValue("FALSE");
      sheet.getRange(i + 1, 4).setValue(new Date());
      sheet.getRange(i + 1, 5).setValue(session.username);
      break;
    }
  }
  
  // ระงับการใช้งานบัญชีเดโมชั่วคราว
  const usersSheet = ss.getSheetByName("Users");
  const users = usersSheet.getDataRange().getValues();
  for (let i = 1; i < users.length; i++) {
    if (users[i][0] === "demo") {
      usersSheet.getRange(i + 1, 5).setValue(false); // IsActive = false
      break;
    }
  }
  
  // ลบเซสชันที่เชื่อมต่อด้วยบัญชีเดโมทั้งหมด
  const sessionsSheet = ss.getSheetByName("Sessions");
  const sessions = sessionsSheet.getDataRange().getValues();
  for (let i = sessions.length - 1; i >= 1; i--) {
    if (sessions[i][2] === "DEMO") {
      sessionsSheet.deleteRow(i + 1);
    }
  }
  
  writeAuditLog(ss, session.username, session.role, "DEMO_TOGGLE", "ปิดการทำงานโหมดทดลอง (Demo Disabled)");
  return { success: true, message: "ปิดการทำงานโหมดทดลองเรียบร้อยแล้ว บัญชี demo และเซสชันทั้งหมดจะใช้การไม่ได้" };
}

/**
 * ล้างข้อมูลการทำธุรกรรมที่เป็น Demo (IsDemo = TRUE) ทั้งหมดในทุกตาราง (ADMIN เท่านั้น)
 */
function clearDemoData(sessionToken, confirmationText) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") throw new Error("สิทธิ์ไม่เพียงพอ เฉพาะผู้ดูแลระบบเท่านั้น");
  
  if (confirmationText !== "ล้างข้อมูลทดลอง") {
    throw new Error("ข้อความยืนยันการล้างข้อมูลไม่ถูกต้อง กรุณาพิมพ์ว่า 'ล้างข้อมูลทดลอง'");
  }
  
  const ss = getSpreadsheet();
  const sheetsToClear = [
    "ServiceRecipients", "Visits", "Vitals", "Assessments", 
    "Treatments", "Medicines", "Dispensing", "InventoryTransactions", 
    "ContactNotifications", "Referrals", "FollowUps", "Attachments"
  ];
  
  const report = {};
  sheetsToClear.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const deletedCount = clearDemoRows(sheet, "IsDemo");
      report[sheetName] = deletedCount;
    } else {
      report[sheetName] = 0;
    }
  });
  
  writeAuditLog(ss, session.username, session.role, "DEMO_CLEARED", "ล้างข้อมูลทดลองทั้งหมด รายละเอียด: " + JSON.stringify(report));
  return { success: true, report: report };
}

/**
 * ลบแถวเฉพาะ IsDemo = TRUE จากชีต โดยไม่กระทบโครงสร้างและข้อมูลจริง
 */
function clearDemoRows(sheet, isDemoColumnName) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(1, 1, lastRow, lastCol);
  const values = range.getValues();
  const headers = values[0];
  const isDemoIndex = headers.indexOf(isDemoColumnName);
  if (isDemoIndex === -1) return 0;
  
  const newValues = [headers];
  let deletedCount = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const isDemoVal = row[isDemoIndex];
    if (isDemoVal === true || isDemoVal === "TRUE" || String(isDemoVal).toUpperCase() === 'TRUE') {
      deletedCount++;
    } else {
      newValues.push(row);
    }
  }
  
  if (deletedCount > 0) {
    sheet.getRange(1, 1, newValues.length, headers.length).setValues(newValues);
    const remainingRows = newValues.length;
    const rowsToDelete = lastRow - remainingRows;
    if (rowsToDelete > 0) {
      sheet.deleteRows(remainingRows + 1, rowsToDelete);
    }
  }
  return deletedCount;
}

/**
 * รีเซ็ตข้อมูล Demo ทั้งหมด (ลบของเก่าทิ้งแล้วสร้างใหม่) (ADMIN เท่านั้น)
 */
function resetDemoData(sessionToken, confirmationText) {
  clearDemoData(sessionToken, confirmationText);
  return initializeDemoData(sessionToken);
}

/**
 * สร้างข้อมูล Demo ตัวอย่าง (อย่างน้อย 5 คน ประวัติ ข้อมูลยา และการเข้ารับบริการ)
 */
function initializeDemoData(sessionToken) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") throw new Error("สิทธิ์ไม่เพียงพอ เฉพาะผู้ดูแลระบบเท่านั้น");
  if (!isDemoEnabled()) throw new Error("กรุณาเปิดโหมดทดลองใช้งานก่อนสร้างข้อมูลตัวอย่าง");
  
  const ss = getSpreadsheet();
  const timestamp = new Date();
  
  // 1. เพิ่มยาตัวอย่างในสต็อก Medicines
  const medicinesSheet = ss.getSheetByName("Medicines");
  const initialMedicines = [
    ["MED-DEMO-001", "Paracetamol 500mg", "ยาระงับปวด/ยาลดไข้", "เม็ด", "500 mg", "เม็ด", 500, 100, "LOT-DEMO-A1", timestamp, new Date(timestamp.getTime() + 365*24*60*60*1000), "ตู้ยา 1 ชั้น 1", "ทานหลังอาหารทุก 4-6 ชม. เวลาจำเป็น", "Active", true, "admin", timestamp, "admin", timestamp],
    ["MED-DEMO-002", "Chlorpheniramine 4mg (CPM)", "ยาแก้แพ้/ลดน้ำมูก", "เม็ด", "4 mg", "เม็ด", 200, 50, "LOT-DEMO-A2", timestamp, new Date(timestamp.getTime() + 180*24*60*60*1000), "ตู้ยา 1 ชั้น 2", "ทานหลังอาหารครั้งละ 1 เม็ด วันละ 3 ครั้ง หรือเมื่อมีอาการ ง่วงนอน", "Active", true, "admin", timestamp, "admin", timestamp],
    ["MED-DEMO-003", "ORS ผงเกลือแร่", "ยาทางเดินอาหาร", "ซอง", "250 ml", "ซอง", 100, 20, "LOT-DEMO-B1", timestamp, new Date(timestamp.getTime() + 730*24*60*60*1000), "ตู้ยา 2 ชั้น 1", "ละลายน้ำต้มสุก จิบเพื่อทดแทนน้ำที่เสียจากอาการท้องเสีย", "Active", true, "admin", timestamp, "admin", timestamp],
    ["MED-DEMO-004", "Amoxicillin 250mg", "ยาฆ่าเชื้อ/ยาปฏิชีวนะ", "แคปซูล", "250 mg", "เม็ด", 150, 40, "LOT-DEMO-C1", timestamp, new Date(timestamp.getTime() - 10*24*60*60*1000), "ตู้ยา 1 ชั้น 3", "ทานหลังอาหารเช้า กลางวัน เย็น ก่อนนอน ติดต่อกันจนยาหมด", "Active", true, "admin", timestamp, "admin", timestamp], // ยาหมดอายุ
    ["MED-DEMO-005", "Air-X ยาลดกรดแก้ท้องอืด", "ยาทางเดินอาหาร", "เม็ด", "80 mg", "เม็ด", 8, 10, "LOT-DEMO-D1", timestamp, new Date(timestamp.getTime() + 90*24*60*60*1000), "ตู้ยา 2 ชั้น 2", "เคี้ยวให้ละเอียดก่อนกลืน ทานเมื่อมีอาการท้องอืดท้องเฟ้อ", "Active", true, "admin", timestamp, "admin", timestamp] // ยาใกล้หมดสต็อก
  ];
  
  initialMedicines.forEach(med => {
    medicinesSheet.appendRow([
      generateId("MED", "Medicines"),
      med[0], med[1], med[2], med[3], med[4], med[5], med[6], med[7], med[8], med[9], med[10], med[11], med[12], med[13], med[14], med[15], med[16], med[17], med[18]
    ]);
  });
  
  // 2. เพิ่มผู้รับบริการตัวอย่างอย่างน้อย 5 ราย
  const recipientSheet = ss.getSheetByName("ServiceRecipients");
  const recipients = [
    ["1-1002-88741-99-1", "นาย", "สมชาย", "รักดี", "ชาย", "ชาย", "2000-01-15", 26, "พนักงาน/บุคลากร", "ฝ่ายขาย", "แผนกกรุงเทพฯ", "สำนักงานใหญ่", "-", "1", "O", 65, 172, "โรคความดันโลหิตสูง", "Penicillin", "อาหารทะเล", "-", "ยาลดความดันโลหิต", "หลีกเลี่ยงการออกกำลังกายหักโหม", "รพ.จุฬาลงกรณ์", "นางสมศรี รักดี", "มารดา", "081-123-4567", "นางสมศรี รักดี", "081-123-4567", "ข้อมูลสาธิตตัวอย่าง", "Active", true, timestamp, "admin", timestamp, "admin"],
    ["3-1002-00547-11-2", "นางสาว", "ใจดี", "จริงใจ", "หญิง", "หญิง", "2008-05-20", 18, "นักเรียน/นักศึกษา", "ม.6", "ห้อง 6/1", "มัธยมปลาย", "-", "15", "AB", 50, 160, "โรคหอบหืด", "Sulfa", "-", "ฝุ่นละออง/ขนแมว", "ยาพ่นหอบหืด", "งดออกกำลังกายกลางแจ้งช่วงฝุ่นหนา", "รพ.ศิริราช", "นายดำรง จริงใจ", "บิดา", "089-987-6543", "นายดำรง จริงใจ", "089-987-6543", "ข้อมูลสาธิตตัวอย่าง", "Active", true, timestamp, "admin", timestamp, "admin"],
    ["1-9908-00041-22-3", "เด็กชาย", "นที", "สายชล", "ชาย", "ชาย", "2015-08-30", 10, "เด็กเล็ก/อนุบาล", "ป.4", "ห้อง 4/2", "ประถมปลาย", "-", "5", "B", 35, 138, "-", "Paracetamol (เคยมีผื่นขึ้น)", "ถั่วลิสง", "-", "-", "-", "รพ.รามาธิบดี", "นางสายธาร สายชล", "มารดา", "085-555-5555", "นางสายธาร สายชล", "085-555-5555", "ประวัติตัวแทนการแพ้ยาลดไข้พาราเซตามอล", "Active", true, timestamp, "admin", timestamp, "admin"],
    ["1-2201-00031-44-1", "นาง", "สมร", "ใจเย็น", "หญิง", "หญิง", "1950-12-10", 75, "ผู้สูงอายุ", "กลุ่มบี", "บ้านพัก 2", "ส่วนการดูแลพิเศษ", "-", "2", "A", 58, 155, "เบาหวาน, ไขมันในเลือดสูง", "-", "-", "-", "ยาลดน้ำตาล, ยาลดไขมัน", "ระมัดระวังการเดิน ป้องกันการหกล้ม", "รพ.พระมงกุฎเกล้า", "นายวิชัย ใจเย็น", "บุตรชาย", "082-222-3333", "นายวิชัย ใจเย็น", "082-222-3333", "ข้อมูลจำลองผู้สูงอายุ", "Active", true, timestamp, "admin", timestamp, "admin"],
    ["3-4402-99933-22-4", "นาย", "กิตติ", "มุ่งมั่น", "ชาย", "ชาย", "1995-10-05", 30, "พนักงาน/บุคลากร", "ฝ่ายผลิต", "กะเช้า", "ไลน์การผลิต 1", "-", "104", "O", 78, 178, "-", "-", "-", "-", "-", "-", "รพ.นพรัตนราชธานี", "นางอารี มุ่งมั่น", "ภรรยา", "084-444-5555", "นางอารี มุ่งมั่น", "084-444-5555", "ข้อมูลจำลองพนักงานโรงงาน", "Active", true, timestamp, "admin", timestamp, "admin"]
  ];
  
  const createdRecipients = [];
  recipients.forEach(rep => {
    const id = generateId("REC", "ServiceRecipients");
    recipientSheet.appendRow([
      id, rep[0], rep[1], rep[2], rep[3], rep[4], rep[5], rep[6], rep[7], rep[8], rep[9], rep[10], rep[11], rep[12], rep[13], rep[14], rep[15], rep[16], rep[17], rep[18], rep[19], rep[20], rep[21], rep[22], rep[23], rep[24], rep[25], rep[26], rep[27], rep[28], rep[29], rep[30], rep[31], rep[32], rep[33], rep[34], rep[35]
    ]);
    createdRecipients.push({
      id: id,
      fullName: rep[1] + rep[2] + " " + rep[3],
      type: rep[8],
      group: rep[9],
      dept: rep[10]
    });
  });
  
  // 3. เพิ่มประวัติการตรวจรักษาสาธิต (Visits, Vitals, Assessments, Treatments, Dispensing)
  const visitsSheet = ss.getSheetByName("Visits");
  const vitalsSheet = ss.getSheetByName("Vitals");
  const assessmentsSheet = ss.getSheetByName("Assessments");
  const treatmentsSheet = ss.getSheetByName("Treatments");
  const dispensingSheet = ss.getSheetByName("Dispensing");
  
  // เคสที่ 1: นายสมชาย รักดี ปวดหัว ตัวร้อน มีไข้
  const visitId1 = generateId("VIS", "Visits");
  const rep1 = createdRecipients[0];
  visitsSheet.appendRow([
    visitId1, timestamp, "09:00", "09:30", rep1.id, rep1.fullName, rep1.type, rep1.group, rep1.dept,
    "ตนเอง", "โต๊ะทำงาน", "ปฏิบัติงานปกติ", "เจ็บป่วยทั่วไป", "มีไข้ต่ำๆ และปวดศีรษะมา 1 วัน", "ปวดศีรษะ ตึบๆ รอบกระบอกตา", "Green",
    "ประเมินพบอุณหภูมิร่างกาย 37.8 C ความดันปกติ", "อาการดีขึ้น กลับไปปฏิบัติกิจกรรม", "NO", "NO", "NO", "Closed", true, "admin", timestamp
  ]);
  
  vitalsSheet.appendRow([
    "VIT-" + new Date().getTime() + "-1", visitId1, rep1.id, timestamp, 37.8, 65, 172, 120, 80, 84, 18, 98, 3, "รู้สึกตัวดี", "ไข้ต่ำๆ", true
  ]);
  
  assessmentsSheet.appendRow([
    "ASM-" + new Date().getTime() + "-1", visitId1, rep1.id, timestamp, "พบประวัติเป็นความดันสูง มีอาการปวดศีรษะร่วมด้วย น่าจะเป็นไข้หวัดทั่วไป", "Tension Headache / Mild Fever", true
  ]);
  
  treatmentsSheet.appendRow([
    "TRT-" + new Date().getTime() + "-1", visitId1, rep1.id, timestamp, "ให้นอนพักผ่อนในห้องพยาบาล 30 นาที และจ่ายยาลดไข้", "นอนพักห้องพยาบาล 30 นาที", true
  ]);
  
  // ค้นหายา Paracetamol (ตัวแทน MED-DEMO-001) และทำรายการจ่ายยา
  let paraId = "";
  const medRows = medicinesSheet.getDataRange().getValues();
  for (let i = 1; i < medRows.length; i++) {
    if (medRows[i][1] === "MED-DEMO-001") {
      paraId = medRows[i][0];
      // ตัดสต็อกยาออก 10 เม็ด
      medicinesSheet.getRange(i + 1, 8).setValue(medRows[i][7] - 10);
      break;
    }
  }
  
  if (paraId) {
    dispensingSheet.appendRow([
      generateId("DISP", "Dispensing"), visitId1, rep1.id, paraId, "Paracetamol 500mg", 10, "รับประทานครั้งละ 1-2 เม็ด ทุก 4-6 ชั่วโมง เมื่อมีอาการปวดหรือไข้", "admin", timestamp, "Completed", true
    ]);
    
    // บันทึกธุรกรรมสินค้าคงคลัง
    ss.getSheetByName("InventoryTransactions").appendRow([
      "TXN-" + new Date().getTime() + "-1", paraId, "Dispense", 10, 500, 490, visitId1, "จ่ายยาในเวชระเบียน", timestamp, "admin", true
    ]);
  }
  
  // เคสที่ 2: นางสาวใจดี จริงใจ หอบหืดกำเริบ ส่งต่อโรงพยาบาล
  const visitId2 = generateId("VIS", "Visits");
  const rep2 = createdRecipients[1];
  visitsSheet.appendRow([
    visitId2, timestamp, "13:15", "13:45", rep2.id, rep2.fullName, rep2.type, rep2.group, rep2.dept,
    "เพื่อนร่วมชั้น", "สนามกีฬา", "เล่นพละศึกษา", "อุบัติเหตุ/เจ็บป่วยรุนแรง", "หายใจลำบาก หอบเหนื่อย ไอ", "มีเสียงวี้ดขณะหายใจ หอบชัดเจน", "Red",
    "อุณหภูมิร่างกายปกติ แต่หายใจเร็ว 26 ครั้ง/นาที ออกซิเจนปลายนิ้ว 92% ต่ำกว่าปกติ", "ส่งต่อสถานพยาบาล", "YES", "YES", "YES", "Closed", true, "admin", timestamp
  ]);
  
  vitalsSheet.appendRow([
    "VIT-" + new Date().getTime() + "-2", visitId2, rep2.id, timestamp, 36.5, 50, 160, 110, 70, 110, 26, 92, 5, "กระสับกระส่าย", "หายใจเหนื่อยหอบ", true
  ]);
  
  assessmentsSheet.appendRow([
    "ASM-" + new Date().getTime() + "-2", visitId2, rep2.id, timestamp, "อาการหอบหืดกำเริบเฉียบพลันหลังเล่นกิจกรรมพละ ออกซิเจนเริ่มต่ำ", "Acute Asthma Attack", true
  ]);
  
  treatmentsSheet.appendRow([
    "TRT-" + new Date().getTime() + "-2", visitId2, rep2.id, timestamp, "ให้พ่นยาพ่นพกพาประตัวของตัวเอง 2 พัฟส์ ให้ออกซิเจนแคนนูลา 3 LPM", "ให้ออกซิเจนและประเมินเพื่อส่งต่อด่วน", true
  ]);
  
  // บันทึกการแจ้งผู้ติดต่อ (ContactNotifications)
  const contactSheet = ss.getSheetByName("ContactNotifications");
  contactSheet.appendRow([
    "NTF-" + new Date().getTime() + "-1", visitId2, rep2.id, "นายดำรง จริงใจ", "บิดา", "089-987-6543", "โทรศัพท์", true,
    "แจ้งว่านักเรียนหอบหืดกำเริบ กำลังนำส่งโรงพยาบาลศิริราชทางรถโรงเรียน", "รับทราบ กำลังรีบเดินทางไปที่โรงพยาบาลศิริราช", "YES", "14:15", timestamp, "admin", true
  ]);
  
  // บันทึกการส่งตัว (Referrals)
  const referralSheet = ss.getSheetByName("Referrals");
  referralSheet.appendRow([
    generateId("REF", "Referrals"), visitId2, rep2.id, "หายใจลำบาก หอบเหนื่อย ไอ จากหอบหืดกำเริบ", "T:36.5, BP:110/70, P:110, RR:26, O2Sat:92%", "พ่นยาแก้หอบ 2 พัฟส์ ให้ออกซิเจน 3 LPM", "-", "อาการยังไม่ทุเลา ออกซิเจนปลายมือ 92% จำเป็นต้องพบแพทย์ด่วน", "โรงพยาบาลศิริราช", "รถพยาบาล/รถฉุกเฉินหน่วยงาน", "พยาบาลประจำห้องพยาบาล", true, timestamp, "จัดเตรียมใบส่งตัวเรียบร้อย", "Completed", true, timestamp, "admin"
  ]);
  
  // บันทึกนัดติดตามอาการ (FollowUps)
  const followUpSheet = ss.getSheetByName("FollowUps");
  followUpSheet.appendRow([
    generateId("FOL", "FollowUps"), visitId2, rep2.id, new Date(timestamp.getTime() + 2*24*60*60*1000), "Pending", "รอรับข้อมูลจากบิดาหลังไปพบแพทย์", "-", null, "-", "ติดตามอาการหลังออกจากโรงพยาบาลและกลับเข้าเรียน", "admin", true
  ]);
  
  writeAuditLog(ss, session.username, session.role, "DEMO_INITIALIZED", "สร้างข้อมูลตัวอย่างโหมดทดลองเรียบร้อยแล้ว");
  return { success: true, message: "สร้างข้อมูลตัวอย่างทดลองสำเร็จ ยา 5 รายการ, ผู้รับบริการ 5 ราย, ประวัติเข้ารับการรักษา 2 รายการเรียบร้อยแล้ว" };
}

// ==========================================
// ส่วนจัดการข้อมูลผู้ป่วย / ผู้รับบริการ (Service Recipients)
// ==========================================

/**
 * ค้นหาข้อมูลผู้รับบริการ
 */
function getServiceRecipients(sessionToken, filters) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("ServiceRecipients");
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const results = [];
  
  const isDemoIdx = headers.indexOf("IsDemo");
  const statusIdx = headers.indexOf("Status");
  const firstNameIdx = headers.indexOf("FirstName");
  const lastNameIdx = headers.indexOf("LastName");
  const recIdIdx = headers.indexOf("RecipientID");
  const recipientTypeIdx = headers.indexOf("RecipientType");
  const groupIdx = headers.indexOf("Group");
  const departmentIdx = headers.indexOf("Department");
  
  // ลำดับแถวเริ่มจาก 2 (ดัชนี 1)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // ตรวจสอบเงื่อนไขโหมดทดลอง/โหมดจริง
    const rowIsDemo = row[isDemoIdx] === true || row[isDemoIdx] === "TRUE" || String(row[isDemoIdx]).toUpperCase() === 'TRUE';
    if (isDemo !== rowIsDemo) continue;
    
    // สร้างออบเจกต์ข้อมูล
    const item = {};
    headers.forEach((header, idx) => {
      item[header] = row[idx];
    });
    
    // คัดกรองตัวกรอง (ถ้ามี)
    if (filters) {
      if (filters.search) {
        const q = String(filters.search).toLowerCase();
        const fullName = (String(row[firstNameIdx]) + " " + String(row[lastNameIdx])).toLowerCase();
        const nickname = String(row[headers.indexOf("Nickname")]).toLowerCase();
        const natId = String(row[headers.indexOf("NationalID")]).toLowerCase();
        const rId = String(row[recIdIdx]).toLowerCase();
        
        if (fullName.indexOf(q) === -1 && nickname.indexOf(q) === -1 && natId.indexOf(q) === -1 && rId.indexOf(q) === -1) {
          continue;
        }
      }
      if (filters.type && filters.type !== "All" && row[recipientTypeIdx] !== filters.type) {
        continue;
      }
      if (filters.group && filters.group !== "All" && row[groupIdx] !== filters.group) {
        continue;
      }
      if (filters.status && filters.status !== "All" && row[statusIdx] !== filters.status) {
        continue;
      }
    }
    
    results.push(item);
  }
  
  return results;
}

/**
 * ดึงข้อมูลผู้รับบริการด้วย ID และประวัติเวชระเบียน
 */
function getServiceRecipientById(sessionToken, id) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("ServiceRecipients");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const recIdIdx = headers.indexOf("RecipientID");
  const isDemoIdx = headers.indexOf("IsDemo");
  
  let recipient = null;
  for (let i = 1; i < data.length; i++) {
    if (data[i][recIdIdx] === id) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) {
        throw new Error("สิทธิ์การเข้าถึงข้อมูลไม่สอดคล้องกับโหมดการใช้งานปัจจุบัน");
      }
      
      recipient = {};
      headers.forEach((header, idx) => {
        recipient[header] = data[i][idx];
      });
      break;
    }
  }
  
  if (!recipient) {
    throw new Error("ไม่พบข้อมูลผู้รับบริการรายนี้");
  }
  
  // ดึงประวัติเวชระเบียนการเข้ารับบริการ
  const visitsSheet = ss.getSheetByName("Visits");
  const visitsData = visitsSheet.getLastRow() > 1 ? visitsSheet.getDataRange().getValues() : [];
  const visitsHeaders = visitsData[0] || [];
  const visits = [];
  
  const vRecIdIdx = visitsHeaders.indexOf("RecipientID");
  const vIsDemoIdx = visitsHeaders.indexOf("IsDemo");
  
  for (let i = 1; i < visitsData.length; i++) {
    if (visitsData[i][vRecIdIdx] === id) {
      const visitIsDemo = visitsData[i][vIsDemoIdx] === true || visitsData[i][vIsDemoIdx] === "TRUE" || String(visitsData[i][vIsDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo === visitIsDemo) {
        const visitItem = {};
        visitsHeaders.forEach((vh, idx) => {
          visitItem[vh] = visitsData[i][idx];
        });
        visits.push(visitItem);
      }
    }
  }
  
  // เรียงลำดับจากล่าสุุดไปหาเก่าสุด
  visits.sort((a, b) => new Date(b.VisitDate).getTime() - new Date(a.VisitDate).getTime());
  recipient.visits = visits;
  
  return recipient;
}

/**
 * เพิ่มหรือแก้ไขข้อมูลผู้รับบริการ
 */
function saveServiceRecipient(sessionToken, recipientData) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("ServiceRecipients");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const recIdIdx = headers.indexOf("RecipientID");
  const isDemoIdx = headers.indexOf("IsDemo");
  
  const isEdit = recipientData.RecipientID ? true : false;
  let targetRow = -1;
  
  // ทำความสะอาดข้อมูลความปลอดภัย
  for (let key in recipientData) {
    if (typeof recipientData[key] === "string") {
      recipientData[key] = sanitizeInput(recipientData[key]);
    }
  }
  
  if (isEdit) {
    // หาแถวที่จะทำการแก้ไข
    for (let i = 1; i < data.length; i++) {
      if (data[i][recIdIdx] === recipientData.RecipientID) {
        const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
        if (isDemo !== rowIsDemo) {
          throw new Error("ไม่สามารถแก้ไขข้อมูลโหมดที่ต่างจากบัญชีปัจจุบันได้");
        }
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) throw new Error("ไม่พบแถวข้อมูลที่จะแก้ไข");
  } else {
    // สร้าง ID ใหม่
    recipientData.RecipientID = generateId("REC", "ServiceRecipients");
  }
  
  const rowValues = [];
  headers.forEach(header => {
    switch (header) {
      case "RecipientID":
        rowValues.push(recipientData.RecipientID);
        break;
      case "IsDemo":
        rowValues.push(isDemo);
        break;
      case "CreatedAt":
        rowValues.push(isEdit ? data[targetRow - 1][headers.indexOf("CreatedAt")] : new Date());
        break;
      case "CreatedBy":
        rowValues.push(isEdit ? data[targetRow - 1][headers.indexOf("CreatedBy")] : session.username);
        break;
      case "UpdatedAt":
        rowValues.push(new Date());
        break;
      case "UpdatedBy":
        rowValues.push(session.username);
        break;
      case "Status":
        rowValues.push(recipientData.Status || "Active");
        break;
      default:
        rowValues.push(recipientData[header] !== undefined ? recipientData[header] : "");
    }
  });
  
  if (isEdit) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
    writeAuditLog(ss, session.username, session.role, "RECIPIENT_UPDATE", "แก้ไขข้อมูลผู้รับบริการ ID: " + recipientData.RecipientID);
  } else {
    sheet.appendRow(rowValues);
    writeAuditLog(ss, session.username, session.role, "RECIPIENT_CREATE", "เพิ่มผู้รับบริการใหม่ ID: " + recipientData.RecipientID);
  }
  
  return { success: true, id: recipientData.RecipientID, message: "บันทึกข้อมูลเรียบร้อยแล้ว" };
}

/**
 * อัปเดตสถานะของผู้รับบริการ (เช่น สั่งระงับหรือยกเลิกการเปิดใช้งานชั่วคราว)
 */
function updateServiceRecipientStatus(sessionToken, id, status) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("ServiceRecipients");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const recIdIdx = headers.indexOf("RecipientID");
  const isDemoIdx = headers.indexOf("IsDemo");
  const statusIdx = headers.indexOf("Status");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][recIdIdx] === id) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) throw new Error("ไม่ได้รับอนุญาต");
      
      sheet.getRange(i + 1, statusIdx + 1).setValue(status);
      sheet.getRange(i + 1, headers.indexOf("UpdatedAt") + 1).setValue(new Date());
      sheet.getRange(i + 1, headers.indexOf("UpdatedBy") + 1).setValue(session.username);
      
      writeAuditLog(ss, session.username, session.role, "RECIPIENT_STATUS", "อัปเดตสถานะผู้รับบริการ ID: " + id + " เป็น " + status);
      return { success: true, message: "อัปเดตสถานะเรียบร้อยแล้ว" };
    }
  }
  throw new Error("ไม่พบผู้รับบริการรายนี้");
}

// ==========================================
// ส่วนประวัติการเข้ารับบริการ (Visits) & สัญญาณชีพ (Vitals)
// ==========================================

/**
 * ดึงรายการการเข้ารับบริการ
 */
function getVisits(sessionToken, filters) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Visits");
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const results = [];
  
  const isDemoIdx = headers.indexOf("IsDemo");
  const dateIdx = headers.indexOf("VisitDate");
  const nameIdx = headers.indexOf("RecipientName");
  const complaintIdx = headers.indexOf("ChiefComplaint");
  const statusIdx = headers.indexOf("VisitStatus");
  const groupIdx = headers.indexOf("Group");
  const outcomeIdx = headers.indexOf("Outcome");
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowIsDemo = row[isDemoIdx] === true || row[isDemoIdx] === "TRUE" || String(row[isDemoIdx]).toUpperCase() === 'TRUE';
    
    if (isDemo !== rowIsDemo) continue;
    
    const item = {};
    headers.forEach((h, idx) => {
      item[h] = row[idx];
    });
    
    if (filters) {
      if (filters.search) {
        const q = String(filters.search).toLowerCase();
        if (String(row[nameIdx]).toLowerCase().indexOf(q) === -1 && 
            String(row[complaintIdx]).toLowerCase().indexOf(q) === -1 &&
            String(row[0]).toLowerCase().indexOf(q) === -1) {
          continue;
        }
      }
      if (filters.startDate) {
        const sD = new Date(filters.startDate);
        const vD = new Date(row[dateIdx]);
        // ตั้งเวลาเป็นศูนย์เพื่อคำนวณเฉพาะวันที่
        sD.setHours(0,0,0,0);
        vD.setHours(0,0,0,0);
        if (vD < sD) continue;
      }
      if (filters.endDate) {
        const eD = new Date(filters.endDate);
        const vD = new Date(row[dateIdx]);
        eD.setHours(23,59,59,999);
        vD.setHours(0,0,0,0);
        if (vD > eD) continue;
      }
      if (filters.status && filters.status !== "All" && row[statusIdx] !== filters.status) {
        continue;
      }
      if (filters.outcome && filters.outcome !== "All" && row[outcomeIdx] !== filters.outcome) {
        continue;
      }
    }
    results.push(item);
  }
  
  // เรียงลำดับจากล่าสุดไปหาเก่าสุด
  results.sort((a, b) => new Date(b.VisitDate + "T" + b.TimeIn).getTime() - new Date(a.VisitDate + "T" + a.TimeIn).getTime());
  
  return results;
}

/**
 * ดึงข้อมูลการเข้าบริการเชิงลึก พร้อมประวัติ Vital Sign, ประเมิน, สั่งยา
 */
function getVisitById(sessionToken, id) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const visitsSheet = ss.getSheetByName("Visits");
  const visits = visitsSheet.getDataRange().getValues();
  const visitsHeaders = visits[0];
  const visitIdIdx = visitsHeaders.indexOf("VisitID");
  const isDemoIdx = visitsHeaders.indexOf("IsDemo");
  
  let visit = null;
  for (let i = 1; i < visits.length; i++) {
    if (visits[i][visitIdIdx] === id) {
      const rowIsDemo = visits[i][isDemoIdx] === true || visits[i][isDemoIdx] === "TRUE" || String(visits[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) throw new Error("โหมดเข้าใช้งานไม่ได้รับสิทธิ์");
      
      visit = {};
      visitsHeaders.forEach((vh, idx) => {
        visit[vh] = visits[i][idx];
      });
      break;
    }
  }
  
  if (!visit) throw new Error("ไม่พบใบงานเวชระเบียนรหัสนี้");
  
  // ดึงข้อมูล Vitals
  const vitalsSheet = ss.getSheetByName("Vitals");
  const vitalsData = vitalsSheet.getLastRow() > 1 ? vitalsSheet.getDataRange().getValues() : [];
  const vitalsHeaders = vitalsData[0] || [];
  visit.vitals = [];
  const vitalsVisitIdx = vitalsHeaders.indexOf("VisitID");
  for (let i = 1; i < vitalsData.length; i++) {
    if (vitalsData[i][vitalsVisitIdx] === id) {
      const vitalItem = {};
      vitalsHeaders.forEach((vh, idx) => {
        vitalItem[vh] = vitalsData[i][idx];
      });
      visit.vitals.push(vitalItem);
    }
  }
  
  // ดึงข้อมูลการประเมิน Assessments
  const assessSheet = ss.getSheetByName("Assessments");
  const assessData = assessSheet.getLastRow() > 1 ? assessSheet.getDataRange().getValues() : [];
  const assessHeaders = assessData[0] || [];
  visit.assessments = [];
  const assessVisitIdx = assessHeaders.indexOf("VisitID");
  for (let i = 1; i < assessData.length; i++) {
    if (assessData[i][assessVisitIdx] === id) {
      const item = {};
      assessHeaders.forEach((ah, idx) => {
        item[ah] = assessData[i][idx];
      });
      visit.assessments.push(item);
    }
  }
  
  // ดึงข้อมูลการักรักษา Treatments
  const treatSheet = ss.getSheetByName("Treatments");
  const treatData = treatSheet.getLastRow() > 1 ? treatSheet.getDataRange().getValues() : [];
  const treatHeaders = treatData[0] || [];
  visit.treatments = [];
  const treatVisitIdx = treatHeaders.indexOf("VisitID");
  for (let i = 1; i < treatData.length; i++) {
    if (treatData[i][treatVisitIdx] === id) {
      const item = {};
      treatHeaders.forEach((th, idx) => {
        item[th] = treatData[i][idx];
      });
      visit.treatments.push(item);
    }
  }
  
  // ดึงประวัติการจ่ายยา Dispensing
  const dispSheet = ss.getSheetByName("Dispensing");
  const dispData = dispSheet.getLastRow() > 1 ? dispSheet.getDataRange().getValues() : [];
  const dispHeaders = dispData[0] || [];
  visit.dispensing = [];
  const dispVisitIdx = dispHeaders.indexOf("VisitID");
  for (let i = 1; i < dispData.length; i++) {
    if (dispData[i][dispVisitIdx] === id) {
      const item = {};
      dispHeaders.forEach((dh, idx) => {
        item[dh] = dispData[i][idx];
      });
      visit.dispensing.push(item);
    }
  }
  
  return visit;
}

/**
 * บันทึกประวัติการเข้ารับบริการ (ใบงานใหม่ / อัปเดตใบเก่า)
 */
function saveVisit(sessionToken, visitData) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  if (session.role === "VIEWER") throw new Error("สิทธิ์เข้าอ่านเท่านั้น ไม่สามารถบันทึกข้อมูลได้");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Visits");
  const headers = sheet.getDataRange().getValues()[0];
  
  // ป้องกันการกดยื่นข้อมูลเปล่าหรือแฮก
  visitData.RecipientID = sanitizeInput(visitData.RecipientID);
  
  const isEdit = visitData.VisitID ? true : false;
  let targetRow = -1;
  
  if (isEdit) {
    const visits = sheet.getDataRange().getValues();
    const visitIdIdx = headers.indexOf("VisitID");
    const isDemoIdx = headers.indexOf("IsDemo");
    for (let i = 1; i < visits.length; i++) {
      if (visits[i][visitIdIdx] === visitData.VisitID) {
        const rowIsDemo = visits[i][isDemoIdx] === true || visits[i][isDemoIdx] === "TRUE" || String(visits[i][isDemoIdx]).toUpperCase() === 'TRUE';
        if (isDemo !== rowIsDemo) throw new Error("ไม่ได้รับอนุญาตให้ข้ามเซสชันดำเนินงาน");
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) throw new Error("ไม่พบประวัติการบริการที่อ้างอิง");
  } else {
    visitData.VisitID = generateId("VIS", "Visits");
  }
  
  // ดึงรายละเอียดผู้รับบริการเพื่อบันทึกร่วม
  const rep = getServiceRecipientById(sessionToken, visitData.RecipientID);
  
  const rowValues = [];
  headers.forEach(h => {
    switch (h) {
      case "VisitID":
        rowValues.push(visitData.VisitID);
        break;
      case "RecipientName":
        rowValues.push(rep.Title + rep.FirstName + " " + rep.LastName);
        break;
      case "RecipientType":
        rowValues.push(rep.RecipientType);
        break;
      case "Group":
        rowValues.push(rep.Group);
        break;
      case "Department":
        rowValues.push(rep.Department);
        break;
      case "IsDemo":
        rowValues.push(isDemo);
        break;
      case "RecordedBy":
        rowValues.push(session.username);
        break;
      case "RecordedAt":
        rowValues.push(new Date());
        break;
      case "VisitStatus":
        rowValues.push(visitData.VisitStatus || "Open");
        break;
      case "VisitDate":
        rowValues.push(visitData.VisitDate || new Date());
        break;
      default:
        rowValues.push(visitData[h] !== undefined ? sanitizeInput(visitData[h]) : "");
    }
  });
  
  if (isEdit) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
    writeAuditLog(ss, session.username, session.role, "VISIT_UPDATE", "อัปเดตใบงานเข้ารับบริการ ID: " + visitData.VisitID);
  } else {
    sheet.appendRow(rowValues);
    writeAuditLog(ss, session.username, session.role, "VISIT_CREATE", "เปิดใบงานเข้ารับบริการใหม่ ID: " + visitData.VisitID);
    
    // ส่งการแจ้งเตือนไปยัง Telegram (เฉพาะเมื่อสร้างประวัติการรักษาใหม่)
    try {
      let msg = `🏥 <b>มีผู้เข้ารับบริการห้องพยาบาลใหม่</b>\n\n`;
      msg += `🆔 <b>รหัสประวัติ:</b> ${visitData.VisitID} ${isDemo ? '(DEMO)' : ''}\n`;
      msg += `👤 <b>ผู้ป่วย:</b> ${rep.Title}${rep.FirstName} ${rep.LastName} (${rep.Nickname || '-'})\n`;
      msg += `🏷️ <b>ประเภท:</b> ${rep.RecipientType} ${rep.Group ? 'สังกัด: ' + rep.Group : ''}\n`;
      msg += `🤒 <b>อาการสำคัญ:</b> ${visitData.ChiefComplaint || '-'}\n`;
      msg += `🚨 <b>ระดับความเร่งด่วน:</b> ${visitData.UrgencyLevel || 'ปกติ'}\n`;
      msg += `🩺 <b>ผลประเมินเบื้องต้น:</b> ${visitData.InitialAssessment || '-'}\n`;
      if (visitData.vitals) {
        msg += `🌡️ <b>อุณหภูมิ:</b> ${visitData.vitals.Temperature || '-'} °C, <b>BP:</b> ${visitData.vitals.BloodPressureSystolic || '-'}/${visitData.vitals.BloodPressureDiastolic || '-'} mmHg\n`;
      }
      msg += `\n👤 <b>ผู้บันทึก:</b> ${session.username}`;
      sendTelegramNotification(msg);
    } catch(telErr) {
      Logger.log("Telegram notification failed in saveVisit: " + telErr.message);
    }
  }
  
  // บันทึก Vital Sign เพิ่มเติม (ถ้ามีส่งมา)
  if (visitData.vitals) {
    visitData.vitals.VisitID = visitData.VisitID;
    visitData.vitals.RecipientID = visitData.RecipientID;
    saveVitals(sessionToken, visitData.vitals);
  }
  
  // บันทึก Assessment เพิ่มเติม (ถ้ามีส่งมา)
  if (visitData.assessment) {
    saveAssessment(sessionToken, {
      VisitID: visitData.VisitID,
      RecipientID: visitData.RecipientID,
      AssessmentDetails: visitData.assessment.AssessmentDetails,
      Diagnosis: visitData.assessment.Diagnosis
    });
  }
  
  // บันทึก Treatment เพิ่มเติม (ถ้ามีส่งมา)
  if (visitData.treatment) {
    saveTreatment(sessionToken, {
      VisitID: visitData.VisitID,
      RecipientID: visitData.RecipientID,
      TreatmentDetails: visitData.treatment.TreatmentDetails,
      Note: visitData.treatment.Note
    });
  }
  
  // ดำเนินการตัดคลังยา (ถ้าเลือกการจ่ายยา)
  if (visitData.dispenseMedicines && visitData.dispenseMedicines.length > 0) {
    visitData.dispenseMedicines.forEach(disp => {
      dispenseMedicine(sessionToken, {
        VisitID: visitData.VisitID,
        RecipientID: visitData.RecipientID,
        MedicineID: disp.MedicineID,
        Quantity: disp.Quantity,
        Directions: disp.Directions
      });
    });
  }
  
  return { success: true, id: visitData.VisitID, message: "บันทึกเวชระเบียนการเข้ารับบริการเรียบร้อยแล้ว" };
}

/**
 * ยกเลิกรายการเข้ารับบริการและคืนยาเข้าสต็อก (ADMIN / MEDICAL เท่านั้น)
 */
function cancelVisit(sessionToken, id) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN" && session.role !== "MEDICAL") {
    throw new Error("ไม่มีสิทธิ์แก้ไขหรือยกเลิกประวัติการบริการ");
  }
  
  const isDemo = session.role === "DEMO";
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Visits");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const visitIdIdx = headers.indexOf("VisitID");
  const isDemoIdx = headers.indexOf("IsDemo");
  const statusIdx = headers.indexOf("VisitStatus");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][visitIdIdx] === id) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) throw new Error("ไม่ได้รับอนุญาต");
      
      if (data[i][statusIdx] === "Cancelled") {
        throw new Error("ใบงานเวชระเบียนนี้ถูกยกเลิกไปแล้ว");
      }
      
      // ดำเนินการยกเลิกการจ่ายยาทั้งหมดที่ผูกกับ VisitID นี้และคืนเข้าสต็อก
      const dispSheet = ss.getSheetByName("Dispensing");
      const dispData = dispSheet.getLastRow() > 1 ? dispSheet.getDataRange().getValues() : [];
      const dispHeaders = dispData[0] || [];
      const dispVisitIdx = dispHeaders.indexOf("VisitID");
      const dispIdIdx = dispHeaders.indexOf("DispenseID");
      
      for (let j = 1; j < dispData.length; j++) {
        if (dispData[j][dispVisitIdx] === id && dispData[j][dispHeaders.indexOf("Status")] !== "Cancelled") {
          cancelDispensingAndReturnStock(sessionToken, dispData[j][dispIdIdx]);
        }
      }
      
      // เปลี่ยนสถานะ Visit เป็น Cancelled
      sheet.getRange(i + 1, statusIdx + 1).setValue("Cancelled");
      
      writeAuditLog(ss, session.username, session.role, "VISIT_CANCEL", "ยกเลิกใบงานเวชระเบียนและคืนยา ID: " + id);
      return { success: true, message: "ยกเลิกเวชระเบียนและคืนสินค้าคงคลังเรียบร้อยแล้ว" };
    }
  }
  throw new Error("ไม่พบเวชระเบียนที่อ้างถึง");
}

/**
 * บันทึกสัญญาณชีพ (Vitals)
 */
function saveVitals(sessionToken, vitalsData) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Vitals");
  const headers = sheet.getDataRange().getValues()[0];
  
  const rowValues = [];
  const vitalId = "VIT-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
  
  headers.forEach(h => {
    switch (h) {
      case "VitalID":
        rowValues.push(vitalId);
        break;
      case "IsDemo":
        rowValues.push(isDemo);
        break;
      case "RecordedAt":
        rowValues.push(new Date());
        break;
      default:
        rowValues.push(vitalsData[h] !== undefined ? vitalsData[h] : "");
    }
  });
  
  sheet.appendRow(rowValues);
  return { success: true, id: vitalId };
}

/**
 * บันทึกการประเมิน (Assessments)
 */
function saveAssessment(sessionToken, assessmentData) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Assessments");
  const headers = sheet.getDataRange().getValues()[0];
  
  const rowValues = [];
  const id = "ASM-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
  
  headers.forEach(h => {
    switch (h) {
      case "AssessmentID":
        rowValues.push(id);
        break;
      case "IsDemo":
        rowValues.push(isDemo);
        break;
      case "RecordedAt":
        rowValues.push(new Date());
        break;
      default:
        rowValues.push(assessmentData[h] !== undefined ? sanitizeInput(assessmentData[h]) : "");
    }
  });
  
  sheet.appendRow(rowValues);
  return { success: true, id: id };
}

/**
 * บันทึกการรักษาพยาบาล (Treatments)
 */
function saveTreatment(sessionToken, treatmentData) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Treatments");
  const headers = sheet.getDataRange().getValues()[0];
  
  const rowValues = [];
  const id = "TRT-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
  
  headers.forEach(h => {
    switch (h) {
      case "TreatmentID":
        rowValues.push(id);
        break;
      case "IsDemo":
        rowValues.push(isDemo);
        break;
      case "RecordedAt":
        rowValues.push(new Date());
        break;
      default:
        rowValues.push(treatmentData[h] !== undefined ? sanitizeInput(treatmentData[h]) : "");
    }
  });
  
  sheet.appendRow(rowValues);
  return { success: true, id: id };
}

// ==========================================
// ส่วนจัดการคลังยาและการจ่ายยา (Medicines & Dispensing)
// ==========================================

/**
 * ดึงรายการยาทั้งหมดในสต็อก
 */
function getMedicines(sessionToken) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Medicines");
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const isDemoIdx = headers.indexOf("IsDemo");
  
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
    if (isDemo === rowIsDemo) {
      const item = {};
      headers.forEach((h, idx) => {
        item[h] = data[i][idx];
      });
      results.push(item);
    }
  }
  
  return results;
}

/**
 * เพิ่ม/แก้ไขยาในคลัง
 */
function saveMedicine(sessionToken, medicineData) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN" && session.role !== "MEDICAL") {
    throw new Error("ไม่มีสิทธิ์แก้ไขข้อมูลสต็อกยา");
  }
  
  const isDemo = session.role === "DEMO";
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Medicines");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const medIdIdx = headers.indexOf("MedicineID");
  const isDemoIdx = headers.indexOf("IsDemo");
  
  const isEdit = medicineData.MedicineID ? true : false;
  let targetRow = -1;
  
  if (isEdit) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][medIdIdx] === medicineData.MedicineID) {
        const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
        if (isDemo !== rowIsDemo) throw new Error("ไม่ได้รับอนุญาต");
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) throw new Error("ไม่พบข้อมูลยาที่ระบุ");
  } else {
    medicineData.MedicineID = generateId("MED", "Medicines");
    medicineData.Quantity = medicineData.Quantity ? parseInt(medicineData.Quantity, 10) : 0;
  }
  
  // แปลงค่าตัวเลข
  medicineData.AlertThreshold = medicineData.AlertThreshold ? parseInt(medicineData.AlertThreshold, 10) : 0;
  
  const rowValues = [];
  headers.forEach(h => {
    switch (h) {
      case "MedicineID":
        rowValues.push(medicineData.MedicineID);
        break;
      case "IsDemo":
        rowValues.push(isDemo);
        break;
      case "Quantity":
        rowValues.push(isEdit ? data[targetRow - 1][headers.indexOf("Quantity")] : medicineData.Quantity);
        break;
      case "CreatedBy":
        rowValues.push(isEdit ? data[targetRow - 1][headers.indexOf("CreatedBy")] : session.username);
        break;
      case "CreatedAt":
        rowValues.push(isEdit ? data[targetRow - 1][headers.indexOf("CreatedAt")] : new Date());
        break;
      case "UpdatedBy":
        rowValues.push(session.username);
        break;
      case "UpdatedAt":
        rowValues.push(new Date());
        break;
      case "Status":
        rowValues.push(medicineData.Status || "Active");
        break;
      default:
        rowValues.push(medicineData[h] !== undefined ? sanitizeInput(medicineData[h]) : "");
    }
  });
  
  if (isEdit) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
    writeAuditLog(ss, session.username, session.role, "MEDICINE_UPDATE", "อัปเดตข้อมูลยา ID: " + medicineData.MedicineID);
  } else {
    sheet.appendRow(rowValues);
    writeAuditLog(ss, session.username, session.role, "MEDICINE_CREATE", "เพิ่มยาใหม่เข้าระบบ ID: " + medicineData.MedicineID);
    
    // บันทึกธุรกรรมเพิ่มยาล็อตแรก (ถ้ามียอดสต็อกเริ่มต้น)
    if (medicineData.Quantity > 0) {
      const txnSheet = ss.getSheetByName("InventoryTransactions");
      txnSheet.appendRow([
        "TXN-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000),
        medicineData.MedicineID,
        "Receive",
        medicineData.Quantity,
        0,
        medicineData.Quantity,
        medicineData.MedicineID,
        "ยอดนำเข้าสต็อกเริ่มต้นการสร้างยา",
        new Date(),
        session.username,
        isDemo
      ]);
    }
  }
  
  return { success: true, id: medicineData.MedicineID, message: "บันทึกยาคงคลังเรียบร้อยแล้ว" };
}

/**
 * รับยาเพิ่มเข้าสต็อก (Receive Stock)
 */
function receiveMedicineStock(sessionToken, stockData) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN" && session.role !== "MEDICAL") {
    throw new Error("ไม่มีสิทธิ์นำเข้าเวชภัณฑ์");
  }
  
  const isDemo = session.role === "DEMO";
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(10000);
    const ss = getSpreadsheet();
    const medSheet = ss.getSheetByName("Medicines");
    const medData = medSheet.getDataRange().getValues();
    const medHeaders = medData[0];
    const medIdIdx = medHeaders.indexOf("MedicineID");
    const qtyIdx = medHeaders.indexOf("Quantity");
    const isDemoIdx = medHeaders.indexOf("IsDemo");
    
    const targetMedId = sanitizeInput(stockData.MedicineID);
    const inputQty = parseInt(stockData.Quantity, 10);
    
    if (isNaN(inputQty) || inputQty <= 0) throw new Error("จำนวนการนำเข้ายาต้องมากกว่า 0");
    
    let targetRow = -1;
    let prevQty = 0;
    
    for (let i = 1; i < medData.length; i++) {
      if (medData[i][medIdIdx] === targetMedId) {
        const rowIsDemo = medData[i][isDemoIdx] === true || medData[i][isDemoIdx] === "TRUE" || String(medData[i][isDemoIdx]).toUpperCase() === 'TRUE';
        if (isDemo !== rowIsDemo) throw new Error("สิทธิ์เซสชันไม่สอดคล้องกับคลังสินค้า");
        targetRow = i + 1;
        prevQty = parseInt(medData[i][qtyIdx], 10) || 0;
        break;
      }
    }
    
    if (targetRow === -1) throw new Error("ไม่พบข้อมูลยาที่กำหนด");
    
    const newQty = prevQty + inputQty;
    medSheet.getRange(targetRow, qtyIdx + 1).setValue(newQty);
    
    // บันทึกธุรกรรมสินค้าคงคลัง
    const txnSheet = ss.getSheetByName("InventoryTransactions");
    const txnId = "TXN-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
    txnSheet.appendRow([
      txnId,
      targetMedId,
      "Receive",
      inputQty,
      prevQty,
      newQty,
      stockData.ReferenceID ? sanitizeInput(stockData.ReferenceID) : targetMedId,
      stockData.Notes ? sanitizeInput(stockData.Notes) : "นำเข้ายารับยาเพิ่ม",
      new Date(),
      session.username,
      isDemo
    ]);
    
    writeAuditLog(ss, session.username, session.role, "STOCK_RECEIVE", "รับยาเพิ่ม ID: " + targetMedId + " จำนวน: " + inputQty);
    return { success: true, message: "นำเข้ายาจำนวน " + inputQty + " เรียบร้อยแล้ว (ยอดคงเหลือใหม่: " + newQty + ")" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * เบิกและปรับยอดสต็อกยา (Adjust Stock)
 */
function adjustMedicineStock(sessionToken, stockData) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN" && session.role !== "MEDICAL") {
    throw new Error("ไม่มีสิทธิ์ปรับปรุงยอดคงคลัง");
  }
  
  const isDemo = session.role === "DEMO";
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(10000);
    const ss = getSpreadsheet();
    const medSheet = ss.getSheetByName("Medicines");
    const medData = medSheet.getDataRange().getValues();
    const medHeaders = medData[0];
    const medIdIdx = medHeaders.indexOf("MedicineID");
    const qtyIdx = medHeaders.indexOf("Quantity");
    const isDemoIdx = medHeaders.indexOf("IsDemo");
    
    const targetMedId = sanitizeInput(stockData.MedicineID);
    const inputQty = parseInt(stockData.Quantity, 10); // อาจจะบวกหรือลบ
    
    if (isNaN(inputQty) || inputQty === 0) throw new Error("จำนวนการปรับสต็อกต้องไม่เป็นศูนย์");
    
    let targetRow = -1;
    let prevQty = 0;
    
    for (let i = 1; i < medData.length; i++) {
      if (medData[i][medIdIdx] === targetMedId) {
        const rowIsDemo = medData[i][isDemoIdx] === true || medData[i][isDemoIdx] === "TRUE" || String(medData[i][isDemoIdx]).toUpperCase() === 'TRUE';
        if (isDemo !== rowIsDemo) throw new Error("ไม่ได้รับอนุญาต");
        targetRow = i + 1;
        prevQty = parseInt(medData[i][qtyIdx], 10) || 0;
        break;
      }
    }
    
    if (targetRow === -1) throw new Error("ไม่พบข้อมูลยาในระบบ");
    
    const newQty = prevQty + inputQty;
    if (newQty < 0) throw new Error("สต็อกติดลบไม่ได้ ยอดคงเหลือเดิมคือ " + prevQty + " เม็ด/ซอง");
    
    medSheet.getRange(targetRow, qtyIdx + 1).setValue(newQty);
    
    // บันทึกธุรกรรมคงคลัง
    const txnSheet = ss.getSheetByName("InventoryTransactions");
    txnSheet.appendRow([
      "TXN-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000),
      targetMedId,
      inputQty > 0 ? "Adjust-In" : "Adjust-Out",
      Math.abs(inputQty),
      prevQty,
      newQty,
      "-",
      stockData.Notes ? sanitizeInput(stockData.Notes) : "ปรับปรุงยอดสินค้าคงคลังด้วยมือ",
      new Date(),
      session.username,
      isDemo
    ]);
    
    writeAuditLog(ss, session.username, session.role, "STOCK_ADJUST", "ปรับปรุงยอดสต็อก ID: " + targetMedId + " ยอดเก่า: " + prevQty + " ปรับแก้: " + inputQty);
    return { success: true, message: "ปรับปรุงยอดสต็อกสำเร็จ ยอดคงเหลือใหม่: " + newQty };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ดึงรายการประวัติความเคลื่อนไหวสต็อก
 */
function getInventoryTransactions(sessionToken, filters) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("InventoryTransactions");
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const results = [];
  const isDemoIdx = headers.indexOf("IsDemo");
  
  for (let i = 1; i < data.length; i++) {
    const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
    if (isDemo === rowIsDemo) {
      const item = {};
      headers.forEach((h, idx) => {
        item[h] = data[i][idx];
      });
      results.push(item);
    }
  }
  
  // เรียงวันที่จากใหม่สุด
  results.sort((a, b) => new Date(b.TransactionDate).getTime() - new Date(a.TransactionDate).getTime());
  return results;
}

/**
 * ดำเนินการจ่ายยาในเวชระเบียน ตัดสต็อกทันที (Dispense Medicine)
 */
function dispenseMedicine(sessionToken, dispenseData) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  if (session.role === "VIEWER" || session.role === "STAFF") {
    throw new Error("ไม่มีสิทธิ์สั่งจ่ายยาแก่ผู้ป่วย");
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = getSpreadsheet();
    const medSheet = ss.getSheetByName("Medicines");
    const medData = medSheet.getDataRange().getValues();
    const medHeaders = medData[0];
    const medIdIdx = medHeaders.indexOf("MedicineID");
    const nameIdx = medHeaders.indexOf("MedicineName");
    const qtyIdx = medHeaders.indexOf("Quantity");
    const isDemoIdx = medHeaders.indexOf("IsDemo");
    const statusIdx = medHeaders.indexOf("Status");
    const expiryIdx = medHeaders.indexOf("ExpiryDate");
    
    const targetMedId = sanitizeInput(dispenseData.MedicineID);
    const dispenseQty = parseInt(dispenseData.Quantity, 10);
    
    if (isNaN(dispenseQty) || dispenseQty <= 0) throw new Error("จำนวนจ่ายยาต้องมากกว่า 0");
    
    let targetRow = -1;
    let prevQty = 0;
    let medName = "";
    let medStatus = "";
    let expiryDate = null;
    
    for (let i = 1; i < medData.length; i++) {
      if (medData[i][medIdIdx] === targetMedId) {
        const rowIsDemo = medData[i][isDemoIdx] === true || medData[i][isDemoIdx] === "TRUE" || String(medData[i][isDemoIdx]).toUpperCase() === 'TRUE';
        if (isDemo !== rowIsDemo) throw new Error("ไม่มีสิทธิ์ใช้งานยาในโหมดอื่น");
        targetRow = i + 1;
        prevQty = parseInt(medData[i][qtyIdx], 10) || 0;
        medName = medData[i][nameIdx];
        medStatus = medData[i][statusIdx];
        expiryDate = medData[i][expiryIdx] ? new Date(medData[i][expiryIdx]) : null;
        break;
      }
    }
    
    if (targetRow === -1) throw new Error("ไม่พบข้อมูลยาในคลัง");
    if (medStatus === "Inactive") throw new Error("ยานี้ถูกระงับการจ่าย (Inactive)");
    
    // ตรวจสอบวันหมดอายุ
    if (expiryDate && expiryDate < new Date()) {
      throw new Error("ยาหมดอายุแล้ว (" + formatDateThai(expiryDate) + ") ห้ามทำรายการจ่ายยานี้");
    }
    
    if (prevQty < dispenseQty) {
      throw new Error("จำนวนยาในคลังไม่พอจ่าย (คงเหลือ " + prevQty + " ต้องการจ่าย " + dispenseQty + ")");
    }
    
    // ตัดสต็อกยาออก
    const newQty = prevQty - dispenseQty;
    medSheet.getRange(targetRow, qtyIdx + 1).setValue(newQty);
    
    // บันทึกการจ่ายยา (Dispensing)
    const dispSheet = ss.getSheetByName("Dispensing");
    const dispenseId = generateId("DISP", "Dispensing");
    dispSheet.appendRow([
      dispenseId,
      sanitizeInput(dispenseData.VisitID),
      sanitizeInput(dispenseData.RecipientID),
      targetMedId,
      medName,
      dispenseQty,
      sanitizeInput(dispenseData.Directions),
      session.username,
      new Date(),
      "Completed",
      isDemo
    ]);
    
    // บันทึกธุรกรรมคงคลัง
    const txnSheet = ss.getSheetByName("InventoryTransactions");
    txnSheet.appendRow([
      "TXN-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000),
      targetMedId,
      "Dispense",
      dispenseQty,
      prevQty,
      newQty,
      dispenseData.VisitID,
      "จ่ายยาในเวชระเบียน",
      new Date(),
      session.username,
      isDemo
    ]);
    
    return { success: true, dispenseId: dispenseId, message: "จ่ายยาและตัดคลังสินค้าแล้ว" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ยกเลิกการจ่ายรายตัวและคืนยอดเข้าคลัง (ADMIN / MEDICAL เท่านั้น)
 */
function cancelDispensingAndReturnStock(sessionToken, dispenseId) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN" && session.role !== "MEDICAL") {
    throw new Error("ไม่มีสิทธิ์แก้ไขการจ่ายยา");
  }
  
  const isDemo = session.role === "DEMO";
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(10000);
    const ss = getSpreadsheet();
    const dispSheet = ss.getSheetByName("Dispensing");
    const dispData = dispSheet.getDataRange().getValues();
    const dispHeaders = dispData[0];
    
    const dispIdIdx = dispHeaders.indexOf("DispenseID");
    const medIdIdx = dispHeaders.indexOf("MedicineID");
    const qtyIdx = dispHeaders.indexOf("Quantity");
    const statusIdx = dispHeaders.indexOf("Status");
    const isDemoIdx = dispHeaders.indexOf("IsDemo");
    
    let targetDispRow = -1;
    let targetMedId = "";
    let returnQty = 0;
    
    for (let i = 1; i < dispData.length; i++) {
      if (dispData[i][dispIdIdx] === dispenseId) {
        const rowIsDemo = dispData[i][isDemoIdx] === true || dispData[i][isDemoIdx] === "TRUE" || String(dispData[i][isDemoIdx]).toUpperCase() === 'TRUE';
        if (isDemo !== rowIsDemo) throw new Error("ไม่ได้รับสิทธิ์");
        if (dispData[i][statusIdx] === "Cancelled") {
          throw new Error("รายการนี้ถูกยกเลิกไปก่อนแล้ว");
        }
        targetDispRow = i + 1;
        targetMedId = dispData[i][medIdIdx];
        returnQty = parseInt(dispData[i][qtyIdx], 10);
        break;
      }
    }
    
    if (targetDispRow === -1) throw new Error("ไม่พบรายการจ่ายยาที่ระบุ");
    
    // ทำความสะอาดและคืนสินค้าคงคลังยา
    const medSheet = ss.getSheetByName("Medicines");
    const medData = medSheet.getDataRange().getValues();
    const medHeaders = medData[0];
    const medQtyIdx = medHeaders.indexOf("Quantity");
    const medIdColIdx = medHeaders.indexOf("MedicineID");
    
    let targetMedRow = -1;
    let prevQty = 0;
    
    for (let i = 1; i < medData.length; i++) {
      if (medData[i][medIdColIdx] === targetMedId) {
        targetMedRow = i + 1;
        prevQty = parseInt(medData[i][medQtyIdx], 10) || 0;
        break;
      }
    }
    
    if (targetMedRow !== -1) {
      const newQty = prevQty + returnQty;
      medSheet.getRange(targetMedRow, medQtyIdx + 1).setValue(newQty);
      
      // บันทึกประวัติคงคลังการคืนยา
      const txnSheet = ss.getSheetByName("InventoryTransactions");
      txnSheet.appendRow([
        "TXN-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000),
        targetMedId,
        "Return",
        returnQty,
        prevQty,
        newQty,
        dispenseId,
        "คืนยาจากการยกเลิกการจ่ายยา",
        new Date(),
        session.username,
        isDemo
      ]);
    }
    
    // เปลี่ยนสถานะเป็นยกเลิก
    dispSheet.getRange(targetDispRow, statusIdx + 1).setValue("Cancelled");
    
    writeAuditLog(ss, session.username, session.role, "DISPENSE_CANCEL", "ยกเลิกการจ่ายยาคืนสต็อก ID: " + dispenseId);
    return { success: true, message: "ยกเลิกการจ่ายและนำยา " + returnQty + " หน่วย คืนเข้าสต็อกเรียบร้อย" };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// ส่วนแจ้งผู้ติดต่อ (Notifications) / ส่งตัว (Referrals) / ติดตาม (Follow-ups)
// ==========================================

/**
 * บันทึกการแจ้งเตือนผู้ติดต่อ
 */
function saveContactNotification(sessionToken, notificationData) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  if (session.role === "VIEWER") throw new Error("ไม่มีสิทธิ์แก้ไขข้อมูล");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("ContactNotifications");
  const headers = sheet.getDataRange().getValues()[0];
  
  const rowValues = [];
  const id = "NTF-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
  
  headers.forEach(h => {
    switch (h) {
      case "NotificationID":
        rowValues.push(id);
        break;
      case "IsDemo":
        rowValues.push(isDemo);
        break;
      case "RecordedAt":
        rowValues.push(new Date());
        break;
      case "RecordedBy":
        rowValues.push(session.username);
        break;
      case "IsSuccess":
        rowValues.push(notificationData.IsSuccess === true || notificationData.IsSuccess === "TRUE" || notificationData.IsSuccess === "true" || notificationData.IsSuccess === 1);
        break;
      default:
        rowValues.push(notificationData[h] !== undefined ? sanitizeInput(notificationData[h]) : "");
    }
  });
  
  sheet.appendRow(rowValues);
  
  // ไปตั้งค่าธงในใบเวชระเบียนหลัก Visit ว่าได้รับการติดต่อแล้ว
  const visitSheet = ss.getSheetByName("Visits");
  const visitData = visitSheet.getDataRange().getValues();
  const visitHeaders = visitData[0];
  const visitIdIdx = visitHeaders.indexOf("VisitID");
  const contactNotifiedIdx = visitHeaders.indexOf("ContactNotified");
  
  for (let i = 1; i < visitData.length; i++) {
    if (visitData[i][visitIdIdx] === notificationData.VisitID) {
      visitSheet.getRange(i + 1, contactNotifiedIdx + 1).setValue("YES");
      break;
    }
  }
  
  return { success: true, id: id, message: "บันทึกข้อมูลการแจ้งเตือนผู้ติดต่อแล้ว" };
}

/**
 * ดึงรายการประวัติการแจ้งเตือนผู้ติดต่อ
 */
function getContactNotifications(sessionToken, filters) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("ContactNotifications");
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const results = [];
  const isDemoIdx = headers.indexOf("IsDemo");
  const visitIdIdx = headers.indexOf("VisitID");
  
  for (let i = 1; i < data.length; i++) {
    const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
    if (isDemo === rowIsDemo) {
      if (filters && filters.VisitID && data[i][visitIdIdx] !== filters.VisitID) {
        continue;
      }
      const item = {};
      headers.forEach((h, idx) => {
        item[h] = data[i][idx];
      });
      results.push(item);
    }
  }
  
  results.sort((a, b) => new Date(b.RecordedAt).getTime() - new Date(a.RecordedAt).getTime());
  return results;
}

/**
 * บันทึกประวัติการส่งตัวโรงพยาบาล
 */
function saveReferral(sessionToken, referralData) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  if (session.role === "VIEWER" || session.role === "STAFF") throw new Error("สิทธิ์ไม่เพียงพอ");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Referrals");
  const headers = sheet.getDataRange().getValues()[0];
  
  const isEdit = referralData.ReferralID ? true : false;
  let targetRow = -1;
  
  if (isEdit) {
    const data = sheet.getDataRange().getValues();
    const refIdIdx = headers.indexOf("ReferralID");
    for (let i = 1; i < data.length; i++) {
      if (data[i][refIdIdx] === referralData.ReferralID) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) throw new Error("ไม่พบข้อมูลการส่งต่อผู้ป่วย");
  } else {
    referralData.ReferralID = generateId("REF", "Referrals");
  }
  
  const rowValues = [];
  headers.forEach(h => {
    switch (h) {
      case "ReferralID":
        rowValues.push(referralData.ReferralID);
        break;
      case "IsDemo":
        rowValues.push(isDemo);
        break;
      case "RecordedAt":
        rowValues.push(isEdit ? sheet.getRange(targetRow, headers.indexOf("RecordedAt") + 1).getValue() : new Date());
        break;
      case "RecordedBy":
        rowValues.push(session.username);
        break;
      case "Status":
        rowValues.push(referralData.Status || "Active");
        break;
      default:
        rowValues.push(referralData[h] !== undefined ? sanitizeInput(referralData[h]) : "");
    }
  });
  
  if (isEdit) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
    writeAuditLog(ss, session.username, session.role, "REFERRAL_UPDATE", "แก้ไขใบส่งตัวรักษาพยาบาล ID: " + referralData.ReferralID);
  } else {
    sheet.appendRow(rowValues);
    writeAuditLog(ss, session.username, session.role, "REFERRAL_CREATE", "ออกใบส่งตัวรักษาพยาบาล ID: " + referralData.ReferralID);
    
    // ส่งการแจ้งเตือนไปยัง Telegram (เฉพาะเมื่อสร้างใบส่งตัวใหม่)
    try {
      const rep = getServiceRecipientById(sessionToken, referralData.RecipientID);
      let msg = `🚨 <b>แจ้งส่งตัวผู้รับบริการออกรักษาภายนอก (Referral)</b>\n\n`;
      msg += `🆔 <b>รหัสส่งตัว:</b> ${referralData.ReferralID} ${isDemo ? '(DEMO)' : ''}\n`;
      msg += `👤 <b>ผู้ป่วย:</b> ${rep.Title}${rep.FirstName} ${rep.LastName}\n`;
      msg += `🏥 <b>ปลายทาง:</b> ${referralData.DestinationHospital || '-'}\n`;
      msg += `🚑 <b>วิธีเดินทาง:</b> ${referralData.TravelMethod || '-'}\n`;
      msg += `🤒 <b>อาการนำส่ง:</b> ${referralData.ChiefComplaint || '-'}\n`;
      msg += `🩺 <b>สัญญาณชีพล่าสุด:</b> ${referralData.LatestVitals || '-'}\n`;
      msg += `⚕️ <b>การพยาบาลเบื้องต้น:</b> ${referralData.PreReferralCare || '-'}\n`;
      msg += `💊 <b>ยาที่ได้รับระหว่างนำส่ง:</b> ${referralData.MedicinesGiven || '-'}\n`;
      msg += `\n👤 <b>ผู้บันทึก:</b> ${session.username}`;
      sendTelegramNotification(msg);
    } catch(telErr) {
      Logger.log("Telegram notification failed in saveReferral: " + telErr.message);
    }
  }
  
  // ทำการเชื่อมโยงและเปิดการแจ้งใน Visit
  const visitSheet = ss.getSheetByName("Visits");
  const visitData = visitSheet.getDataRange().getValues();
  const visitHeaders = visitData[0];
  const visitIdIdx = visitHeaders.indexOf("VisitID");
  const referralCreatedIdx = visitHeaders.indexOf("ReferralCreated");
  
  for (let i = 1; i < visitData.length; i++) {
    if (visitData[i][visitIdIdx] === referralData.VisitID) {
      visitSheet.getRange(i + 1, referralCreatedIdx + 1).setValue("YES");
      break;
    }
  }
  
  return { success: true, id: referralData.ReferralID, message: "บันทึกข้อมูลการส่งตัวสำเร็จ" };
}

/**
 * ดึงรายการส่งตัว
 */
function getReferrals(sessionToken, filters) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Referrals");
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const results = [];
  const isDemoIdx = headers.indexOf("IsDemo");
  const visitIdIdx = headers.indexOf("VisitID");
  
  for (let i = 1; i < data.length; i++) {
    const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
    if (isDemo === rowIsDemo) {
      if (filters && filters.VisitID && data[i][visitIdIdx] !== filters.VisitID) {
        continue;
      }
      const item = {};
      headers.forEach((h, idx) => {
        item[h] = data[i][idx];
      });
      results.push(item);
    }
  }
  
  results.sort((a, b) => new Date(b.RecordedAt).getTime() - new Date(a.RecordedAt).getTime());
  return results;
}

/**
 * บันทึกนัดติดตามอาการ (Follow Up)
 */
function saveFollowUp(sessionToken, followUpData) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  if (session.role === "VIEWER" || session.role === "STAFF") throw new Error("ไม่มีสิทธิ์แก้ไขข้อมูล");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("FollowUps");
  const headers = sheet.getDataRange().getValues()[0];
  
  const isEdit = followUpData.FollowUpID ? true : false;
  let targetRow = -1;
  
  if (isEdit) {
    const data = sheet.getDataRange().getValues();
    const flIdIdx = headers.indexOf("FollowUpID");
    for (let i = 1; i < data.length; i++) {
      if (data[i][flIdIdx] === followUpData.FollowUpID) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) throw new Error("ไม่พบบันทึกการติดตามนี้");
  } else {
    followUpData.FollowUpID = generateId("FOL", "FollowUps");
  }
  
  const rowValues = [];
  headers.forEach(h => {
    switch (h) {
      case "FollowUpID":
        rowValues.push(followUpData.FollowUpID);
        break;
      case "IsDemo":
        rowValues.push(isDemo);
        break;
      case "FollowedUpBy":
        rowValues.push(session.username);
        break;
      case "Status":
        rowValues.push(followUpData.Status || "Pending");
        break;
      default:
        rowValues.push(followUpData[h] !== undefined ? sanitizeInput(followUpData[h]) : "");
    }
  });
  
  if (isEdit) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
    writeAuditLog(ss, session.username, session.role, "FOLLOWUP_UPDATE", "แก้ไขใบรายงานนัดติดตามอาการ ID: " + followUpData.FollowUpID);
  } else {
    sheet.appendRow(rowValues);
    writeAuditLog(ss, session.username, session.role, "FOLLOWUP_CREATE", "เพิ่มใบติดตามอาการ ID: " + followUpData.FollowUpID);
  }
  
  // อัปเดต Visit ด้วย
  const visitSheet = ss.getSheetByName("Visits");
  const visitData = visitSheet.getDataRange().getValues();
  const visitHeaders = visitData[0];
  const visitIdIdx = visitHeaders.indexOf("VisitID");
  const followUpScheduledIdx = visitHeaders.indexOf("FollowUpScheduled");
  
  for (let i = 1; i < visitData.length; i++) {
    if (visitData[i][visitIdIdx] === followUpData.VisitID) {
      visitSheet.getRange(i + 1, followUpScheduledIdx + 1).setValue("YES");
      break;
    }
  }
  
  return { success: true, id: followUpData.FollowUpID, message: "บันทึกการนัดติดตามอาการแล้ว" };
}

/**
 * ดึงรายการติดตามอาการ
 */
function getFollowUps(sessionToken, filters) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("FollowUps");
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const results = [];
  const isDemoIdx = headers.indexOf("IsDemo");
  const visitIdIdx = headers.indexOf("VisitID");
  
  for (let i = 1; i < data.length; i++) {
    const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
    if (isDemo === rowIsDemo) {
      if (filters && filters.VisitID && data[i][visitIdIdx] !== filters.VisitID) {
        continue;
      }
      const item = {};
      headers.forEach((h, idx) => {
        item[h] = data[i][idx];
      });
      results.push(item);
    }
  }
  
  results.sort((a, b) => new Date(a.ScheduledDate).getTime() - new Date(b.ScheduledDate).getTime());
  return results;
}

// ==========================================
// ส่วนสรุปแดชบอร์ด (Dashboard) & รายงาน (Reports)
// ==========================================

/**
 * ดึงข้อมูลสรุปสถิติสำหรับแดชบอร์ด
 */
function getDashboardData(sessionToken) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  const ss = getSpreadsheet();
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  // 1. สรุป Visit รายวัน/เดือน
  const visitsSheet = ss.getSheetByName("Visits");
  let todayCount = 0;
  let monthCount = 0;
  let totalVisits = 0;
  
  let obsCount = 0;     // พักสังเกตอาการ
  let returnedCount = 0; // ผู้ติดต่อรับกลับ
  let refCount = 0;     // ส่งตัวรักษาต่อ
  
  const latestVisits = [];
  
  if (visitsSheet.getLastRow() > 1) {
    const visits = visitsSheet.getDataRange().getValues();
    const headers = visits[0];
    
    const dateIdx = headers.indexOf("VisitDate");
    const isDemoIdx = headers.indexOf("IsDemo");
    const outcomeIdx = headers.indexOf("Outcome");
    const statusIdx = headers.indexOf("VisitStatus");
    
    for (let i = 1; i < visits.length; i++) {
      const row = visits[i];
      const rowIsDemo = row[isDemoIdx] === true || row[isDemoIdx] === "TRUE" || String(row[isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) continue;
      if (row[statusIdx] === "Cancelled") continue;
      
      totalVisits++;
      
      const vD = new Date(row[dateIdx]);
      vD.setHours(0,0,0,0);
      
      if (vD.getTime() === today.getTime()) {
        todayCount++;
      }
      
      if (vD >= firstDayOfMonth) {
        monthCount++;
      }
      
      const outcome = row[outcomeIdx];
      if (outcome === "พักสังเกตอาการ") obsCount++;
      else if (outcome === "ผู้ติดต่อรับกลับ") returnedCount++;
      else if (outcome === "ส่งต่อสถานพยาบาล" || outcome === "เรียกรถฉุกเฉิน") refCount++;
      
      // เก็บรายการล่าสุด 5 รายการ
      if (latestVisits.length < 5) {
        latestVisits.push({
          id: row[0],
          name: row[headers.indexOf("RecipientName")],
          group: row[headers.indexOf("Group")] + " / " + row[headers.indexOf("Department")],
          complaint: row[headers.indexOf("ChiefComplaint")],
          time: row[headers.indexOf("TimeIn")],
          outcome: row[headers.indexOf("Outcome")],
          recordedBy: row[headers.indexOf("RecordedBy")]
        });
      }
    }
  }
  
  // 2. สรุปผู้รับบริการทั้งหมด
  const repSheet = ss.getSheetByName("ServiceRecipients");
  let totalRecipients = 0;
  if (repSheet.getLastRow() > 1) {
    const data = repSheet.getDataRange().getValues();
    const isDemoIdx = data[0].indexOf("IsDemo");
    for (let i = 1; i < data.length; i++) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo === rowIsDemo && data[i][data[0].indexOf("Status")] === "Active") {
        totalRecipients++;
      }
    }
  }
  
  // 3. ตรวจสอบนัดติดตามคงค้าง
  const followSheet = ss.getSheetByName("FollowUps");
  let pendingFollowUp = 0;
  if (followSheet.getLastRow() > 1) {
    const data = followSheet.getDataRange().getValues();
    const isDemoIdx = data[0].indexOf("IsDemo");
    const statusIdx = data[0].indexOf("Status");
    for (let i = 1; i < data.length; i++) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo === rowIsDemo && data[i][statusIdx] === "Pending") {
        pendingFollowUp++;
      }
    }
  }
  
  // 4. ตรวจสอบยาใกล้หมดสต็อก / ยาหมดอายุ
  const medSheet = ss.getSheetByName("Medicines");
  let medLowStock = 0;
  let medNearExpiry = 0;
  let medExpired = 0;
  
  let warningDays = 90;
  try {
    const settings = getSettingsMap(ss);
    warningDays = parseInt(settings.EXPIRY_WARNING_DAYS, 10) || 90;
  } catch(e) {}
  
  const expiryLimit = new Date();
  expiryLimit.setDate(expiryLimit.getDate() + warningDays);
  
  if (medSheet.getLastRow() > 1) {
    const data = medSheet.getDataRange().getValues();
    const headers = data[0];
    const isDemoIdx = headers.indexOf("IsDemo");
    const qtyIdx = headers.indexOf("Quantity");
    const thresholdIdx = headers.indexOf("AlertThreshold");
    const expiryIdx = headers.indexOf("ExpiryDate");
    const statusIdx = headers.indexOf("Status");
    
    for (let i = 1; i < data.length; i++) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) continue;
      if (data[i][statusIdx] !== "Active") continue;
      
      const qty = parseInt(data[i][qtyIdx], 10) || 0;
      const threshold = parseInt(data[i][thresholdIdx], 10) || 0;
      if (qty <= threshold) {
        medLowStock++;
      }
      
      const expDateStr = data[i][expiryIdx];
      if (expDateStr) {
        const expDate = new Date(expDateStr);
        if (expDate < new Date()) {
          medExpired++;
        } else if (expDate <= expiryLimit) {
          medNearExpiry++;
        }
      }
    }
  }
  
  return {
    todayCount: todayCount,
    monthCount: monthCount,
    totalRecipients: totalRecipients,
    obsCount: obsCount,
    returnedCount: returnedCount,
    refCount: refCount,
    pendingFollowUp: pendingFollowUp,
    medLowStock: medLowStock,
    medNearExpiry: medNearExpiry,
    medExpired: medExpired,
    latestVisits: latestVisits
  };
}

/**
 * ดึงรายงานและสถิติตามการกรอง
 */
function getReports(sessionToken, reportType, filters) {
  const session = validateSession(sessionToken);
  const isDemo = session.role === "DEMO";
  const ss = getSpreadsheet();
  
  if (reportType === "medicine_warning") {
    // รายงานยาใกล้หมด/หมดอายุ
    const medSheet = ss.getSheetByName("Medicines");
    const data = medSheet.getLastRow() > 1 ? medSheet.getDataRange().getValues() : [];
    const headers = data[0] || [];
    const results = [];
    
    const isDemoIdx = headers.indexOf("IsDemo");
    let warningDays = 90;
    try {
      const settingsMap = getSettingsMap(ss);
      warningDays = parseInt(settingsMap.EXPIRY_WARNING_DAYS, 10) || 90;
    } catch(e) {}
    
    const expiryLimit = new Date();
    expiryLimit.setDate(expiryLimit.getDate() + warningDays);
    
    for (let i = 1; i < data.length; i++) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) continue;
      
      const qty = parseInt(data[i][headers.indexOf("Quantity")], 10) || 0;
      const threshold = parseInt(data[i][headers.indexOf("AlertThreshold")], 10) || 0;
      const expDateStr = data[i][headers.indexOf("ExpiryDate")];
      const expDate = expDateStr ? new Date(expDateStr) : null;
      
      let isWarning = false;
      let reason = [];
      
      if (qty <= threshold) {
        isWarning = true;
        reason.push("สต็อกยาต่ำ (คงเหลือ: " + qty + " / แจ้งเตือน: " + threshold + ")");
      }
      
      if (expDate) {
        if (expDate < new Date()) {
          isWarning = true;
          reason.push("หมดอายุเมื่อ " + formatDateThai(expDate));
        } else if (expDate <= expiryLimit) {
          isWarning = true;
          reason.push("ใกล้หมดอายุ (" + formatDateThai(expDate) + ")");
        }
      }
      
      if (isWarning) {
        results.push({
          MedicineCode: data[i][headers.indexOf("MedicineCode")],
          MedicineName: data[i][headers.indexOf("MedicineName")],
          Category: data[i][headers.indexOf("Category")],
          Quantity: qty,
          Unit: data[i][headers.indexOf("Unit")],
          ExpiryDate: expDateStr ? formatDateThai(expDateStr) : "-",
          Reason: reason.join(", "),
          Status: data[i][headers.indexOf("Status")]
        });
      }
    }
    return results;
  }
  
  if (reportType === "visit_stats") {
    // รายงานสถิติการเข้ารับบริการ
    const visitsSheet = ss.getSheetByName("Visits");
    const data = visitsSheet.getLastRow() > 1 ? visitsSheet.getDataRange().getValues() : [];
    const headers = data[0] || [];
    
    const results = [];
    const isDemoIdx = headers.indexOf("IsDemo");
    
    for (let i = 1; i < data.length; i++) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) continue;
      if (data[i][headers.indexOf("VisitStatus")] === "Cancelled") continue;
      
      const vDate = new Date(data[i][headers.indexOf("VisitDate")]);
      
      // กรองตามวันที่
      if (filters) {
        if (filters.startDate) {
          const s = new Date(filters.startDate);
          s.setHours(0,0,0,0);
          if (vDate < s) continue;
        }
        if (filters.endDate) {
          const e = new Date(filters.endDate);
          e.setHours(23,59,59,999);
          if (vDate > e) continue;
        }
        if (filters.recipientType && filters.recipientType !== "All" && data[i][headers.indexOf("RecipientType")] !== filters.recipientType) {
          continue;
        }
      }
      
      results.push({
        VisitID: data[i][0],
        VisitDate: formatDateThai(vDate),
        TimeIn: data[i][headers.indexOf("TimeIn")],
        RecipientName: data[i][headers.indexOf("RecipientName")],
        RecipientType: data[i][headers.indexOf("RecipientType")],
        Group: data[i][headers.indexOf("Group")],
        ChiefComplaint: data[i][headers.indexOf("ChiefComplaint")],
        Outcome: data[i][headers.indexOf("Outcome")],
        RecordedBy: data[i][headers.indexOf("RecordedBy")]
      });
    }
    return results;
  }
  
  if (reportType === "frequent_visits") {
    // รายงานผู้ป่วยเข้ารับบริการบ่อย
    const visitsSheet = ss.getSheetByName("Visits");
    const data = visitsSheet.getLastRow() > 1 ? visitsSheet.getDataRange().getValues() : [];
    const headers = data[0] || [];
    const counts = {};
    
    const isDemoIdx = headers.indexOf("IsDemo");
    
    for (let i = 1; i < data.length; i++) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) continue;
      if (data[i][headers.indexOf("VisitStatus")] === "Cancelled") continue;
      
      const recId = data[i][headers.indexOf("RecipientID")];
      const name = data[i][headers.indexOf("RecipientName")];
      const type = data[i][headers.indexOf("RecipientType")];
      const grp = data[i][headers.indexOf("Group")] + " " + data[i][headers.indexOf("Department")];
      
      if (!counts[recId]) {
        counts[recId] = { id: recId, name: name, type: type, group: grp, count: 0 };
      }
      counts[recId].count++;
    }
    
    let limit = 3;
    try {
      limit = parseInt(getSettingsMap(ss).FREQUENT_VISIT_COUNT, 10) || 3;
    } catch(e) {}
    
    const results = Object.keys(counts)
      .map(k => counts[k])
      .filter(item => item.count >= limit);
      
    results.sort((a, b) => b.count - a.count);
    return results;
  }
  
  if (reportType === "top_medicines") {
    // รายงานยาที่ถูกสั่งจ่ายมากที่สุด
    const dispSheet = ss.getSheetByName("Dispensing");
    const data = dispSheet.getLastRow() > 1 ? dispSheet.getDataRange().getValues() : [];
    const headers = data[0] || [];
    const counts = {};
    const isDemoIdx = headers.indexOf("IsDemo");
    
    for (let i = 1; i < data.length; i++) {
      const rowIsDemo = data[i][isDemoIdx] === true || data[i][isDemoIdx] === "TRUE" || String(data[i][isDemoIdx]).toUpperCase() === 'TRUE';
      if (isDemo !== rowIsDemo) continue;
      if (data[i][headers.indexOf("Status")] === "Cancelled") continue;
      
      const medName = data[i][headers.indexOf("MedicineName")];
      const qty = parseInt(data[i][headers.indexOf("Quantity")], 10) || 0;
      
      if (!counts[medName]) {
        counts[medName] = 0;
      }
      counts[medName] += qty;
    }
    
    const results = Object.keys(counts).map(k => {
      return { MedicineName: k, TotalDispensed: counts[k] };
    });
    results.sort((a, b) => b.TotalDispensed - a.TotalDispensed);
    return results;
  }
  
  return [];
}

/**
 * ส่งออกรายงานในรูปแบบเนื้อหา CSV
 */
function exportReportCsv(sessionToken, reportType, filters) {
  const data = getReports(sessionToken, reportType, filters);
  if (data.length === 0) return "";
  
  const headers = Object.keys(data[0]);
  let csvContent = "\uFEFF"; // ใส่ BOM ป้องกันปัญหาสระภาษาไทยเพี้ยนใน Excel
  
  csvContent += headers.join(",") + "\n";
  
  data.forEach(item => {
    const row = headers.map(h => {
      let val = String(item[h] !== undefined ? item[h] : "");
      // แปลงอักขระพิเศษเพื่อไม่ให้ CSV แตกโครงสร้าง
      if (val.indexOf(",") !== -1 || val.indexOf("\n") !== -1 || val.indexOf('"') !== -1) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    csvContent += row.join(",") + "\n";
  });
  
  return csvContent;
}

// ==========================================
// ส่วนจัดการบัญชีผู้ใช้งาน (Users) - ADMIN เท่านั้น
// ==========================================

/**
 * ดึงข้อมูลบัญชีผู้ใช้งานทั้งหมด
 */
function getUsers(sessionToken) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") throw new Error("สิทธิ์ไม่เพียงพอ");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    headers.forEach((h, idx) => {
      // ไม่ส่งรหัสผ่าน hash กลับหน้าเว็บเพื่อความปลอดภัยสูงสุด
      if (h !== "PasswordHash") {
        item[h] = data[i][idx];
      }
    });
    results.push(item);
  }
  return results;
}

/**
 * เพิ่มหรืออัปเดตผู้ใช้ระบบ
 */
function saveUser(sessionToken, userData) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") throw new Error("สิทธิ์ไม่เพียงพอ");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const usernameIdx = headers.indexOf("Username");
  
  const targetUsername = sanitizeInput(userData.Username).trim().toLowerCase();
  if (targetUsername === "") throw new Error("จำเป็นต้องระบุชื่อผู้ใช้งาน");
  
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][usernameIdx].toLowerCase() === targetUsername) {
      targetRow = i + 1;
      break;
    }
  }
  
  const isEdit = targetRow !== -1;
  
  if (!isEdit && !userData.Password) {
    throw new Error("จำเป็นต้องกำหนดรหัสผ่านสำหรับการสร้างบัญชีใหม่");
  }
  
  const rowValues = [];
  headers.forEach(h => {
    switch (h) {
      case "Username":
        rowValues.push(targetUsername);
        break;
      case "PasswordHash":
        if (userData.Password) {
          rowValues.push(hashPassword(userData.Password));
        } else {
          rowValues.push(data[targetRow - 1][headers.indexOf("PasswordHash")]);
        }
        break;
      case "Role":
        rowValues.push(userData.Role || "VIEWER");
        break;
      case "FullName":
        rowValues.push(sanitizeInput(userData.FullName));
        break;
      case "IsActive":
        rowValues.push(userData.IsActive === undefined ? true : (userData.IsActive === true || userData.IsActive === "TRUE"));
        break;
      case "CreatedAt":
        rowValues.push(isEdit ? data[targetRow - 1][headers.indexOf("CreatedAt")] : new Date());
        break;
      case "IsDemoUser":
        rowValues.push(userData.Role === "DEMO");
        break;
      default:
        rowValues.push("");
    }
  });
  
  if (isEdit) {
    // ป้องกันการระงับสิทธิ์ admin ตนเอง
    if (targetUsername === "admin" && userData.IsActive === false) {
      throw new Error("ระบบไม่อนุญาตให้ระงับสิทธิ์บัญชีผู้ดูแลระบบหลัก (admin)");
    }
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
    writeAuditLog(ss, session.username, session.role, "USER_UPDATE", "แก้ไขบัญชีผู้ใช้งาน: " + targetUsername);
  } else {
    sheet.appendRow(rowValues);
    writeAuditLog(ss, session.username, session.role, "USER_CREATE", "เพิ่มบัญชีผู้ใช้งานใหม่: " + targetUsername);
  }
  
  return { success: true, message: "บันทึกข้อมูลผู้ใช้งานสำเร็จ" };
}

/**
 * เปลี่ยนรหัสผ่านของผู้ใช้ (เฉพาะตัว admin หรือเปลี่ยนให้ตนเอง)
 */
function changeUserPassword(sessionToken, username, newPassword) {
  const session = validateSession(sessionToken);
  username = sanitizeInput(username).trim().toLowerCase();
  
  if (session.role !== "ADMIN" && session.username !== username) {
    throw new Error("คุณสามารถเปลี่ยนได้เฉพาะรหัสผ่านของบัญชีคุณเองเท่านั้น");
  }
  
  if (username === "demo") {
    throw new Error("ไม่อนุญาตให้เปลี่ยนรหัสผ่านของบัญชีสาธิตระบบ");
  }
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const usernameIdx = headers.indexOf("Username");
  const passIdx = headers.indexOf("PasswordHash");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][usernameIdx].toLowerCase() === username) {
      sheet.getRange(i + 1, passIdx + 1).setValue(hashPassword(newPassword));
      writeAuditLog(ss, session.username, session.role, "USER_PASSWORD", "เปลี่ยนรหัสผ่านสำเร็จของบัญชี: " + username);
      return { success: true, message: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" };
    }
  }
  throw new Error("ไม่พบชื่อผู้ใช้งานระบบรายนี้");
}

/**
 * เปิด/ปิดใช้งานสิทธิ์ใช้งานบัญชี
 */
function updateUserStatus(sessionToken, username, isActive) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") throw new Error("สิทธิ์ไม่เพียงพอ");
  
  username = sanitizeInput(username).trim().toLowerCase();
  if (username === "admin") throw new Error("ไม่สามารถระงับการใช้งานบัญชี admin หลักได้");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const usernameIdx = headers.indexOf("Username");
  const activeIdx = headers.indexOf("IsActive");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][usernameIdx].toLowerCase() === username) {
      sheet.getRange(i + 1, activeIdx + 1).setValue(isActive);
      writeAuditLog(ss, session.username, session.role, "USER_STATUS", "ปรับสถานะสิทธิ์ " + username + " เป็น " + isActive);
      return { success: true, message: "ปรับสถานะสำเร็จ" };
    }
  }
  throw new Error("ไม่พบข้อมูลผู้ใช้");
}

// ==========================================
// ส่วนจัดการตั้งค่าระบบ (Settings) - ADMIN เท่านั้น
// ==========================================

/**
 * ดึงแมปค่าตั้งค่าในรูปแบบ Key-Value ออบเจกต์
 */
function getSettingsMap(ss) {
  const activeSs = ss || getSpreadsheet();
  const sheet = activeSs.getSheetByName("Settings");
  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    settings[data[i][0]] = data[i][1];
  }
  return settings;
}

/**
 * ดึงค่าตั้งค่าส่งไปแสดงที่หน้า UI
 */
function getSettings(sessionToken) {
  validateSession(sessionToken);
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  const data = sheet.getDataRange().getValues();
  
  const results = [];
  for (let i = 1; i < data.length; i++) {
    results.push({
      SettingKey: data[i][0],
      SettingValue: data[i][1],
      Description: data[i][2]
    });
  }
  return results;
}

/**
 * บันทึกค่าตั้งค่าระบบ (เฉพาะสิทธิ์ ADMIN เท่านั้น)
 */
function saveSettings(sessionToken, settingsMap) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") throw new Error("ไม่มีสิทธิ์แก้ไขตั้งค่าระบบ");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  const data = sheet.getDataRange().getValues();
  const keyIdx = 0;
  const valIdx = 1;
  
  const timestamp = new Date();
  
  for (let key in settingsMap) {
    let sanitizedVal = sanitizeInput(String(settingsMap[key]));
    
    // ค้นหาและบันทึกคีย์เดิม
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][keyIdx] === key) {
        sheet.getRange(i + 1, valIdx + 1).setValue(sanitizedVal);
        sheet.getRange(i + 1, 4).setValue(timestamp);
        sheet.getRange(i + 1, 5).setValue(session.username);
        found = true;
        break;
      }
    }
    
    // ป้องกันการสูญหาย หากคีย์ไม่มีให้แทรกบรรทัดเพิ่ม
    if (!found) {
      sheet.appendRow([key, sanitizedVal, "ตั้งค่าเพิ่มเติมผ่าน UI", timestamp, session.username]);
    }

    // ซิงค์ค่าความลับเข้า Script Properties หลังบ้านทันที
    const secretKeys = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "GOOGLE_FORM_ID", "GOOGLE_SLIDES_TEMPLATE_ID", "SPREADSHEET_ID"];
    if (secretKeys.indexOf(key) !== -1 && sanitizedVal) {
      try {
        PropertiesService.getScriptProperties().setProperty(key, sanitizedVal);
      } catch (propErr) {}
    }
  }
  
  writeAuditLog(ss, session.username, session.role, "SETTINGS_UPDATE", "ปรับเปลี่ยนการตั้งค่าระบบผ่านหน้าจอ");
  return { success: true, message: "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว" };
}

/**
 * รีเซ็ตค่าตั้งค่ากลับเป็นดีฟอลต์ (ADMIN เท่านั้น)
 */
function restoreDefaultSettings(sessionToken) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") throw new Error("สิทธิ์ไม่เพียงพอ");
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  
  // ลบข้อมูลแถวยกเว้นหัวตาราง
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  initializeDefaultSettings(ss);
  writeAuditLog(ss, session.username, session.role, "SETTINGS_RESTORE", "คืนค่าตั้งค่าเริ่มต้นระบบทั้งหมด");
  return { success: true, message: "คืนค่าระบบเริ่มต้นสำเร็จ" };
}

// ==========================================
// ส่วนล้างข้อมูลระบบจริง (Operational Data Clearance) - ADMIN เท่านั้น
// ==========================================

/**
 * ล้างข้อมูลการดำเนินงานจริงทั้งหมด (IsDemo = FALSE)
 * ฟังก์ชันป้องกันเข้มงวด ยืนยันรหัสผ่านและข้อความระบุ
 */
function clearOperationalData(sessionToken, password, confirmationText) {
  const session = validateSession(sessionToken);
  if (session.role !== "ADMIN") {
    throw new Error("สิทธิ์ขั้นสูงจำกัดเฉพาะผู้ดูแลระบบหลักของโครงการเท่านั้น");
  }
  
  if (session.username === "demo") {
    throw new Error("บัญชีสาธิตระบบไม่มีสิทธิ์เรียกใช้งานคำสั่งนี้");
  }
  
  // ตรวจสอบการยืนยันรหัสผ่าน
  const ss = getSpreadsheet();
  const usersSheet = ss.getSheetByName("Users");
  const users = usersSheet.getDataRange().getValues();
  const hash = hashPassword(password);
  
  let validPassword = false;
  for (let i = 1; i < users.length; i++) {
    if (users[i][0] === session.username && users[i][1] === hash) {
      validPassword = true;
      break;
    }
  }
  
  if (!validPassword) {
    throw new Error("รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง คำขอถูกระงับการทำงาน");
  }
  
  if (confirmationText !== "ล้างข้อมูลระบบจริงทั้งหมด") {
    throw new Error("กรุณาพิมพ์ยืนยันคำว่า 'ล้างข้อมูลระบบจริงทั้งหมด' เพื่อทำรายการ");
  }
  
  // ลบเฉพาะข้อมูลที่ IsDemo = FALSE
  const sheetsToClear = [
    "ServiceRecipients", "Visits", "Vitals", "Assessments", 
    "Treatments", "Medicines", "Dispensing", "InventoryTransactions", 
    "ContactNotifications", "Referrals", "FollowUps", "Attachments"
  ];
  
  writeAuditLog(ss, session.username, session.role, "DB_CLEAR_START", "เริ่มต้นกระบวนการล้างข้อมูลระบบจริงทั้งหมด");
  
  const report = {};
  sheetsToClear.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const deletedCount = clearRealRows(sheet, "IsDemo");
      report[sheetName] = deletedCount;
    } else {
      report[sheetName] = 0;
    }
  });
  
  writeAuditLog(ss, session.username, session.role, "DB_CLEAR_END", "ดำเนินการล้างข้อมูลระบบจริงเสร็จสิ้น ผลกระทบแถว: " + JSON.stringify(report));
  return { success: true, report: report, message: "ดำเนินการล้างข้อมูลดำเนินงานจริงเรียบร้อยแล้วโดยปลอดภัย" };
}

/**
 * ลบแถวข้อมูลจริง (IsDemo = FALSE)
 */
function clearRealRows(sheet, isDemoColumnName) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(1, 1, lastRow, lastCol);
  const values = range.getValues();
  const headers = values[0];
  const isDemoIndex = headers.indexOf(isDemoColumnName);
  if (isDemoIndex === -1) return 0;
  
  const newValues = [headers];
  let deletedCount = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const isDemoVal = row[isDemoIndex];
    // ถ้าเป็น FALSE หรือ ว่างเปล่า หรือไม่ใช่ TRUE จะถือว่าเป็นข้อมูลจริง
    if (isDemoVal === false || isDemoVal === "FALSE" || String(isDemoVal).toUpperCase() === 'FALSE' || isDemoVal === "") {
      deletedCount++;
    } else {
      newValues.push(row);
    }
  }
  
  if (deletedCount > 0) {
    sheet.getRange(1, 1, newValues.length, headers.length).setValues(newValues);
    const remainingRows = newValues.length;
    const rowsToDelete = lastRow - remainingRows;
    if (rowsToDelete > 0) {
      sheet.deleteRows(remainingRows + 1, rowsToDelete);
    }
  }
  return deletedCount;
}

/**
 * ส่งข้อความแจ้งเตือนเข้าห้อง Telegram
 */
function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    "chat_id": TELEGRAM_CHAT_ID,
    "text": message,
    "parse_mode": "HTML"
  };
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log("Error sending Telegram message: " + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * ฟังก์ชันดึงคำตอบจาก Google Form และส่งแจ้งเตือน Telegram พร้อมกัน
 */
function myFunction() {
  try {
    const formId = GOOGLE_FORM_ID || getBackendConfig("GOOGLE_FORM_ID");
    if (!formId) {
      throw new Error("GOOGLE_FORM_ID ยังไม่ได้กำหนดในระบบหลังบ้าน (Script Properties)");
    }
    const form = FormApp.openById(formId);
    const responses = form.getResponses();
    if (responses.length === 0) {
      sendTelegramNotification("🔔 <b>แจ้งเตือน:</b> ฟังก์ชันทำงานแต่ยังไม่มีผู้ตอบแบบฟอร์ม");
      return;
    }
    const latestResponse = responses[responses.length - 1];
    const itemResponses = latestResponse.getItemResponses();
    
    let message = "📝 <b>ข้อมูลนำส่งแบบฟอร์มสุขภาพใหม่ (Google Form)</b>\n";
    message += `📅 <b>เวลาบันทึก:</b> ${latestResponse.getTimestamp().toLocaleString('th-TH')}\n`;
    const email = latestResponse.getRespondentEmail();
    if (email) {
      message += `👤 <b>ผู้บันทึก:</b> ${email}\n`;
    }
    message += `\n`;
    
    for (let i = 0; i < itemResponses.length; i++) {
      const title = itemResponses[i].getItem().getTitle();
      const response = itemResponses[i].getResponse();
      const responseText = Array.isArray(response) ? response.join(', ') : response;
      message += `🔹 <b>${title}:</b> ${responseText}\n`;
    }
    
    // สร้างเอกสารประกอบการตรวจรักษาจาก Google Slides Template!
    try {
      const templateId = GOOGLE_SLIDES_TEMPLATE_ID || getBackendConfig("GOOGLE_SLIDES_TEMPLATE_ID");
      if (templateId) {
        const docResult = createDocumentFromForm(latestResponse, templateId);
        message += `\n📂 <b>เอกสารบันทึกการตรวจรักษา:</b>\n👉 <a href="${docResult.url}">คลิกเพื่อเปิดดูเอกสาร (Google Slides)</a>\n`;
      }
    } catch (docErr) {
      Logger.log("Error generating document: " + docErr.message);
      message += `\n⚠️ <b>ไม่สามารถสร้างเอกสารบันทึกได้:</b> ${docErr.message}\n`;
    }
    
    sendTelegramNotification(message);
  } catch (e) {
    Logger.log("Error in myFunction: " + e.message);
    sendTelegramNotification(`⚠️ <b>เกิดข้อผิดพลาดในการตรวจสอบ Form:</b>\n${e.message}`);
  }
}

/**
 * คัดลอกและสร้างเอกสารจากสไลด์เทมเพลต โดยการแทนที่แท็ก <<...>> ด้วยค่าคำตอบจริง
 */
function createDocumentFromForm(latestResponse, templateId) {
  const templateFile = DriveApp.getFileById(templateId);
  const itemResponses = latestResponse.getItemResponses();
  
  // ค้นหาชื่อและรหัส นพอ. เพื่อนำมาตั้งชื่อไฟล์
  let respondentName = "";
  let studentId = "";
  let rank = "";
  
  itemResponses.forEach(item => {
    const title = item.getItem().getTitle();
    const respVal = String(item.getResponse()).trim();
    if (title.indexOf("ชื่อ") > -1 && title.indexOf("นามสกุล") === -1) {
      respondentName = respVal;
    } else if (title.indexOf("รหัส") > -1 || title.indexOf("นพอ") > -1) {
      studentId = respVal;
    } else if (title.indexOf("ยศ") > -1) {
      rank = respVal;
    }
  });
  
  const timestampStr = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
  const studentIdStr = studentId ? `_${studentId}` : "";
  const nameStr = respondentName ? `_${rank}${respondentName}` : "";
  const newFileName = `บันทึกตรวจรักษา${nameStr}${studentIdStr}_${timestampStr}`;
  
  // คัดลอกเทมเพลตสไลด์
  const copiedFile = templateFile.makeCopy(newFileName);
  const copiedId = copiedFile.getId();
  
  const presentation = SlidesApp.openById(copiedId);
  const slides = presentation.getSlides();
  
  // ประกาศแมปรวมสำหรับการแทนที่แท็กต่างๆ
  const replacements = {};
  
  // ตั้งค่าดีฟอลต์ทั้งหมดเพื่อป้องกันแท็กค้าง
  const allTags = [
    "ยศ", "ชื่อ", "นามสกุล", "ชั้นปี", "ไปตรวจ/รักษาที่", "เนื่องจาก", 
    "แผนกที่ไปตรวจ/รักษา", "อาการสำคัญ (CC)", "รหัส นพอ. 7 หลัก", 
    "ลงวันที่", "ปี", "เดือน", "Timestamp", "Email Address", 
    "การวินิจฉัยของแพทย์ (Dx)", "การรักษาของแพทย์", "ยา/วัคซีนที่ได้รับ (ระบุขนาด และ วิธีใช้อย่างชัดเจน)"
  ];
  allTags.forEach(tag => {
    replacements[`<<${tag}>>`] = "";
  });
  
  // เติมข้อมูลระบบพื้นฐาน
  replacements["<<Timestamp>>"] = latestResponse.getTimestamp() ? Utilities.formatDate(latestResponse.getTimestamp(), "GMT+7", "dd/MM/yyyy HH:mm:ss") : "";
  replacements["<<Email Address>>"] = latestResponse.getRespondentEmail() || "";
  
  // แมปคำตอบจากฟอร์มเข้าสู่แท็กโดยเทียบคำคีย์หลัก
  itemResponses.forEach(item => {
    const title = item.getItem().getTitle().trim();
    const response = item.getResponse();
    const responseText = Array.isArray(response) ? response.join(', ') : String(response);
    
    if (title.indexOf("ยศ") > -1) {
      replacements["<<ยศ>>"] = responseText;
    } else if (title.indexOf("นามสกุล") > -1) {
      replacements["<<นามสกุล>>"] = responseText;
    } else if (title.indexOf("ชื่อ") > -1) {
      replacements["<<ชื่อ>>"] = responseText;
    } else if (title.indexOf("ชั้นปี") > -1) {
      replacements["<<ชั้นปี>>"] = responseText;
    } else if (title.indexOf("ตรวจ/รักษาที่") > -1 || title.indexOf("โรงพยาบาลที่") > -1 || title.indexOf("สถานที่ตรวจ") > -1) {
      replacements["<<ไปตรวจ/รักษาที่>>"] = responseText;
    } else if (title.indexOf("เนื่องจาก") > -1) {
      replacements["<<เนื่องจาก>>"] = responseText;
    } else if (title.indexOf("แผนก") > -1) {
      replacements["<<แผนกที่ไปตรวจ/รักษา>>"] = responseText;
    } else if (title.indexOf("อาการสำคัญ") > -1 || title.indexOf("CC") > -1) {
      replacements["<<อาการสำคัญ (CC)>>"] = responseText;
    } else if (title.indexOf("รหัส") > -1 || title.indexOf("นพอ") > -1) {
      replacements["<<รหัส นพอ. 7 หลัก>>"] = responseText;
    } else if (title.indexOf("ลงวันที่") > -1 || title.indexOf("วันที่ตรวจ") > -1) {
      replacements["<<ลงวันที่>>"] = responseText;
    } else if (title.indexOf("ปี") > -1 && title.length < 5) {
      replacements["<<ปี>>"] = responseText;
    } else if (title.indexOf("เดือน") > -1) {
      replacements["<<เดือน>>"] = responseText;
    } else if (title.indexOf("วินิจฉัย") > -1 || title.indexOf("Dx") > -1) {
      replacements["<<การวินิจฉัยของแพทย์ (Dx)>>"] = responseText;
    } else if (title.indexOf("การรักษา") > -1) {
      replacements["<<การรักษาของแพทย์>>"] = responseText;
    } else if (title.indexOf("ยา") > -1 || title.indexOf("วัคซีน") > -1) {
      replacements["<<ยา/วัคซีนที่ได้รับ (ระบุขนาด และ วิธีใช้อย่างชัดเจน)>>"] = responseText;
    }
  });
  
  // ทำการแทนที่คำทั้งหมดลงในทุกสไลด์
  slides.forEach(slide => {
    for (let tag in replacements) {
      try {
        slide.replaceAllText(tag, replacements[tag]);
      } catch (replaceErr) {
        // ละเว้นกรณีไม่มีตัวหนังสือสอดคล้อง
      }
    }
  });
  
  presentation.saveAndClose();
  
  // ตั้งค่าแชร์ให้ทุกคนเปิดลิงก์อ่านได้
  try {
    copiedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) {
    Logger.log("Failed to set file sharing permissions: " + shareErr.message);
  }
  
  return {
    name: newFileName,
    url: copiedFile.getUrl(),
    id: copiedId
  };
}

/**
 * ฟังก์ชันสำหรับจำลองส่งฟอร์มเพื่อทดสอบระบบส่งแจ้งเตือน Telegram + Google Slides ทันที!
 */
function testSubmitForm() {
  try {
    const formId = GOOGLE_FORM_ID || getBackendConfig("GOOGLE_FORM_ID");
    if (!formId) {
      throw new Error("GOOGLE_FORM_ID ยังไม่ได้กำหนดในระบบหลังบ้าน (Script Properties)");
    }
    const form = FormApp.openById(formId);
    const response = form.createResponse();
    const items = form.getItems();
    
    items.forEach(item => {
      let responseVal = "";
      const title = item.getTitle();
      
      if (title.indexOf("ยศ") > -1) {
        responseVal = "นทพ.";
      } else if (title.indexOf("นามสกุล") > -1) {
        responseVal = "ใจดี";
      } else if (title.indexOf("ชื่อ") > -1) {
        responseVal = "สมใจ";
      } else if (title.indexOf("ชั้นปี") > -1) {
        responseVal = "ชั้นปีที่ 3";
      } else if (title.indexOf("ตรวจ/รักษาที่") > -1 || title.indexOf("โรงพยาบาล") > -1) {
        responseVal = "รพ.ภูมิพลอดุลยเดช พอ.";
      } else if (title.indexOf("เนื่องจาก") > -1) {
        responseVal = "อาการปวดท้อง ท้องเสียอย่างรุนแรง";
      } else if (title.indexOf("แผนก") > -1) {
        responseVal = "อายุรกรรมทางเดินอาหาร";
      } else if (title.indexOf("อาการสำคัญ") > -1 || title.indexOf("CC") > -1) {
        responseVal = "ปวดบิดเกร็งบริเวณท้อง ถ่ายเหลวเป็นน้ำ 4 ครั้ง มีไข้ต่ำๆ";
      } else if (title.indexOf("รหัส") > -1 || title.indexOf("นพอ") > -1) {
        responseVal = "6904321";
      } else if (title.indexOf("ลงวันที่") > -1) {
        responseVal = "04/08/2569";
      } else if (title.indexOf("ปี") > -1 && title.length < 5) {
        responseVal = "2569";
      } else if (title.indexOf("เดือน") > -1) {
        responseVal = "สิงหาคม";
      } else if (title.indexOf("วินิจฉัย") > -1 || title.indexOf("Dx") > -1) {
        responseVal = "Acute Gastroenteritis (ลำไส้อักเสบเฉียบพลัน)";
      } else if (title.indexOf("การรักษา") > -1) {
        responseVal = "ให้สารน้ำชดเชยทางหลอดเลือดดำและยารับประทาน ให้พักผ่อน 1 วัน";
      } else if (title.indexOf("ยา") > -1 || title.indexOf("วัคซีน") > -1) {
        responseVal = "ORS 1 ซอง ละลายน้ำดื่ม, Buscopan 10mg 1 เม็ด ทุก 8 ชั่วโมง เวลาปวดเกร็งท้อง, ORS ชดเชยน้ำ";
      } else {
        // ดีฟอลต์ทั่วไป
        if (item.getType() === FormApp.ItemType.TEXT) {
          responseVal = "ข้อมูลจำลอง";
        }
      }
      
      if (responseVal) {
        try {
          if (item.getType() === FormApp.ItemType.TEXT) {
            response.withItemResponse(item.asTextItem().createResponse(responseVal));
          } else if (item.getType() === FormApp.ItemType.PARAGRAPH_TEXT) {
            response.withItemResponse(item.asParagraphTextItem().createResponse(responseVal));
          } else if (item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
            const mcItem = item.asMultipleChoiceItem();
            const choices = mcItem.getChoices();
            const choiceVal = choices.length > 0 ? choices[0].getValue() : responseVal;
            response.withItemResponse(mcItem.createResponse(choiceVal));
          } else if (item.getType() === FormApp.ItemType.CHECKBOX) {
            const cbItem = item.asCheckboxItem();
            const choices = cbItem.getChoices();
            const choiceVals = choices.length > 0 ? [choices[0].getValue()] : [responseVal];
            response.withItemResponse(cbItem.createResponse(choiceVals));
          } else if (item.getType() === FormApp.ItemType.LIST) {
            const listItem = item.asListItem();
            const choices = listItem.getChoices();
            const choiceVal = choices.length > 0 ? choices[0].getValue() : responseVal;
            response.withItemResponse(listItem.createResponse(choiceVal));
          }
        } catch (itemErr) {
          // ละเว้นกรณีประเภทไอเทมไม่รองรับการแปลงแบบตรงไปตรงมา
        }
      }
    });
    
    // ส่งคำตอบเข้าไปใน Form
    response.submit();
    Logger.log("จำลองส่งฟอร์มสำเร็จ กำลังเรียกฟังก์ชันส่งแจ้งเตือน Telegram...");
    
    // รันฟังก์ชันส่งแจ้งเตือนต่อทันที
    myFunction();
    Logger.log("รันทดสอบแจ้งเตือนเรียบร้อยแล้ว!");
  } catch (e) {
    Logger.log("Error in testSubmitForm: " + e.message);
    sendTelegramNotification(`⚠️ <b>เกิดข้อผิดพลาดในการรันทดสอบ:</b>\n${e.message}`);
  }
}
