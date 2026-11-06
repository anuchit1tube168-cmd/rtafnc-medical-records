/**
 * RTAFNC PHOTO MASTER 2569
 *
 * Security boundary:
 * - รูปบุคคลเป็น Identity Asset แยกจากข้อมูลสุขภาพ/PHI
 * - ทุก public function ต้องผ่าน validateSession()
 * - ใช้รหัสนักเรียน 7 หลัก (ServiceRecipients.NumberOrOrder) เป็น key เท่านั้น
 * - ไม่เดารูปจากชื่อบุคคล
 */

const PHOTO_INLINE_MAX_BYTES = 4 * 1024 * 1024; // จำกัด payload สำหรับ google.script.run

function getPhotoModuleConfig_() {
  return {
    enabled: String(getBackendConfig('PHOTO_MODULE_ENABLED', 'TRUE')).toUpperCase() !== 'FALSE',
    academicYear: String(getBackendConfig('PHOTO_ACADEMIC_YEAR', '2569')),
    masterSpreadsheetId: getBackendConfig('PHOTO_MASTER_SPREADSHEET_ID', '1G3Nezl0Ye2gKVBx9t87yB9EcKeDR8LrYDlLFXfzA-Ik'),
    masterFolderId: getBackendConfig('PHOTO_MASTER_FOLDER_ID', '1HPCQo2AzpFeEu7jhwaf_FwohfY6oLXN7'),
    folderByPrefix: {
      '69': getBackendConfig('PHOTO_FOLDER_YEAR1_ID', '11-YKNa4GQR_tdSbHMCm7dR0-1iFoQbjR'),
      '68': getBackendConfig('PHOTO_FOLDER_YEAR2_ID', '1d9PRDZ3rVKt4gb-thT2PAVB0u-5YHu_b'),
      '67': getBackendConfig('PHOTO_FOLDER_YEAR3_ID', '1STOFoDot7JZcF0V5HyPVbcFoBCFbCK1l'),
      '66': getBackendConfig('PHOTO_FOLDER_YEAR4_ID', '1PIPLY5GFTvalesWlo-o84VxMwZJrz1l1')
    },
    classYearByPrefix: {
      '69': 1,
      '68': 2,
      '67': 3,
      '66': 4
    }
  };
}

function normalizeStudentCode7_(value) {
  const code = String(value == null ? '' : value).trim();
  if (!/^\d{7}$/.test(code)) {
    throw new Error('รหัสนักเรียนต้องเป็นตัวเลข 7 หลัก');
  }
  return code;
}

function isImageMime_(mimeType) {
  return String(mimeType || '').toLowerCase().indexOf('image/') === 0;
}

function isWebCompatibleImage_(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif';
}

function findPhotoMatchesByStudentCode_(studentCode) {
  const code = normalizeStudentCode7_(studentCode);
  const cfg = getPhotoModuleConfig_();
  if (!cfg.enabled) {
    return { code: code, config: cfg, matches: [], status: 'PHOTO_MODULE_DISABLED' };
  }

  const prefix = code.substring(0, 2);
  const folderId = cfg.folderByPrefix[prefix];
  if (!folderId) {
    return { code: code, config: cfg, matches: [], status: 'PHOTO_ROUTE_NOT_CONFIGURED' };
  }

  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const matches = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = String(file.getName() || '').trim();
    const mimeType = file.getMimeType();
    if (name.indexOf(code) === 0 && isImageMime_(mimeType)) {
      matches.push({
        fileId: file.getId(),
        name: name,
        mimeType: mimeType,
        size: Number(file.getSize() || 0),
        folderId: folderId,
        classYear: cfg.classYearByPrefix[prefix] || null,
        prefix: prefix,
        webCompatible: isWebCompatibleImage_(mimeType)
      });
    }
  }

  let status = 'OK';
  if (matches.length === 0) status = 'PHOTO_MISSING';
  if (matches.length > 1) status = 'PHOTO_REVIEW_REQUIRED';

  return { code: code, config: cfg, matches: matches, status: status };
}

/**
 * Resolve รูปด้วยรหัสนักเรียน 7 หลัก
 * @param {string} sessionToken session ของระบบเวชระเบียน
 * @param {string|number} studentCode รหัสนักเรียน 7 หลัก
 * @param {boolean} includeDataUrl true = คืน data URL เมื่อไฟล์ web-compatible และไม่เกิน 4 MB
 */
function resolveStudentPhoto(sessionToken, studentCode, includeDataUrl) {
  validateSession(sessionToken);

  const result = findPhotoMatchesByStudentCode_(studentCode);
  const response = {
    success: result.status === 'OK',
    status: result.status,
    studentCode: result.code,
    academicYear: result.config.academicYear,
    classYear: null,
    fileId: '',
    fileName: '',
    mimeType: '',
    size: 0,
    webCompatible: false,
    needsDerivative: false,
    dataUrl: ''
  };

  if (result.matches.length !== 1) {
    response.matchCount = result.matches.length;
    return response;
  }

  const match = result.matches[0];
  response.classYear = match.classYear;
  response.fileId = match.fileId;
  response.fileName = match.name;
  response.mimeType = match.mimeType;
  response.size = match.size;
  response.webCompatible = match.webCompatible;
  response.needsDerivative = !match.webCompatible || match.size > PHOTO_INLINE_MAX_BYTES;

  if (includeDataUrl === true && match.webCompatible && match.size <= PHOTO_INLINE_MAX_BYTES) {
    const blob = DriveApp.getFileById(match.fileId).getBlob();
    response.dataUrl = 'data:' + match.mimeType + ';base64,' + Utilities.base64Encode(blob.getBytes());
  }

  return response;
}

/**
 * Resolve รูปจาก RecipientID หรือรหัสนักเรียน 7 หลัก
 */
function getRecipientPhoto(sessionToken, recipientIdOrStudentCode, includeDataUrl) {
  validateSession(sessionToken);
  const query = String(recipientIdOrStudentCode == null ? '' : recipientIdOrStudentCode).trim();
  if (!query) throw new Error('ไม่พบรหัสผู้รับบริการ');

  if (/^\d{7}$/.test(query)) {
    return resolveStudentPhoto(sessionToken, query, includeDataUrl === true);
  }

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('ServiceRecipients');
  if (!sheet || sheet.getLastRow() < 2) throw new Error('ไม่พบทะเบียนผู้รับบริการ');

  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const recIdIdx = headers.indexOf('RecipientID');
  const numIdx = headers.indexOf('NumberOrOrder');
  if (recIdIdx === -1 || numIdx === -1) throw new Error('โครงสร้าง ServiceRecipients ไม่ครบ');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][recIdIdx] || '').trim() === query) {
      const code = String(data[i][numIdx] || '').trim();
      if (!/^\d{7}$/.test(code)) {
        return { success: false, status: 'STUDENT_CODE_MISSING', studentCode: code, recipientId: query };
      }
      const photo = resolveStudentPhoto(sessionToken, code, includeDataUrl === true);
      photo.recipientId = query;
      return photo;
    }
  }

  return { success: false, status: 'RECIPIENT_NOT_FOUND', recipientId: query };
}

/**
 * Audit รูปทั้ง 4 ชั้นปี โดยไม่อ่าน/ส่งออกข้อมูลสุขภาพ
 * จำกัดสิทธิ์ ADMIN / MEDICAL
 */
function auditPhotoMaster(sessionToken) {
  const session = validateSession(sessionToken);
  if (['ADMIN', 'MEDICAL'].indexOf(session.role) === -1) {
    throw new Error('ไม่มีสิทธิ์ตรวจสอบฐานรูป');
  }

  const cfg = getPhotoModuleConfig_();
  const summary = [];
  const duplicateCodes = [];
  const invalidFiles = [];

  Object.keys(cfg.folderByPrefix).forEach(function(prefix) {
    const folderId = cfg.folderByPrefix[prefix];
    if (!folderId) return;

    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    const seen = {};
    let imageCount = 0;
    let nonImageCount = 0;
    let heifCount = 0;
    let largeImageCount = 0;

    while (files.hasNext()) {
      const file = files.next();
      const name = String(file.getName() || '').trim();
      const mime = file.getMimeType();
      const m = name.match(/^(\d{7})/);

      if (!isImageMime_(mime)) {
        nonImageCount++;
        invalidFiles.push({ prefix: prefix, fileId: file.getId(), name: name, issue: 'NON_IMAGE' });
        continue;
      }

      imageCount++;
      if (String(mime).toLowerCase() === 'image/heif' || String(mime).toLowerCase() === 'image/heic') heifCount++;
      if (Number(file.getSize() || 0) > PHOTO_INLINE_MAX_BYTES) largeImageCount++;

      if (!m) {
        invalidFiles.push({ prefix: prefix, fileId: file.getId(), name: name, issue: 'MISSING_7_DIGIT_PREFIX' });
        continue;
      }

      const code = m[1];
      seen[code] = (seen[code] || 0) + 1;
    }

    Object.keys(seen).forEach(function(code) {
      if (seen[code] > 1) duplicateCodes.push({ studentCode: code, count: seen[code], prefix: prefix });
    });

    summary.push({
      prefix: prefix,
      classYear: cfg.classYearByPrefix[prefix],
      folderId: folderId,
      imageCount: imageCount,
      nonImageCount: nonImageCount,
      heifCount: heifCount,
      largeImageCount: largeImageCount
    });
  });

  return {
    success: true,
    academicYear: cfg.academicYear,
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'),
    summary: summary,
    duplicateCodes: duplicateCodes,
    invalidFiles: invalidFiles
  };
}

/**
 * Rebuild PHOTO_INDEX ใน Central Photo Master จาก Google Drive source folders
 * ไม่เขียนข้อมูลสุขภาพลงดัชนี
 */
function syncPhotoMasterIndex(sessionToken) {
  const session = validateSession(sessionToken);
  if (['ADMIN', 'MEDICAL'].indexOf(session.role) === -1) {
    throw new Error('ไม่มีสิทธิ์ซิงก์ฐานรูป');
  }

  const cfg = getPhotoModuleConfig_();
  if (!cfg.masterSpreadsheetId) throw new Error('ยังไม่ได้ตั้ง PHOTO_MASTER_SPREADSHEET_ID');

  const photoSs = SpreadsheetApp.openById(cfg.masterSpreadsheetId);
  let sheet = photoSs.getSheetByName('PHOTO_INDEX');
  if (!sheet) sheet = photoSs.insertSheet('PHOTO_INDEX');

  const headers = ['student_code_7','class_year','cohort_prefix','display_name','source_file_id','source_folder_id','mime_type','source_file_url','status','updated_at'];
  const rows = [headers];
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ssXXX");

  Object.keys(cfg.folderByPrefix).forEach(function(prefix) {
    const folderId = cfg.folderByPrefix[prefix];
    if (!folderId) return;
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();

    while (files.hasNext()) {
      const file = files.next();
      const name = String(file.getName() || '').trim();
      const mime = file.getMimeType();
      if (!isImageMime_(mime)) continue;

      const m = name.match(/^(\d{7})/);
      if (!m) continue;
      const code = m[1];
      const displayName = name.replace(/^\d{7}\s*/, '').replace(/\.[^.]+$/, '').trim();
      const status = isWebCompatibleImage_(mime) && Number(file.getSize() || 0) <= PHOTO_INLINE_MAX_BYTES ? 'READY' : 'NEEDS_DERIVATIVE';

      rows.push([
        code,
        cfg.classYearByPrefix[prefix] || '',
        prefix,
        displayName,
        file.getId(),
        folderId,
        mime,
        'https://drive.google.com/file/d/' + file.getId() + '/view',
        status,
        now
      ]);
    }
  });

  if (sheet.getMaxRows() < rows.length) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.autoResizeColumns(1, headers.length);

  return {
    success: true,
    indexedImages: rows.length - 1,
    spreadsheetId: cfg.masterSpreadsheetId,
    academicYear: cfg.academicYear,
    updatedAt: now
  };
}
