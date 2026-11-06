/**
 * ============================================================================
 * IMPORT.gs — โมดูลนำเข้าข้อมูลเวชระเบียนจาก Google Drive (one-time + idempotent)
 * ============================================================================
 * ออกแบบให้รันซ้ำได้ (idempotent) โดยไม่สร้างข้อมูลซ้ำ:
 *   - ServiceRecipients : upsert ด้วย NumberOrOrder (รหัส นพอ. 7 หลัก)
 *   - Visits            : กันซ้ำด้วย รหัส + วันที่ + อาการสำคัญ
 *   - Assessments       : ผูกกับ VisitID ที่สร้างใหม่
 *   - Treatments        : ผูกกับ VisitID ที่สร้างใหม่
 *   - Vaccinations      : กันซ้ำด้วย รหัส + วันที่ + ชื่อวัคซีน
 *   - Certificates      : กันซ้ำด้วย รหัส + วันที่ + โรงพยาบาล
 *   - PhotoIndex        : แมปรหัส -> File ID รูปจากโฟลเดอร์ปี 69
 *   - ServiceRecipients : เพิ่มคอลัมน์ PhotoFileId / PhotoUpdatedAt
 *
 * ทุก endpoint ต้องส่ง key ตรงกับ IMPORT_MAINTENANCE_KEY
 * ============================================================================
 */

var IMPORT_MAINTENANCE_KEY_DEFAULT = "rtn-imp-2569-8f3c1a";

var IMPORT_CFG = {
  // ฟอร์มบันทึกไปตรวจ/รักษา 2 ชุด (Google Sheets)
  FORM_SOURCE_IDS: [
    "1BXw8B678yGHQPYxYi0zaRIFrZV9nblPVhJa5KJnZKdY",
    "1xnVassX2yo3BNUWd708mD3vqB0ZymHj4g37K3ye3aAM"
  ],
  // โฟลเดอร์รายงานรายเดือน (xlsx)
  MONTHLY_FOLDER_ID: "1Mmbx2Msdm_767GdfjGaKOpdJF1vhn9CY",
  MONTHLY_EXTRA_FILE_IDS: [
    "1-UX7OEEWgo7ear6KJTCJmARvROycepZh"
  ],
  // วัคซีน / ใบรับรองแพทย์ (xlsx)
  VACCINE_SOURCE_IDS: ["10uCotuMlQoZsuRMAG8oR7_dmqXUqFDOg"],
  CERT_SOURCE_IDS: ["1Lxcio7Rzd1TYRO9wP1b3VmGGsMX9Ah7u"],
  // เอกสารประวัติส่วนตัวรายคนใน "Smart database ปีการศึกษา 2567" และ "smart data base 2568"
  // หมายเหตุ: โฟลเดอร์ "มว. 2 บันทึกสุขภาพ" (2567) ไม่มีไฟล์ และ 2568 ไม่มีโฟลเดอร์สุขภาพ
  // ข้อมูลสุขภาพเชิงโครงสร้างจึงมาจากฟอร์ม/วัคซีน/ใบรับรอง; โฟลเดอร์เหล่านี้ให้เอกสารรายคน
  SMART_DOC_FOLDERS: [
    { id: "1jD6dLtUFzYeRKLM-QYa3_QrElqQDN88T", code: "2567", label: "ประวัติส่วนตัว ปีการศึกษา 2567" },
    { id: "1zgTdiKZabRza7qCLV67Srcc-ASfMThlu", code: "2568", label: "ประวัติส่วนตัวปีการศึกษา 68" }
  ],
  // ทะเบียนรายชื่อ (xlsx) — photo registry เป็นเพียงตารางสรุป จึงไม่ใช้เป็นแหล่งรายชื่อ
  ROSTER_SOURCE_IDS: [
    "10TuQnYTkrJbdxcmJSQU2jLUn3h5hix10" // รายชื่อ นพอ.ปี 69.xlsx
  ],
  // โฟลเดอร์รูป (ใช้เป็นหลัก) — ปี 1..4 ของปีการศึกษา 2569
  PHOTO_FOLDERS: [
    { code: "69", year: 1, id: "11-YKNa4GQR_tdSbHMCm7dR0-1iFoQbjR" },
    { code: "68", year: 2, id: "1d9PRDZ3rVKt4gb-thT2PAVB0u-5YHu_b" },
    { code: "67", year: 3, id: "1STOFoDot7JZcF0V5HyPVbcFoBCFbCK1l" },
    { code: "66", year: 4, id: "1PIPLY5GFTvalesWlo-o84VxMwZJrz1l1" }
  ],
  // โฟลเดอร์สำรอง (ใช้เมื่อไม่พบรูปในโฟลเดอร์หลัก)
  PHOTO_FALLBACK_FOLDERS: [
    { code: "66", year: 4, id: "1Mms3QNFALSqYv2CRYGajbjkEoqrg2Zl2" },
    { code: "67", year: 3, id: "18sFnPH4m84pLKQTU71dfC7EGGM2kzM3P" },
    { code: "68", year: 2, id: "1C5x5ZY_Bu3Y2YkpJyn8wn6hHNC38C6ZM" },
    { code: "69", year: 1, id: "1Mlv77pqy1HmlKP_bWK1Eux2ApihEtBoK" }
  ],
  // โฟลเดอร์ต้นทางของระบบเวชระเบียน (สำหรับจัดระเบียบ)
  MEDICAL_ROOT_FOLDER_ID: "1xVNYLtI1eoAx6hWEYzolqCaGBhXOBfbw",
  ARCHIVE_FOLDER_NAME: "RTAFNC_NON_MEDICAL_ARCHIVE_2569",
  // ชื่อโฟลเดอร์/ไฟล์ที่ไม่เกี่ยวกับเวชระเบียน (ย้ายออก)
  // หมายเหตุ: "Smart database ปีการศึกษา 2567" และ "smart data base 2568"
  // มีโฟลเดอร์บันทึกความดีอยู่ภายใน จึงไม่ถูกย้ายโดยอัตโนมัติ (ห้ามแตะ project ความดี)
  NON_MEDICAL_NAMES: [
    "03_ทุนการศึกษา",
    "03_ทุนการศึกษา 2",
    "สำเนาของ สำเนาของ update count ID AUTO ระบบแจ้งซ่อม_ 2.xlsx",
    "RTAFNC ONE Health — STAGING",
    "RTAFNC_HEALTH_CLOUDFLARE_STAGING_v1.1.zip"
  ],
  BATCH_LIMIT: 20000
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function importKey_() {
  return getBackendConfig("IMPORT_MAINTENANCE_KEY", IMPORT_MAINTENANCE_KEY_DEFAULT);
}

function assertImportKey_(key) {
  if (String(key || "") !== String(importKey_())) {
    throw new Error("IMPORT_KEY_INVALID");
  }
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss");
}

function normText_(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function normKey_(v) {
  return normText_(v).toLowerCase().replace(/[\s\-_.]/g, "");
}

function digitsOnly_(v) {
  return String(v === null || v === undefined ? "" : v).replace(/\D/g, "");
}

function isSevenDigitCode_(v) {
  return /^[0-9]{7}$/.test(digitsOnly_(v));
}

function pad2_(n) { return ("0" + n).slice(-2); }

function dateKey_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + pad2_(d.getMonth() + 1) + "-" + pad2_(d.getDate());
}

/** แปลงค่าจากชีต/ฟอร์มเป็น Date (รองรับสตริง dd/MM/yyyy HH:mm:ss และ พ.ศ.) */
function parseDateValue_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    // Excel serial
    if (v > 20000 && v < 90000) {
      return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400) * 1000);
    }
    return null;
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    var y = parseInt(m[3], 10);
    if (y > 2400) y -= 543;
    return new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10),
      parseInt(m[4] || 0, 10), parseInt(m[5] || 0, 10), parseInt(m[6] || 0, 10));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    var y2 = parseInt(m[1], 10);
    if (y2 > 2400) y2 -= 543;
    return new Date(y2, parseInt(m[2], 10) - 1, parseInt(m[3], 10),
      parseInt(m[4] || 0, 10), parseInt(m[5] || 0, 10), parseInt(m[6] || 0, 10));
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** แปลงปี พ.ศ. ในสตริง เช่น 2569 -> 2026 (คืนค่าเป็น ค.ศ.) */
function toCE_(year) {
  var y = parseInt(year, 10);
  if (isNaN(y)) return null;
  return y > 2400 ? y - 543 : y;
}

/** ประกอบวันที่จากช่องแยก วัน / เดือน / ปี (รองรับชื่อเดือนภาษาไทยและ พ.ศ.) */
function composeDateFromParts_(dayVal, monthVal, yearVal) {
  var day = parseInt(dayVal, 10);
  if (isNaN(day)) {
    var dm = String(dayVal || "").match(/(\d{1,2})/);
    if (!dm) return null;
    day = parseInt(dm[1], 10);
  }
  var month = parseInt(monthVal, 10);
  if (isNaN(month)) {
    var names = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
      "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    var mv = normText_(monthVal);
    for (var i = 0; i < names.length; i++) {
      if (mv && mv.indexOf(names[i]) !== -1) { month = (i % 12) + 1; break; }
    }
  }
  var year = toCE_(yearVal);
  if (!day || !month || month < 1 || month > 12 || !year) return null;
  if (year < 2400 && year > 2100) return null;
  return new Date(year, month - 1, day);
}

// ---------------------------------------------------------------------------
// อ่านไฟล์: Google Sheets / Excel (.xlsx) โดยไม่ต้องใช้ Advanced Drive API
// ---------------------------------------------------------------------------

function readSourceFile_(fileId) {
  fileId = String(fileId || "").trim();
  if (!fileId) throw new Error("ไม่มี fileId");

  // 1) ลองเปิดเป็น Google Sheets ก่อน
  try {
    var ss = SpreadsheetApp.openById(fileId);
    if (ss) {
      var sh = ss.getSheets()[0];
      return {
        id: fileId,
        name: ss.getName(),
        via: "google-sheets",
        rows: sh.getDataRange().getValues()
      };
    }
  } catch (e) {
    // ไม่ใช่ Google Sheets — ไปต่อ
  }

  // 2) Excel
  var file = DriveApp.getFileById(fileId);
  var mime = file.getMimeType();
  if (mime === MimeType.MICROSOFT_EXCEL || /\.xlsx$/i.test(file.getName())) {
    return { id: fileId, name: file.getName(), via: "xlsx", rows: parseXlsxBlob_(file.getBlob()) };
  }
  throw new Error("ไม่รองรับชนิดไฟล์: " + mime + " (" + file.getName() + ")");
}

function xmlChildrenByLocalName_(el, name) {
  var out = [];
  var kids = el.getChildren();
  for (var i = 0; i < kids.length; i++) {
    if (kids[i].getName() === name) out.push(kids[i]);
  }
  return out;
}

function xmlTextDepth_(el) {
  var txt = "";
  var kids = el.getChildren();
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    var nm = k.getName();
    if (nm === "t") txt += k.getText();
    else if (nm === "r" || nm === "is") txt += xmlTextDepth_(k);
  }
  if (kids.length === 0) txt += el.getText();
  return txt;
}

function columnIndexFromRef_(ref) {
  var letters = String(ref || "").replace(/[^A-Z]/g, "");
  var n = 0;
  for (var i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

/**
 * อ่าน .xlsx ด้วย Utilities.unzip + XmlService (ไม่ต้องเปิด Advanced Service)
 */
function parseXlsxBlob_(blob) {
  var files = Utilities.unzip(blob);
  var shared = [];
  var sheetXml = null;
  var target = "xl/worksheets/sheet1.xml";

  for (var i = 0; i < files.length; i++) {
    var nm = files[i].getName();
    if (nm === "xl/sharedStrings.xml") {
      var sst = XmlService.parse(files[i].getDataAsString());
      var sis = xmlChildrenByLocalName_(sst.getRootElement(), "si");
      for (var j = 0; j < sis.length; j++) shared.push(xmlTextDepth_(sis[j]));
    } else if (nm === target) {
      sheetXml = files[i].getDataAsString();
    }
  }
  if (!sheetXml) {
    for (var k = 0; k < files.length; k++) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(files[k].getName())) {
        sheetXml = files[k].getDataAsString();
        break;
      }
    }
  }
  if (!sheetXml) throw new Error("ไม่พบ sheet1.xml ในไฟล์ Excel");

  var doc = XmlService.parse(sheetXml);
  var sheetData = xmlChildrenByLocalName_(doc.getRootElement(), "sheetData")[0];
  if (!sheetData) return [];

  var rows = [];
  var rowEls = sheetData.getChildren();
  for (var r = 0; r < rowEls.length; r++) {
    if (rowEls[r].getName() !== "row") continue;
    var cells = rowEls[r].getChildren();
    var arr = [];
    for (var c = 0; c < cells.length; c++) {
      if (cells[c].getName() !== "c") continue;
      var ref = cells[c].getAttribute("r") ? cells[c].getAttribute("r").getValue() : "";
      var ci = columnIndexFromRef_(ref);
      if (ci < 0) ci = arr.length;
      var t = cells[c].getAttribute("t") ? cells[c].getAttribute("t").getValue() : "";
      var val = "";
      if (t === "inlineStr") {
        val = xmlTextDepth_(cells[c]);
      } else {
        var vEl = xmlChildrenByLocalName_(cells[c], "v")[0];
        var raw = vEl ? vEl.getText() : "";
        if (t === "s") val = shared[parseInt(raw, 10)] || "";
        else if (t === "b") val = raw === "1";
        else val = raw;
      }
      while (arr.length < ci) arr.push("");
      arr[ci] = val;
    }
    rows.push(arr);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

function findCol_(headers, keywords, exact) {
  var hs = headers.map(function (h) { return normText_(h).toLowerCase(); });
  for (var k = 0; k < keywords.length; k++) {
    var kw = String(keywords[k]).toLowerCase();
    for (var i = 0; i < hs.length; i++) {
      if (exact ? hs[i] === kw : hs[i].indexOf(kw) !== -1) return i;
    }
  }
  return -1;
}

function cell_(row, idx) {
  if (!row || idx < 0 || idx >= row.length) return "";
  return row[idx];
}

/** เลือกค่าตามลำดับคอลัมน์ที่ให้มา (คืนค่าแรกที่ไม่ว่าง) */
function pick_(row, headers, keywordGroups) {
  for (var i = 0; i < keywordGroups.length; i++) {
    var idx = findCol_(headers, keywordGroups[i]);
    var v = normText_(cell_(row, idx));
    if (v) return v;
  }
  return "";
}

// ---------------------------------------------------------------------------
// DB scaffolding
// ---------------------------------------------------------------------------

function ensureImportTables_(ss) {
  var created = [];

  var defs = {
    "Vaccinations": [
      "VaccinationID", "RecipientID", "StudentCode", "RecipientName", "VaccineName",
      "DoseNumber", "VaccinationDate", "Site", "LotNumber", "AdministeredBy",
      "Note", "SourceKey", "RecordedAt"
    ],
    "Certificates": [
      "CertificateID", "RecipientID", "StudentCode", "RecipientName", "IssueDate",
      "Hospital", "Diagnosis", "Doctor", "Note", "FileUrl", "SourceKey", "RecordedAt"
    ],
    "PhotoIndex": [
      "StudentCode", "FullName", "YearLevel", "FolderID", "FileID", "FileName",
      "MimeType", "Status", "UpdatedAt"
    ],
    "StudentDocuments": [
      "DocumentID", "StudentCode", "RecipientID", "RecipientName", "DocType",
      "FileName", "FileUrl", "SourceFolder", "SourceKey", "RecordedAt"
    ]
  };

  Object.keys(defs).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      created.push(name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, defs[name].length).setValues([defs[name]]);
      sheet.getRange(1, 1, 1, defs[name].length)
        .setFontWeight("bold").setBackground("#0d9488").setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }
  });

  // เพิ่มคอลัมน์รูปใน ServiceRecipients (ถ้ายังไม่มี)
  var rec = ss.getSheetByName("ServiceRecipients");
  if (rec && rec.getLastRow() > 0) {
    var headers = rec.getRange(1, 1, 1, rec.getLastColumn()).getValues()[0];
    var extra = ["PhotoFileId", "PhotoUpdatedAt"];
    var missing = extra.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length) {
      var start = headers.length + 1;
      rec.getRange(1, start, 1, missing.length).setValues([missing])
        .setFontWeight("bold").setBackground("#0d9488").setFontColor("#ffffff");
    }
  }

  return created;
}

function readTable_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() === 0) return { sheet: sheet, headers: [], rows: [] };
  var values = sheet.getDataRange().getValues();
  return { sheet: sheet, headers: values[0], rows: values.slice(1) };
}

function headerIndexMap_(headers) {
  var map = {};
  headers.forEach(function (h, i) { map[normText_(h)] = i; });
  return map;
}

// ---------------------------------------------------------------------------
// 1) Recipients
// ---------------------------------------------------------------------------

function yearLevelFromCode_(code) {
  var p = String(code).substring(0, 2);
  var map = { "69": 1, "68": 2, "67": 3, "66": 4 };
  return map[p] || 0;
}

function groupLabelForYear_(year) {
  return year ? "นพอ.ชั้นปีที่ " + year : "ศิษย์เก่า/อื่น ๆ";
}

function batchLabelFromCode_(code) {
  return "รุ่นที่ " + String(code).substring(0, 2);
}

function nextRecipientId_(existingIds) {
  var yearTh = String(new Date().getFullYear() + 543).substring(2);
  var prefix = "REC-" + yearTh + "-";
  var max = 0;
  existingIds.forEach(function (id) {
    var s = String(id || "");
    if (s.indexOf(prefix) === 0) {
      var n = parseInt(s.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return function () {
    max++;
    return prefix + ("00000" + max).slice(-5);
  };
}

/**
 * รวมรายชื่อจาก: ฟอร์มทั้ง 2 ชุด + ทะเบียนรายชื่อ + photo registry
 * แล้ว upsert ลง ServiceRecipients
 */
function collectRecipientSources_(report) {
  var byCode = {};

  function add(codeRaw, rank, first, last, year, source) {
    var code = digitsOnly_(codeRaw);
    if (!isSevenDigitCode_(code)) return;
    var rec = byCode[code] || {
      code: code,
      rank: "", first: "", last: "", year: 0, sources: []
    };
    rank = normText_(rank);
    first = normText_(first).replace(/^นพอ\.?\s*/i, "");
    last = normText_(last);
    if (rank && !rec.rank) rec.rank = rank;
    if (first && first.length > rec.first.length) rec.first = first;
    if (last && last.length > rec.last.length) rec.last = last;
    var y = parseInt(year, 10);
    if (y > 0 && y < 9) rec.year = y;
    if (source && rec.sources.indexOf(source) === -1) rec.sources.push(source);
    byCode[code] = rec;
  }

  /** หาแถวหัวตาราง (บางไฟล์มีชื่อรายงานอยู่ด้านบน) */
  function headerRowIndex_(rows) {
    for (var i = 0; i < Math.min(rows.length, 20); i++) {
      var line = (rows[i] || []).map(function (c) { return normText_(c); }).join("|");
      if (line.indexOf("รหัส") !== -1 || line.indexOf("เลขประจำตัว") !== -1 ||
          line.indexOf("ชื่อ-สกุล") !== -1 || line.indexOf("นามสกุล") !== -1) return i;
    }
    return 0;
  }

  /** แยก "ชื่อ-สกุล" ที่รวมอยู่ในช่องเดียว (ตัดคำนำหน้า นพอ. ออก) */
  function splitFullName_(value) {
    var s = normText_(value).replace(/^นพอ\.?\s*/i, "");
    if (!s) return { first: "", last: "" };
    var parts = s.split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts.slice(0, parts.length - 1).join(" "), last: parts[parts.length - 1] };
  }

  // 1.1 ฟอร์มบันทึกการตรวจรักษา
  (IMPORT_CFG.FORM_SOURCE_IDS || []).forEach(function (id) {
    try {
      var src = readSourceFile_(id);
      var h = headerRowIndex_(src.rows);
      var headers = src.rows[h] || [];
      var cCode = findCol_(headers, ["รหัส นพอ", "เลขประจำตัว", "รหัสนักศึกษา", "รหัส", "student"]);
      var cRank = findCol_(headers, ["ยศ", "คำนำหน้า"]);
      var cFirst = findCol_(headers, ["ชื่อ"]);
      var cLast = findCol_(headers, ["นามสกุล"]);
      var cYear = findCol_(headers, ["ชั้นปี"]);
      var n = 0;
      for (var i = h + 1; i < src.rows.length; i++) {
        var row = src.rows[i];
        var code = digitsOnly_(cell_(row, cCode));
        if (!isSevenDigitCode_(code)) continue;
        add(code, cell_(row, cRank), cell_(row, cFirst), cell_(row, cLast), cell_(row, cYear), "form:" + src.name);
        n++;
      }
      report.logs.push("อ่านรายชื่อจากฟอร์ม '" + src.name + "': " + n + " แถว");
    } catch (e) {
      report.errors.push("ฟอร์ม " + id + ": " + e.message);
    }
  });

  // 1.2 ทะเบียนรายชื่อ (ไฟล์ Excel ที่มีหัวตารางอยู่ด้านล่างชื่อรายงาน)
  (IMPORT_CFG.ROSTER_SOURCE_IDS || []).forEach(function (id) {
    try {
      var src = readSourceFile_(id);
      var h = headerRowIndex_(src.rows);
      var headers = src.rows[h] || [];
      var cCode = findCol_(headers, ["รหัส นพอ", "เลขประจำตัว", "รหัสนักศึกษา", "รหัส", "student"]);
      var cRank = findCol_(headers, ["ยศ", "คำนำหน้า"]);
      var cFull = findCol_(headers, ["ชื่อ-สกุล", "ชื่อ - สกุล", "ชื่อ-นามสกุล", "ชื่อ นามสกุล"]);
      var cFirst = cFull >= 0 ? -1 : findCol_(headers, ["ชื่อ"]);
      var cLast = cFull >= 0 ? -1 : findCol_(headers, ["นามสกุล"]);
      var cYear = findCol_(headers, ["ชั้นปี", "ปีการศึกษา", "year"]);
      var n = 0;
      for (var i = h + 1; i < src.rows.length; i++) {
        var row = src.rows[i];
        var code = digitsOnly_(cell_(row, cCode));
        if (!isSevenDigitCode_(code)) continue;
        var first = cell_(row, cFirst);
        var last = cell_(row, cLast);
        if (cFull >= 0) {
          var split = splitFullName_(cell_(row, cFull));
          first = split.first;
          last = split.last;
        }
        add(code, cell_(row, cRank), first, last, cell_(row, cYear), "roster:" + src.name);
        n++;
      }
      report.logs.push("อ่านรายชื่อจากทะเบียน '" + src.name + "': " + n + " แถว");
    } catch (e) {
      report.errors.push("ทะเบียน " + id + ": " + e.message);
    }
  });

  return byCode;
}

function importRecipients_(ss, report) {
  var src = collectRecipientSources_(report);
  var t = readTable_(ss, "ServiceRecipients");
  var sheet = t.sheet;
  var headers = t.headers;
  var idx = headerIndexMap_(headers);

  var existing = {};
  t.rows.forEach(function (row, i) {
    var code = digitsOnly_(row[idx["NumberOrOrder"]]);
    if (isSevenDigitCode_(code)) existing[code] = i;
  });

  var existingIds = t.rows.map(function (r) { return r[idx["RecipientID"]]; });
  var nextId = nextRecipientId_(existingIds);

  var updated = 0, added = 0;
  var newRows = [];
  var faceRows = []; // [sheetRowIndex, code]

  Object.keys(src).forEach(function (code) {
    var info = src[code];
    var year = info.year || yearLevelFromCode_(code);

    if (existing[code] !== undefined) {
      var rowNo = existing[code] + 2; // +1 header, +1 index
      var changes = [];
      if (info.first && normText_(cell_(t.rows[existing[code]], idx["FirstName"])) !== info.first) {
        changes.push({ col: idx["FirstName"], value: info.first });
      }
      if (info.last && normText_(cell_(t.rows[existing[code]], idx["LastName"])) !== info.last) {
        changes.push({ col: idx["LastName"], value: info.last });
      }
      if (info.rank && normText_(cell_(t.rows[existing[code]], idx["Title"])) !== info.rank) {
        changes.push({ col: idx["Title"], value: info.rank });
      }
      if (year && idx["Group"] >= 0) {
        var want = groupLabelForYear_(year);
        if (normText_(cell_(t.rows[existing[code]], idx["Group"])) !== want) {
          changes.push({ col: idx["Group"], value: want });
        }
      }
      changes.forEach(function (ch) {
        if (ch.col >= 0) sheet.getRange(rowNo, ch.col + 1).setValue(ch.value);
      });
      if (changes.length) {
        if (idx["UpdatedAt"] >= 0) sheet.getRange(rowNo, idx["UpdatedAt"] + 1).setValue(new Date());
        if (idx["UpdatedBy"] >= 0) sheet.getRange(rowNo, idx["UpdatedBy"] + 1).setValue("import");
        updated++;
      }
    } else {
      var arr = new Array(headers.length).fill("");
      function set(name, v) { if (idx[name] !== undefined && idx[name] >= 0) arr[idx[name]] = v; }
      set("RecipientID", nextId());
      set("NationalID", "");
      set("Title", info.rank || "นพอ.");
      set("FirstName", info.first);
      set("LastName", info.last);
      set("Gender", "");
      set("RecipientType", "นักเรียนพยาบาลทหารอากาศ");
      set("Group", groupLabelForYear_(year));
      set("Level", batchLabelFromCode_(code));
      set("Department", "กองการศึกษา วพอ.");
      set("NumberOrOrder", code);
      set("Status", "Active");
      set("IsDemo", false);
      set("CreatedAt", new Date());
      set("CreatedBy", "import");
      set("UpdatedAt", new Date());
      set("UpdatedBy", "import");
      newRows.push(arr);
      added++;
    }
  });

  if (newRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
  }

  report.recipients = { totalSource: Object.keys(src).length, added: added, updated: updated };
  report.logs.push("ทะเบียน: เพิ่มใหม่ " + added + " / อัปเดต " + updated);
  return report.recipients;
}

// ---------------------------------------------------------------------------
// 2) Visits
// ---------------------------------------------------------------------------

function visitDedupeKey_(code, date, cc) {
  return code + "|" + dateKey_(date) + "|" + normKey_(String(cc || "").substring(0, 60));
}

function parseRowToVisit_(row, headers) {
  var cTime = findCol_(headers, ["ประทับเวลา", "timestamp"]);
  var cCode = findCol_(headers, ["รหัส นพอ", "รหัส"]);
  var cFirst = findCol_(headers, ["ชื่อ"]);
  var cLast = findCol_(headers, ["นามสกุล"]);
  var cYear = findCol_(headers, ["ชั้นปี"]);
  var cDate = findCol_(headers, ["ลงวันที่"]);
  var cMonth = findCol_(headers, ["เดือน"]);
  // ระวัง: "ชั้นปี" มีคำว่า "ปี" อยู่ด้วย จึงต้องหาแบบตรงตัวก่อน
  var cYearTh = findCol_(headers, ["ปี", "year"], true);
  if (cYearTh < 0) {
    for (var hi = 0; hi < headers.length; hi++) {
      var hh = normText_(headers[hi]);
      if (hh.indexOf("ปี") !== -1 && hh.indexOf("ชั้นปี") === -1) { cYearTh = hi; break; }
    }
  }
  var cPlace = findCol_(headers, ["ไปตรวจ", "สถานที่"]);
  var cReason = findCol_(headers, ["เนื่องจาก", "เหตุผล"]);
  var cDept = findCol_(headers, ["แผนก"]);
  var cCC = findCol_(headers, ["อาการสำคัญ", "cc"]);
  var cDx = findCol_(headers, ["การวินิจฉัย", "dx"]);
  var cTx = findCol_(headers, ["การรักษา"]);
  var cMed = findCol_(headers, ["ยา/วัคซีน", "ยา "]);

  var code = digitsOnly_(cell_(row, cCode));
  if (!isSevenDigitCode_(code)) return null;

  var ts = parseDateValue_(cell_(row, cTime));
  if (!ts) {
    var d = parseInt(cell_(row, cDate), 10);
    var m = cell_(row, cMonth);
    var y = toCE_(cell_(row, cYearTh));
    if (d && y) {
      var monthMap = {
        "มกราคม": 0, "กุมภาพันธ์": 1, "มีนาคม": 2, "เมษายน": 3, "พฤษภาคม": 4, "มิถุนายน": 5,
        "กรกฎาคม": 6, "สิงหาคม": 7, "กันยายน": 8, "ตุลาคม": 9, "พฤศจิกายน": 10, "ธันวาคม": 11
      };
      var mi = monthMap[normText_(m)];
      ts = new Date(y, mi === undefined ? 0 : mi, d);
    }
  }
  if (!ts) return null;

  var reason = normText_(cell_(row, cReason));
  var urgency = "Routine";
  if (/ฉุกเฉิน|ER|อุบัติเหตุ/i.test(reason + " " + normText_(cell_(row, cDept)))) urgency = "Urgent";
  if (/ส่งตัว|นอนโรงพยาบาล/i.test(reason)) urgency = "Emergency";

  return {
    code: code,
    timestamp: ts,
    dateKey: dateKey_(ts),
    firstName: normText_(cell_(row, cFirst)).replace(/^นพอ\.?\s*/i, ""),
    lastName: normText_(cell_(row, cLast)),
    year: parseInt(cell_(row, cYear), 10) || yearLevelFromCode_(code),
    place: normText_(cell_(row, cPlace)),
    reason: reason,
    department: normText_(cell_(row, cDept)),
    cc: normText_(cell_(row, cCC)) || "-",
    dx: normText_(cell_(row, cDx)) || "-",
    tx: normText_(cell_(row, cTx)) || "-",
    med: normText_(cell_(row, cMed)) || "-",
    urgency: urgency,
    source: ""
  };
}

function importVisitsFromForms_(ss, report, sourceIds) {
  var recT = readTable_(ss, "ServiceRecipients");
  var recIdx = headerIndexMap_(recT.headers);
  var recByCode = {};
  var codeByRecipientId = {};
  recT.rows.forEach(function (r) {
    var code = digitsOnly_(r[recIdx["NumberOrOrder"]]);
    if (!isSevenDigitCode_(code)) return;
    var rid = normText_(r[recIdx["RecipientID"]]);
    recByCode[code] = {
      recipientId: rid,
      name: normText_(r[recIdx["Title"]]) + normText_(r[recIdx["FirstName"]]) + " " + normText_(r[recIdx["LastName"]]),
      type: r[recIdx["RecipientType"]],
      group: r[recIdx["Group"]],
      dept: r[recIdx["Department"]]
    };
    if (rid) codeByRecipientId[rid] = code;
  });

  var visitT = readTable_(ss, "Visits");
  var vIdx = headerIndexMap_(visitT.headers);
  var existing = {};
  var maxNum = 0;
  var yearTh = String(new Date().getFullYear() + 543).substring(2);
  var idPrefix = "VIS-" + yearTh + "-";
  visitT.rows.forEach(function (r) {
    var rid = normText_(r[vIdx["RecipientID"]]);
    var code = codeByRecipientId[rid] || "";
    var d = parseDateValue_(r[vIdx["VisitDate"]]);
    var cc = normText_(r[vIdx["ChiefComplaint"]]);
    if (code) existing[visitDedupeKey_(code, d, cc)] = true;
    var vid = String(r[vIdx["VisitID"]] || "");
    if (vid.indexOf(idPrefix) === 0) {
      var n = parseInt(vid.substring(idPrefix.length), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  function nextVisitId() { maxNum++; return idPrefix + ("00000" + maxNum).slice(-5); }

  // อ่านตารางลูกครั้งเดียว (เดิมอ่านซ้ำทุกแถวทำให้ช้ามาก)
  var aT = readTable_(ss, "Assessments");
  var aIdx = headerIndexMap_(aT.headers);
  var tT = readTable_(ss, "Treatments");
  var tIdx = headerIndexMap_(tT.headers);
  var assessSeq = maxSeqFromRows_(aT.rows);
  var treatSeq = maxSeqFromRows_(tT.rows);

  var newVisits = [];
  var newAssess = [];
  var newTreat = [];
  var skipped = 0, dup = 0;
  var vaccFromVisits = [];
  var ids = (sourceIds && sourceIds.length) ? sourceIds : (IMPORT_CFG.FORM_SOURCE_IDS || []);

  ids.forEach(function (id) {
    try {
      var src = readSourceFile_(id);
      var headers = src.rows[0] || [];
      var addedHere = 0;
      for (var i = 1; i < src.rows.length; i++) {
        var v = parseRowToVisit_(src.rows[i], headers);
        if (!v) { skipped++; continue; }
        var key = visitDedupeKey_(v.code, v.timestamp, v.cc);
        if (existing[key]) { dup++; continue; }
        existing[key] = true;

        var rec = recByCode[v.code] || {
          recipientId: "",
          name: (v.firstName + " " + v.lastName).trim(),
          type: "นักเรียนพยาบาลทหารอากาศ",
          group: groupLabelForYear_(v.year),
          dept: "กองการศึกษา วพอ."
        };
        var vid = nextVisitId();

        var arr = new Array(visitT.headers.length).fill("");
        var setV = function (name, val) { if (vIdx[name] !== undefined && vIdx[name] >= 0) arr[vIdx[name]] = val; };
        setV("VisitID", vid);
        setV("VisitDate", v.timestamp);
        setV("TimeIn", Utilities.formatDate(v.timestamp, "Asia/Bangkok", "HH:mm"));
        setV("TimeOut", "");
        setV("RecipientID", rec.recipientId);
        setV("RecipientName", rec.name);
        setV("RecipientType", rec.type);
        setV("Group", groupLabelForYear_(v.year));
        setV("Department", rec.dept);
        setV("AccompaniedBy", "");
        setV("IncidentLocation", v.place);
        setV("IncidentActivity", "");
        setV("IncidentType", v.reason);
        setV("ChiefComplaint", v.cc);
        setV("IncidentDetails", "นำเข้าจากแบบฟอร์ม: " + src.name);
        setV("UrgencyLevel", v.urgency);
        setV("InitialAssessment", v.dx);
        setV("Outcome", v.tx);
        setV("ContactNotified", false);
        setV("ReferralCreated", false);
        setV("FollowUpScheduled", false);
        setV("VisitStatus", "Closed");
        setV("IsDemo", false);
        setV("RecordedBy", "import");
        setV("RecordedAt", new Date());
        newVisits.push(arr);

        if (v.dx && v.dx !== "-") {
          var aArr = new Array(aT.headers.length).fill("");
          var setA = function (n, val) { if (aIdx[n] >= 0) aArr[aIdx[n]] = val; };
          setA("AssessmentID", "ASM-2569-" + ("00000" + (++assessSeq)).slice(-5));
          setA("VisitID", vid);
          setA("RecipientID", rec.recipientId);
          setA("RecordedAt", v.timestamp);
          setA("AssessmentDetails", v.dx);
          setA("Diagnosis", v.dx);
          setA("IsDemo", false);
          newAssess.push(aArr);
        }

        if (v.tx && v.tx !== "-") {
          var tArr = new Array(tT.headers.length).fill("");
          var setT = function (n, val) { if (tIdx[n] >= 0) tArr[tIdx[n]] = val; };
          setT("TreatmentID", "TRT-2569-" + ("00000" + (++treatSeq)).slice(-5));
          setT("VisitID", vid);
          setT("RecipientID", rec.recipientId);
          setT("RecordedAt", v.timestamp);
          setT("TreatmentDetails", v.tx);
          setT("Note", v.med && v.med !== "-" ? "ยา/วัคซีน: " + v.med : "");
          setT("IsDemo", false);
          newTreat.push(tArr);
        }

        if (/วัคซีน|vaccine|flu|influenza/i.test(v.reason + " " + v.cc + " " + v.med)) {
          vaccFromVisits.push({
            code: v.code, name: rec.name, vaccine: v.cc || v.reason,
            date: v.timestamp, site: "", lot: "", by: "", note: v.med
          });
        }
        addedHere++;
      }
      report.logs.push("อ่าน Visits จาก '" + src.name + "': เพิ่ม " + addedHere + " แถว");
    } catch (e) {
      report.errors.push("Visits " + id + ": " + e.message);
    }
  });

  if (newVisits.length) appendRowsChunked_(visitT.sheet, newVisits);
  if (newAssess.length) appendRowsChunked_(aT.sheet, newAssess);
  if (newTreat.length) appendRowsChunked_(tT.sheet, newTreat);

  report.visits = { added: newVisits.length, duplicates: dup, skipped: skipped };
  report.logs.push("Visits: เพิ่ม " + newVisits.length + " / ซ้ำ " + dup + " / ข้าม " + skipped);
  return { stats: report.visits, vaccinations: vaccFromVisits };
}

/** หาลำดับสูงสุดจากคอลัมน์ ID ของตาราง */
function maxSeqFromRows_(rows) {
  var max = 0;
  rows.forEach(function (r) {
    var s = String(r[0] || "");
    var m = s.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

function appendRowsChunked_(sheet, rows) {
  if (!rows.length) return;
  var CHUNK = 500;
  var width = Math.max(sheet.getLastColumn(), rows[0].length);
  for (var i = 0; i < rows.length; i += CHUNK) {
    var part = rows.slice(i, i + CHUNK);
    if (part[0].length < width) {
      part = part.map(function (r) { var c = r.slice(); while (c.length < width) c.push(""); return c; });
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, part.length, width).setValues(part);
  }
}

// ---------------------------------------------------------------------------
// 3) Vaccinations
// ---------------------------------------------------------------------------

function importVaccinations_(ss, report, fromVisits) {
  var t = readTable_(ss, "Vaccinations");
  var idx = headerIndexMap_(t.headers);
  var existing = {};
  t.rows.forEach(function (r) {
    var code = digitsOnly_(r[idx["StudentCode"]]);
    var d = parseDateValue_(r[idx["VaccinationDate"]]);
    var v = normKey_(r[idx["VaccineName"]]);
    existing[normKey_(code + "|" + dateKey_(d) + "|" + v)] = true;
  });

  var recT = readTable_(ss, "ServiceRecipients");
  var recIdx = headerIndexMap_(recT.headers);
  var recByCode = {};
  recT.rows.forEach(function (r) {
    var code = digitsOnly_(r[recIdx["NumberOrOrder"]]);
    if (isSevenDigitCode_(code)) {
      recByCode[code] = {
        id: r[recIdx["RecipientID"]],
        name: normText_(r[recIdx["Title"]]) + normText_(r[recIdx["FirstName"]]) + " " + normText_(r[recIdx["LastName"]])
      };
    }
  });

  var candidates = [];
  var diag = { totalRows: 0, noCode: 0, outsideCohort: 0, noDate: 0, prefixes: {} };
  (IMPORT_CFG.VACCINE_SOURCE_IDS || []).forEach(function (id) {
    try {
      var src = readSourceFile_(id);
      var headers = src.rows[0] || [];
      var cTime = findCol_(headers, ["ประทับเวลา", "timestamp"]);
      var cCode = findCol_(headers, ["รหัส นพอ", "รหัส"]);
      var cFirst = findCol_(headers, ["ชื่อ"]);
      var cLast = findCol_(headers, ["นามสกุล"]);
      var cVacc = findCol_(headers, ["วัคซีน", "vaccine"]);
      var cDose = findCol_(headers, ["ขนาด", "เข็ม", "dose"]);
      var cDate = findCol_(headers, ["วันที่ฉีด", "วันที่", "date"]);
      var cMonth = findCol_(headers, ["เดือน"]);
      var cYear = findCol_(headers, ["พ.ศ", "ปี"], true);
      var cSite = findCol_(headers, ["ช่องทาง", "route", "ตำแหน่ง", "site", "บริเวณ"]);
      var cLot = findCol_(headers, ["lot", "ล็อต"]);
      var cBy = findCol_(headers, ["ผู้สั่งยา", "ผู้ควบคุมการฉีด", "ผู้ฉีด", "โดย"]);
      for (var i = 1; i < src.rows.length; i++) {
        var row = src.rows[i];
        diag.totalRows++;
        var code = digitsOnly_(cell_(row, cCode));
        if (!isSevenDigitCode_(code)) { diag.noCode++; continue; }
        // รับเฉพาะรหัสที่มีทะเบียนบุคคลรองรับ (หรือรุ่น 66-69) — ตัดแถวทดสอบ เช่น 6299999
        if (!yearLevelFromCode_(code) && !recByCode[code]) {
          diag.outsideCohort++;
          diag.prefixes[code.substring(0, 2)] = (diag.prefixes[code.substring(0, 2)] || 0) + 1;
          continue;
        }
        var d = parseDateValue_(cell_(row, cDate)) ||
          composeDateFromParts_(cell_(row, cDate), cell_(row, cMonth), cell_(row, cYear)) ||
          parseDateValue_(cell_(row, cTime));
        candidates.push({
          code: code,
          name: (normText_(cell_(row, cFirst)) + " " + normText_(cell_(row, cLast))).trim(),
          vaccine: normText_(cell_(row, cVacc)) || "ไม่ระบุวัคซีน",
          dose: normText_(cell_(row, cDose)),
          date: d,
          site: normText_(cell_(row, cSite)),
          lot: normText_(cell_(row, cLot)),
          by: normText_(cell_(row, cBy)),
          note: ""
        });
      }
      report.logs.push("อ่านวัคซีนจาก '" + src.name + "': " + (src.rows.length - 1) + " แถว");
    } catch (e) {
      report.errors.push("วัคซีน " + id + ": " + e.message);
    }
  });

  (fromVisits || []).forEach(function (v) { candidates.push(v); });

  var rows = [];
  var dup = 0;
  candidates.forEach(function (c) {
    if (!c.date) { dup++; return; }
    var key = c.code + "|" + dateKey_(c.date) + "|" + normKey_(c.vaccine);
    var lookup = normKey_(key);
    if (existing[lookup]) { dup++; return; }
    existing[lookup] = true;
    var rec = recByCode[c.code] || { id: "", name: c.name };
    var arr = new Array(t.headers.length).fill("");
    function set(n, val) { if (idx[n] >= 0) arr[idx[n]] = val; }
    set("VaccinationID", "VAC-" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMddHHmmss") + "-" + rows.length);
    set("RecipientID", rec.id);
    set("StudentCode", c.code);
    set("RecipientName", rec.name || c.name);
    set("VaccineName", c.vaccine);
    set("DoseNumber", c.dose);
    set("VaccinationDate", c.date);
    set("Site", c.site);
    set("LotNumber", c.lot);
    set("AdministeredBy", c.by);
    set("Note", c.note);
    set("SourceKey", c.code + "|" + dateKey_(c.date) + "|" + normKey_(c.vaccine));
    set("RecordedAt", new Date());
    rows.push(arr);
  });

  if (rows.length) appendRowsChunked_(t.sheet, rows);
  report.vaccinations = { added: rows.length, duplicates: dup, diagnostics: diag };
  report.logs.push("วัคซีน: เพิ่ม " + rows.length + " / ซ้ำ " + dup +
    " (แถวทั้งหมด " + diag.totalRows + ", ไม่มีรหัส " + diag.noCode +
    ", นอกรุ่น 66-69 " + diag.outsideCohort + ")");
  return report.vaccinations;
}

// ---------------------------------------------------------------------------
// 7) Cleanup — ลบแถวซ้ำที่เกิดจากบั๊กการเทียบ SourceKey (เก็บแถวแรกไว้)
// ---------------------------------------------------------------------------

function dedupeImportTable_(ss, name) {
  var t = readTable_(ss, name);
  var idx = headerIndexMap_(t.headers);
  var keyCol = idx["SourceKey"];
  if (keyCol === undefined || keyCol < 0) return { table: name, removed: 0, kept: t.rows.length };

  var seen = {};
  var kept = [];
  var removed = 0;
  t.rows.forEach(function (r) {
    var k = normKey_(r[keyCol]);
    if (!k) { kept.push(r); return; }
    if (seen[k]) { removed++; return; }
    seen[k] = true;
    kept.push(r);
  });

  if (removed > 0) {
    var width = t.headers.length;
    t.sheet.getRange(2, 1, Math.max(t.rows.length, 1), width).clearContent();
    if (kept.length) t.sheet.getRange(2, 1, kept.length, width).setValues(kept);
  }
  return { table: name, removed: removed, kept: kept.length, totalBefore: t.rows.length };
}

function cleanupDuplicates_(ss) {
  var out = {};
  ["Certificates", "Vaccinations"].forEach(function (name) {
    if (ss.getSheetByName(name)) out[name] = dedupeImportTable_(ss, name);
  });
  return out;
}

// ---------------------------------------------------------------------------
// 4) Certificates
// ---------------------------------------------------------------------------

function importCertificates_(ss, report) {
  var t = readTable_(ss, "Certificates");
  var idx = headerIndexMap_(t.headers);
  var existing = {};
  t.rows.forEach(function (r) {
    var k = normKey_(r[idx["SourceKey"]]);
    if (k) existing[k] = true;
  });

  var recT = readTable_(ss, "ServiceRecipients");
  var recIdx = headerIndexMap_(recT.headers);
  var recByCode = {};
  recT.rows.forEach(function (r) {
    var code = digitsOnly_(r[recIdx["NumberOrOrder"]]);
    if (isSevenDigitCode_(code)) {
      recByCode[code] = {
        id: r[recIdx["RecipientID"]],
        name: normText_(r[recIdx["Title"]]) + normText_(r[recIdx["FirstName"]]) + " " + normText_(r[recIdx["LastName"]])
      };
    }
  });

  var rows = [], dup = 0;
  var outsideRoster = 0;

  (IMPORT_CFG.CERT_SOURCE_IDS || []).forEach(function (id) {
    try {
      var src = readSourceFile_(id);
      var headers = src.rows[0] || [];
      var cTime = findCol_(headers, ["ประทับเวลา", "timestamp"]);
      var cCode = findCol_(headers, ["รหัส นพอ", "รหัส"]);
      var cFirst = findCol_(headers, ["ชื่อ"]);
      var cLast = findCol_(headers, ["นามสกุล"]);
      var cDay = findCol_(headers, ["ลงวันที่", "วันที่", "date"]);
      var cMonth = findCol_(headers, ["เดือน"]);
      var cYear = findCol_(headers, ["ปี"], true);
      var cHosp = findCol_(headers, ["โรงพยาบาล", "สถานพยาบาล", "hospital"]);
      var cDx = findCol_(headers, ["วินิจฉัย", "dx", "โรค"]);
      var cDocPrefix = findCol_(headers, ["คำนำหน้า"]);
      var cDocFirst = findCol_(headers, ["ชื่อแพทย์"]);
      var cDocLast = findCol_(headers, ["นามสกุลแพทย์"]);
      var cDoc = findCol_(headers, ["แพทย์", "doctor"]);
      var cNote = findCol_(headers, ["หมายเหตุ", "note"]);
      var cFile = findCol_(headers, ["รูป", "ไฟล์", "แนบ", "url", "link"]);
      for (var i = 1; i < src.rows.length; i++) {
        var row = src.rows[i];
        var code = digitsOnly_(cell_(row, cCode));
        if (!isSevenDigitCode_(code)) continue;
        if (!yearLevelFromCode_(code) && !recByCode[code]) { outsideRoster++; continue; }
        var d = parseDateValue_(cell_(row, cTime)) ||
          composeDateFromParts_(cell_(row, cDay), cell_(row, cMonth), cell_(row, cYear)) ||
          parseDateValue_(cell_(row, cDay));
        if (!d) { dup++; continue; }
        var doctor = cDocFirst >= 0 || cDocLast >= 0
          ? (normText_(cell_(row, cDocPrefix)) + normText_(cell_(row, cDocFirst)) + " " + normText_(cell_(row, cDocLast))).trim()
          : normText_(cell_(row, cDoc));
        var key = code + "|" + dateKey_(d) + "|" + normKey_(cell_(row, cHosp));
        var lookup = normKey_(key);
        if (existing[lookup]) { dup++; continue; }
        existing[lookup] = true;
        var rec = recByCode[code] || { id: "", name: "" };
        var arr = new Array(t.headers.length).fill("");
        function set(n, val) { if (idx[n] >= 0) arr[idx[n]] = val; }
        set("CertificateID", "CRT-" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMddHHmmss") + "-" + rows.length);
        set("RecipientID", rec.id);
        set("StudentCode", code);
        set("RecipientName", rec.name);
        set("IssueDate", d);
        set("Hospital", normText_(cell_(row, cHosp)));
        set("Diagnosis", normText_(cell_(row, cDx)));
        set("Doctor", doctor);
        set("Note", normText_(cell_(row, cNote)));
        set("FileUrl", normText_(cell_(row, cFile)));
        set("SourceKey", key);
        set("RecordedAt", new Date());
        rows.push(arr);
      }
      report.logs.push("อ่านใบรับรองแพทย์จาก '" + src.name + "': " + (src.rows.length - 1) + " แถว");
    } catch (e) {
      report.errors.push("ใบรับรองแพทย์ " + id + ": " + e.message);
    }
  });

  if (rows.length) appendRowsChunked_(t.sheet, rows);
  report.certificates = { added: rows.length, duplicates: dup, outsideRoster: outsideRoster };
  report.logs.push("ใบรับรองแพทย์: เพิ่ม " + rows.length + " / ซ้ำ " + dup + " / นอกรายชื่อ " + outsideRoster);
  return report.certificates;
}

// ---------------------------------------------------------------------------
// 4.1) เอกสารประวัติส่วนตัวรายคน (Smart database 2567/2568)
// ---------------------------------------------------------------------------

/** เก็บไฟล์ทั้งหมดใต้โฟลเดอร์ (รวมโฟลเดอร์ย่อย) */
function collectDriveFiles_(folderId, out, depth) {
  depth = depth || 0;
  if (depth > 4) return out;
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  while (files.hasNext()) {
    out.push({ file: files.next(), folderName: folder.getName() });
  }
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    collectDriveFiles_(subs.next().getId(), out, depth + 1);
  }
  return out;
}

/**
 * เขียนรายการเอกสารรายคนลงตาราง StudentDocuments (idempotent)
 * items: [{ code, name, fileId, sourceFolder }]
 */
function applyStudentDocuments_(ss, report, items) {
  var t = readTable_(ss, "StudentDocuments");
  var idx = headerIndexMap_(t.headers);
  var existing = {};
  t.rows.forEach(function (r) {
    var k = normKey_(r[idx["SourceKey"]]);
    if (k) existing[k] = true;
  });

  var recT = readTable_(ss, "ServiceRecipients");
  var recIdx = headerIndexMap_(recT.headers);
  var recByCode = {};
  recT.rows.forEach(function (r) {
    var code = digitsOnly_(r[recIdx["NumberOrOrder"]]);
    if (isSevenDigitCode_(code)) {
      recByCode[code] = {
        id: r[recIdx["RecipientID"]],
        name: (normText_(r[recIdx["Title"]]) + normText_(r[recIdx["FirstName"]]) + " " + normText_(r[recIdx["LastName"]])).trim()
      };
    }
  });

  var diag = { files: 0, noCode: 0, outsideRoster: 0, duplicates: 0 };
  var rows = [];

  (items || []).forEach(function (item) {
    diag.files++;
    var code = digitsOnly_(item.code);
    var name = String(item.name || "");
    if (!isSevenDigitCode_(code)) {
      var m = name.match(/(?:^|\D)(\d{7})(?:\D|$)/);
      code = m ? m[1] : "";
    }
    if (!isSevenDigitCode_(code)) { diag.noCode++; return; }
    if (!recByCode[code]) { diag.outsideRoster++; return; }

    // ตัด (1),(2)... ออกจากชื่อไฟล์ เพื่อกันไฟล์ซ้ำของคนเดียวกัน
    var base = name.replace(/\s*\(\d+\)(?=\.[^.]+$)/, "").replace(/\.[^.]+$/, "");
    var key = code + "|" + base;
    var lookup = normKey_(key);
    if (existing[lookup]) { diag.duplicates++; return; }
    existing[lookup] = true;

    var rec = recByCode[code];
    var arr = new Array(t.headers.length).fill("");
    function set(n, val) { if (idx[n] >= 0) arr[idx[n]] = val; }
    set("DocumentID", "DOC-" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMddHHmmss") + "-" + rows.length);
    set("StudentCode", code);
    set("RecipientID", rec.id);
    set("RecipientName", rec.name);
    set("DocType", item.docType || "ประวัติส่วนตัว");
    set("FileName", name);
    set("FileUrl", item.fileId ? ("https://drive.google.com/file/d/" + item.fileId + "/view") : String(item.fileUrl || ""));
    set("SourceFolder", item.sourceFolder || "");
    set("SourceKey", key);
    set("RecordedAt", new Date());
    rows.push(arr);
  });

  if (rows.length) appendRowsChunked_(t.sheet, rows);
  report.studentDocuments = { added: rows.length, diagnostics: diag };
  report.logs.push("เอกสารประวัติส่วนตัว: เพิ่ม " + rows.length + " / ซ้ำ " + diag.duplicates +
    " / ไม่มีรหัส " + diag.noCode + " / นอกรายชื่อ " + diag.outsideRoster);
  return report.studentDocuments;
}

/**
 * จัดทำดัชนีเอกสารรายคนจากโฟลเดอร์ "ประวัติส่วนตัว" ของ Smart database 2567/2568
 * จับคู่ด้วยรหัส นพอ. 7 หลักในชื่อไฟล์เท่านั้น และตัดไฟล์ซ้ำของคนเดียวกัน
 */
function importStudentDocuments_(ss, report) {
  var items = [];
  var diagFolders = [];

  (IMPORT_CFG.SMART_DOC_FOLDERS || []).forEach(function (cfg) {
    var collected = [];
    try {
      collectDriveFiles_(cfg.id, collected, 0);
    } catch (e) {
      report.errors.push("เอกสาร " + cfg.label + ": " + e.message);
      return;
    }
    diagFolders.push({ label: cfg.label, id: cfg.id, files: collected.length });
    collected.forEach(function (entry) {
      items.push({
        name: entry.file.getName(),
        fileId: entry.file.getId(),
        sourceFolder: cfg.label
      });
    });
  });

  var res = applyStudentDocuments_(ss, report, items);
  res.diagnostics.folders = diagFolders;
  return res;
}

/**
 * นำเข้ารายการเอกสารที่ตรวจสอบจากภายนอก (เช่น Drive API) โดยไม่ต้องใช้ DriveApp
 * payload: JSON string ของ [{code,name,fileId,sourceFolder}]
 */
function importStudentDocumentsBatch(payload, key) {
  assertImportKey_(key);
  var items = typeof payload === "string" ? JSON.parse(payload) : (payload || []);
  var ss = getSpreadsheet();
  ensureImportTables_(ss);
  var report = { logs: [], errors: [], startedAt: nowStamp_() };
  var res = applyStudentDocuments_(ss, report, items);
  report.success = report.errors.length === 0;
  report.finishedAt = nowStamp_();
  return report;
}

// ---------------------------------------------------------------------------
// 5) Monthly reports folder (xlsx ซ้ำกับฟอร์ม — ใช้เติมข้อมูลที่ขาด)
// ---------------------------------------------------------------------------

function importMonthlyFolder_(ss, report) {
  var ids = (IMPORT_CFG.MONTHLY_EXTRA_FILE_IDS || []).slice();
  try {
    var folder = DriveApp.getFolderById(IMPORT_CFG.MONTHLY_FOLDER_ID);
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (/\.xlsx$/i.test(f.getName())) ids.push(f.getId());
    }
  } catch (e) {
    report.errors.push("โฟลเดอร์รายเดือน: " + e.message);
  }
  if (!ids.length) return { added: 0, duplicates: 0, skipped: 0 };

  // ใช้ตัวนำเข้าเดียวกับฟอร์ม โดยสมมติว่ามีหัวคอลัมน์เดียวกัน
  var cfgBackup = IMPORT_CFG.FORM_SOURCE_IDS;
  try {
    IMPORT_CFG.FORM_SOURCE_IDS = ids;
    var res = importVisitsFromForms_(ss, report);
    return res.stats;
  } finally {
    IMPORT_CFG.FORM_SOURCE_IDS = cfgBackup;
  }
}

// ---------------------------------------------------------------------------
// 6) Photo index
// ---------------------------------------------------------------------------

function scanPhotoFolders_(arg1, arg2) {
  var ss, report;
  if (arg2) {
    ss = arg1;
    report = arg2;
  } else {
    report = arg1 || { errors: [], logs: [] };
    ss = getSpreadsheet();
  }
  if (!report.errors) report.errors = [];
  if (!report.logs) report.logs = [];
  var map = {};       // code -> array of {fileId, name, mime, folderId, year}
  var unmatched = [];

  function scan(folders, priority) {
    folders.forEach(function (f) {
      try {
        var folder = DriveApp.getFolderById(f.id);
        var it = folder.getFiles();
        while (it.hasNext()) {
          var file = it.next();
          var mime = file.getMimeType();
          if (!/^image\//.test(mime)) continue;
          var name = file.getName();
          var m = name.match(/(?:^|\D)(\d{7})(?:\D|$)/);
          var code = m ? m[1] : "";
          if (!isSevenDigitCode_(code)) {
            unmatched.push({ folder: folder.getName(), file: name, reason: "ไม่มีรหัส 7 หลัก" });
            continue;
          }
          if (!map[code]) map[code] = [];
          map[code].push({
            fileId: file.getId(), name: name, mime: mime,
            folderId: f.id, year: f.year, priority: priority
          });
        }
      } catch (e) {
        report.errors.push("สแกนรูป " + f.id + ": " + e.message);
      }
    });
  }

  scan(IMPORT_CFG.PHOTO_FOLDERS, 1);
  scan(IMPORT_CFG.PHOTO_FALLBACK_FOLDERS, 2);

  var indexRows = [];
  var ok = 0, review = 0, missing = 0;
  var recT = readTable_(ss, "ServiceRecipients");
  var recIdx = headerIndexMap_(recT.headers);
  var recByCode = {};
  recT.rows.forEach(function (r) {
    var code = digitsOnly_(r[recIdx["NumberOrOrder"]]);
    if (isSevenDigitCode_(code)) recByCode[code] = { row: r, idx: recIdx };
  });

  Object.keys(map).forEach(function (code) {
    var list = map[code].sort(function (a, b) { return a.priority - b.priority; });
    var best = list[0];
    var status = list.length > 1 ? "PHOTO_REVIEW_REQUIRED" : "OK";
    if (status === "OK") ok++; else review++;
    var rec = recByCode[code];
    indexRows.push([
      code,
      rec ? (normText_(rec.row[recIdx["Title"]]) + normText_(rec.row[recIdx["FirstName"]]) + " " + normText_(rec.row[recIdx["LastName"]])) : "",
      rec ? rec.row[recIdx["Group"]] : "",
      best.folderId,
      best.fileId,
      best.name,
      best.mime,
      status,
      new Date()
    ]);
  });

  // นักเรียนที่ยังไม่มีรูป
  Object.keys(recByCode).forEach(function (code) {
    if (map[code]) return;
    var year = yearLevelFromCode_(code);
    if (!year) return; // เฉพาะปี 1-4 ของปีการศึกษา 2569
    missing++;
  });

  var sheet = ss.getSheetByName("PhotoIndex");
  if (indexRows.length) {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, sheet.getLastColumn() || 9).setValues([[
      "StudentCode", "FullName", "YearLevel", "FolderID", "FileID", "FileName",
      "MimeType", "Status", "UpdatedAt"
    ]]);
    appendRowsChunked_(sheet, indexRows);
  }

  report.photos = { indexed: indexRows.length, ok: ok, review: review, missingActiveStudents: missing, unmatchedFiles: unmatched.slice(0, 50), unmatchedCount: unmatched.length };
  report.logs.push("รูป: แมปสำเร็จ " + indexRows.length + " (ต้องตรวจ " + review + ") / นักเรียนปี 1-4 ไม่มีรูป " + missing);
  return report.photos;
}

/** เขียน PhotoFileId กลับไปที่ ServiceRecipients */
function applyPhotosToRecipients_(ss, report) {
  var photoT = readTable_(ss, "PhotoIndex");
  var pIdx = headerIndexMap_(photoT.headers);
  var byCode = {};
  photoT.rows.forEach(function (r) {
    var code = digitsOnly_(r[pIdx["StudentCode"]]);
    if (isSevenDigitCode_(code) && String(r[pIdx["Status"]]) === "OK") {
      byCode[code] = r[pIdx["FileID"]];
    }
  });

  var recT = readTable_(ss, "ServiceRecipients");
  var idx = headerIndexMap_(recT.headers);
  if (idx["PhotoFileId"] === undefined) return { applied: 0 };
  var applied = 0;
  for (var i = 0; i < recT.rows.length; i++) {
    var code = digitsOnly_(recT.rows[i][idx["NumberOrOrder"]]);
    if (!byCode[code]) continue;
    var current = recT.rows[i][idx["PhotoFileId"]];
    if (current === byCode[code]) continue;
    recT.sheet.getRange(i + 2, idx["PhotoFileId"] + 1).setValue(byCode[code]);
    if (idx["PhotoUpdatedAt"] !== undefined) {
      recT.sheet.getRange(i + 2, idx["PhotoUpdatedAt"] + 1).setValue(new Date());
    }
    applied++;
  }
  report.photosApplied = applied;
  report.logs.push("ผูก PhotoFileId ให้ทะเบียน: " + applied + " คน");
  return applied;
}

// ---------------------------------------------------------------------------
// 7) จัดระเบียบ Drive
// ---------------------------------------------------------------------------

function reorganizeDrive_(apply) {
  var result = { applied: !!apply, created: null, moved: [], skipped: [], errors: [] };
  var root;
  try {
    root = DriveApp.getFolderById(IMPORT_CFG.MEDICAL_ROOT_FOLDER_ID);
  } catch (e) {
    result.errors.push("เปิดโฟลเดอร์ต้นทางไม่ได้: " + e.message);
    return result;
  }

  var archive = null;
  var it = DriveApp.getFoldersByName(IMPORT_CFG.ARCHIVE_FOLDER_NAME);
  if (it.hasNext()) archive = it.next();

  if (apply && !archive) {
    archive = DriveApp.createFolder(IMPORT_CFG.ARCHIVE_FOLDER_NAME);
    result.created = archive.getId();
  }

  var subs = root.getFolders();
  while (subs.hasNext()) {
    var f = subs.next();
    if (IMPORT_CFG.NON_MEDICAL_NAMES.indexOf(f.getName()) === -1) continue;
    if (apply && archive) {
      try { f.moveTo(archive); result.moved.push({ type: "folder", name: f.getName(), id: f.getId() }); }
      catch (e) { result.errors.push("ย้ายโฟลเดอร์ " + f.getName() + ": " + e.message); }
    } else {
      result.skipped.push({ type: "folder", name: f.getName(), id: f.getId() });
    }
  }

  var files = root.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (IMPORT_CFG.NON_MEDICAL_NAMES.indexOf(file.getName()) === -1) continue;
    if (apply && archive) {
      try { file.moveTo(archive); result.moved.push({ type: "file", name: file.getName(), id: file.getId() }); }
      catch (e) { result.errors.push("ย้ายไฟล์ " + file.getName() + ": " + e.message); }
    } else {
      result.skipped.push({ type: "file", name: file.getName(), id: file.getId() });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * นำเข้าทั้งหมด (เรียกจาก doGet?api=importAll&key=...)
 * opts: { skipPhotos, skipCertificates, skipVaccines, skipMonthly }
 */
function importAllFromDrive(opts) {
  opts = opts || {};
  var started = new Date();
  var ss = getSpreadsheet();
  var report = {
    startedAt: nowStamp_(),
    spreadsheet: ss.getName(),
    spreadsheetId: ss.getId(),
    createdTables: [],
    logs: [],
    errors: [],
    recipients: null,
    visits: null,
    vaccinations: null,
    certificates: null,
    photos: null,
    monthly: null
  };

  try {
    report.createdTables = ensureImportTables_(ss);
    if (report.createdTables.length) report.logs.push("สร้างตารางใหม่: " + report.createdTables.join(", "));

    importRecipients_(ss, report);
    var visitRes = importVisitsFromForms_(ss, report);

    if (!opts.skipMonthly) {
      try { report.monthly = importMonthlyFolder_(ss, report); }
      catch (e) { report.errors.push("รายเดือน: " + e.message); }
    }

    if (!opts.skipVaccines) {
      importVaccinations_(ss, report, visitRes.vaccinations || []);
    }

    if (!opts.skipCertificates) {
      importCertificates_(ss, report);
    }

    if (!opts.skipDocuments) {
      try { importStudentDocuments_(ss, report); }
      catch (e) { report.errors.push("เอกสารประวัติส่วนตัว: " + e.message); }
    }

    if (!opts.skipPhotos) {
      scanPhotoFolders_(report);
      applyPhotosToRecipients_(ss, report);
    }

    writeAuditLog(ss, "import", "SYSTEM", "DATA_IMPORT", "นำเข้าข้อมูลจาก Drive", "");
    report.success = true;
  } catch (e) {
    report.success = false;
    report.fatal = e.message;
    report.stack = e.stack;
  }

  report.finishedAt = nowStamp_();
  report.durationSeconds = Math.round((new Date() - started) / 1000);
  return report;
}

/** สรุปสถานะฐานข้อมูล (อ่านอย่างเดียว) */
function importStatus() {
  var ss = getSpreadsheet();
  var out = { spreadsheet: ss.getName(), spreadsheetId: ss.getId(), tables: {}, generatedAt: nowStamp_() };
  ["ServiceRecipients", "Visits", "Assessments", "Treatments", "Vaccinations", "Certificates", "PhotoIndex", "Attachments", "StudentDocuments"].forEach(function (n) {
    var s = ss.getSheetByName(n);
    out.tables[n] = s ? Math.max(0, s.getLastRow() - 1) : null;
  });
  var rec = readTable_(ss, "ServiceRecipients");
  var idx = headerIndexMap_(rec.headers);
  var recByCode = {};
  rec.rows.forEach(function (r) {
    var code = digitsOnly_(r[idx["NumberOrOrder"]]);
    if (isSevenDigitCode_(code)) recByCode[code] = true;
  });
  var byYear = { "1": 0, "2": 0, "3": 0, "4": 0, "other": 0 };
  var byCohort = {};
  rec.rows.forEach(function (r) {
    var code = digitsOnly_(r[idx["NumberOrOrder"]]);
    var y = yearLevelFromCode_(code);
    byYear[y ? String(y) : "other"]++;
    if (isSevenDigitCode_(code)) {
      var p = code.substring(0, 2);
      byCohort[p] = (byCohort[p] || 0) + 1;
    }
  });
  out.studentsByYear = byYear;
  out.recipientsByCohort = byCohort;
  out.byCohort = {};
  ["Vaccinations", "Certificates", "Visits"].forEach(function (name) {
    var t = readTable_(ss, name);
    if (!t || !t.rows.length) { out.byCohort[name] = {}; return; }
    var ix = headerIndexMap_(t.headers);
    var codeCol = ix["StudentCode"] !== undefined && ix["StudentCode"] >= 0 ? ix["StudentCode"] : -1;
    var hist = {};
    t.rows.forEach(function (r) {
      var code = codeCol >= 0 ? digitsOnly_(r[codeCol]) : "";
      if (!code) {
        var rid = normText_(r[ix["RecipientID"]]);
        if (!rid) { hist["(no-code)"] = (hist["(no-code)"] || 0) + 1; return; }
        hist["(by-recipient)"] = (hist["(by-recipient)"] || 0) + 1;
        return;
      }
      var p = code.substring(0, 2);
      hist[p] = (hist[p] || 0) + 1;
    });
    out.byCohort[name] = hist;
    var unmatched = [];
    if (codeCol >= 0) {
      t.rows.forEach(function (r) {
        var code = digitsOnly_(r[codeCol]);
        if (isSevenDigitCode_(code) && !recByCode[code]) unmatched.push(code);
      });
    }
    out.unmatchedCodes = out.unmatchedCodes || {};
    if (unmatched.length) out.unmatchedCodes[name] = { count: unmatched.length, sample: unmatched.slice(0, 10) };
    if (ix["SourceKey"] !== undefined && ix["SourceKey"] >= 0) {
      var seen = {}, uniq = 0, blanks = 0;
      var dupSamples = [];
      t.rows.forEach(function (r, ri) {
        var k = normKey_(r[ix["SourceKey"]]);
        if (!k) { blanks++; return; }
        if (!seen[k]) { seen[k] = { n: 1, row: ri + 2 }; uniq++; }
        else {
          seen[k].n++;
          if (dupSamples.length < 5) dupSamples.push({ key: String(r[ix["SourceKey"]]), firstRow: seen[k].row, dupRow: ri + 2 });
        }
      });
      out.uniqueSourceKeys = out.uniqueSourceKeys || {};
      out.uniqueSourceKeys[name] = { rows: t.rows.length, unique: uniq, blanks: blanks, dupSamples: dupSamples };
    }
  });
  var photo = readTable_(ss, "PhotoIndex");
  out.photoIndexRows = photo.rows.length;
  return out;
}

/** เรียกจัดระเบียบ Drive แบบ dry-run หรือ apply */
function reorganizeDriveForImport(apply) {
  return reorganizeDrive_(apply === true || apply === "true");
}

// ---------------------------------------------------------------------------
// 8) Config / Inspect / Step runner (ใช้กับ doGet?api=...)
// ---------------------------------------------------------------------------

/** ตั้งค่าโฟลเดอร์รูปกลาง (idempotent) — ใช้โดย PhotoResolver.gs */
function setupPhotoConfig() {
  var props = PropertiesService.getScriptProperties();
  var map = {
    PHOTO_MODULE_ENABLED: "TRUE",
    PHOTO_ACADEMIC_YEAR: "2569",
    PHOTO_MASTER_FOLDER_ID: "1HPCQo2AzpFeEu7jhwaf_FwohfY6oLXN7",
    PHOTO_MASTER_SPREADSHEET_ID: "1G3Nezl0Ye2gKVBx9t87yB9EcKeDR8LrYDlLFXfzA-Ik",
    PHOTO_FOLDER_YEAR1_ID: "11-YKNa4GQR_tdSbHMCm7dR0-1iFoQbjR",
    PHOTO_FOLDER_YEAR2_ID: "1d9PRDZ3rVKt4gb-thT2PAVB0u-5YHu_b",
    PHOTO_FOLDER_YEAR3_ID: "1STOFoDot7JZcF0V5HyPVbcFoBCFbCK1l",
    PHOTO_FOLDER_YEAR4_ID: "1PIPLY5GFTvalesWlo-o84VxMwZJrz1l1"
  };
  Object.keys(map).forEach(function (k) { props.setProperty(k, map[k]); });
  return map;
}

/** บังคับให้ Google ขอสิทธิ์ (Drive/Sheets) ครบทุกตัว — ใช้ครั้งแรกหลัง deploy */
function importAuthorize() {
  var checks = {};
  try { checks.effectiveUser = Session.getEffectiveUser().getEmail(); } catch (e) { checks.effectiveUserError = e.message; }
  try { checks.activeUser = Session.getActiveUser().getEmail(); } catch (e) { checks.activeUserError = e.message; }
  try {
    var info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    checks.authStatus = String(info.getAuthorizationStatus());
    checks.authUrl = info.getAuthorizationUrl();
  } catch (e) { checks.authInfoError = e.message; }
  try { checks.spreadsheet = getSpreadsheet().getName(); } catch (e) { checks.spreadsheetError = e.message; }
  try { checks.driveFolder = DriveApp.getFolderById(IMPORT_CFG.MEDICAL_ROOT_FOLDER_ID).getName(); }
  catch (e) { checks.driveError = e.message; }
  try { checks.photoFolder = DriveApp.getFolderById(IMPORT_CFG.PHOTO_FOLDERS[0].id).getName(); }
  catch (e) { checks.photoError = e.message; }
  var ok = !!(checks.spreadsheet && checks.driveFolder && checks.photoFolder);
  return { success: ok, checks: checks, authorizedAt: nowStamp_() };
}

/** อ่านหัวคอลัมน์ + ตัวอย่าง ของไฟล์ต้นทางทั้งหมด (dry-run) */
function importInspectSources() {
  var items = [];
  function add(label, id) { items.push({ label: label, id: id }); }
  (IMPORT_CFG.FORM_SOURCE_IDS || []).forEach(function (id) { add("form", id); });
  (IMPORT_CFG.ROSTER_SOURCE_IDS || []).forEach(function (id) { add("roster", id); });
  (IMPORT_CFG.VACCINE_SOURCE_IDS || []).forEach(function (id) { add("vaccine", id); });
  (IMPORT_CFG.CERT_SOURCE_IDS || []).forEach(function (id) { add("cert", id); });
  (IMPORT_CFG.MONTHLY_EXTRA_FILE_IDS || []).forEach(function (id) { add("monthly", id); });

  var out = [];
  items.forEach(function (item) {
    try {
      var src = readSourceFile_(item.id);
      out.push({
        label: item.label, id: item.id, name: src.name, via: src.via,
        dataRows: Math.max(0, (src.rows || []).length - 1),
        headers: (src.rows || [])[0] || [],
        sample: (src.rows || []).slice(1, 4)
      });
    } catch (e) {
      out.push({ label: item.label, id: item.id, error: e.message });
    }
  });
  return out;
}

/**
 * รันนำเข้าเป็นขั้น ๆ เพื่อไม่ให้เกินเวลาประมวลผลของ Apps Script
 * step: recipients | visits1 | visits2 | monthly | vaccines | certificates | documents | photos | reorganize
 */
function importStep(step, key) {
  assertImportKey_(key);
  setupPhotoConfig();

  var ss = getSpreadsheet();
  var started = new Date();
  var report = { step: step, startedAt: nowStamp_(), logs: [], errors: [] };

  try {
    ensureImportTables_(ss);

    if (step === "recipients") {
      importRecipients_(ss, report);
    } else if (step === "visits1") {
      var r1 = importVisitsFromForms_(ss, report, [IMPORT_CFG.FORM_SOURCE_IDS[0]]);
      report.visits = r1.stats;
    } else if (step === "visits2") {
      var r2 = importVisitsFromForms_(ss, report, [IMPORT_CFG.FORM_SOURCE_IDS[1]]);
      report.visits = r2.stats;
    } else if (step === "monthly") {
      report.monthly = importMonthlyFolder_(ss, report);
    } else if (step === "vaccines") {
      report.vaccinations = importVaccinations_(ss, report, []);
    } else if (step === "certificates") {
      report.certificates = importCertificates_(ss, report);
    } else if (step === "documents") {
      report.studentDocuments = importStudentDocuments_(ss, report);
    } else if (step === "dedupe") {
      report.dedupe = cleanupDuplicates_(ss);
    } else if (step === "photos") {
      report.photos = scanPhotoFolders_(ss, report);
      report.photosApplied = applyPhotosToRecipients_(ss, report);
    } else if (step === "reorganize") {
      report.reorganize = reorganizeDrive_(false);
    } else {
      throw new Error("ไม่รู้จักขั้นตอน: " + step);
    }

    report.success = report.errors.length === 0;
  } catch (e) {
    report.success = false;
    report.fatal = e.message;
    report.stack = e.stack;
  }

  report.finishedAt = nowStamp_();
  report.durationSeconds = Math.round((new Date() - started) / 1000);
  report.dbCounts = (function () {
    var names = ["ServiceRecipients", "Visits", "Assessments", "Treatments", "Vaccinations", "Certificates", "PhotoIndex", "StudentDocuments"];
    var o = {};
    names.forEach(function (n) {
      var s = ss.getSheetByName(n);
      o[n] = s ? Math.max(0, s.getLastRow() - 1) : null;
    });
    return o;
  })();
  return report;
}

/** ย้ายไฟล์/โฟลเดอร์ที่ไม่เกี่ยวกับเวชระเบียนจริง (apply=true) */
function reorganizeDriveApply(key) {
  assertImportKey_(key);
  return reorganizeDrive_(true);
}
