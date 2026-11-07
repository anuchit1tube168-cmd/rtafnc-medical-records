/**
 * LEAVE-CARD.MJS — บัตรขออนุญาตและบันทึกผลการตรวจรักษา นพอ.
 * ออกแบบตามแบบฟอร์มทางการ วิทยาลัยพยาบาลทหารอากาศ กรมแพทย์ทหารอากาศ
 */

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export function getThaiDateParts(date = new Date()) {
  const d = new Date(date);
  return {
    day: d.getDate(),
    month: THAI_MONTHS[d.getMonth()],
    year: d.getFullYear() + 543,
    time: d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }),
    full: `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`
  };
}

export function renderLeaveCardHtml(data, options = {}) {
  const p = getThaiDateParts(data.createdAt || new Date());
  const isApproved = data.status === 'APPROVED';
  const isRejected = data.status === 'REJECTED';
  const isReturned = data.status === 'RETURNED' || Boolean(data.diagnosis || data.treatment);
  const showSection2 = isReturned || options.isStaff;

  const statusBadge = isApproved
    ? `<div class="stamp-badge approved"><i class="fas fa-check-circle"></i> ได้รับอนุมัติแล้ว (APPROVED)<br><small>โดย: ${data.approver || 'อาจารย์เวร/ผู้บังคับบัญชา'} เมื่อ: ${data.approvedAt || p.time + ' น.'}</small></div>`
    : (isRejected
      ? `<div class="stamp-badge rejected"><i class="fas fa-times-circle"></i> ไม่อนุมัติ (REJECTED)<br><small>โดย: ${data.approver || 'อาจารย์เวร'} เมื่อ: ${data.approvedAt || p.time + ' น.'}</small></div>`
      : `<div class="stamp-badge pending"><i class="fas fa-clock"></i> รออาจารย์อนุมัติ (PENDING APPROVAL)</div>`);

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>บัตรขออนุญาตไปตรวจ/รักษา — นพอ. ${data.studentName || ''}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@300;400;500;600;700&family=Kanit:wght@300;400;500;600&family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Sarabun', 'Bai Jamjuree', sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      padding: 24px 12px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .card-container {
      background: #ffffff;
      width: 100%;
      max-width: 780px;
      border: 3px solid #082444;
      border-radius: 8px;
      padding: 28px 36px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
      position: relative;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-size: 15px;
      font-weight: 600;
      color: #082444;
    }
    .header-left {
      flex: 1;
      border-bottom: 1px dotted #082444;
      padding-bottom: 2px;
    }
    .header-center {
      padding: 0 20px;
      text-align: center;
    }
    .header-center img {
      width: 76px;
      height: 76px;
      object-fit: contain;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
    }
    .header-right {
      flex: 1;
      text-align: right;
      border-bottom: 1px dotted #082444;
      padding-bottom: 2px;
    }
    .card-title-section {
      text-align: center;
      margin: 12px 0 20px 0;
    }
    .card-title-section h1 {
      font-family: 'Kanit', sans-serif;
      font-size: 20px;
      font-weight: 600;
      color: #082444;
      line-height: 1.3;
    }
    .card-title-section .subtitle {
      font-size: 14px;
      color: #475569;
    }
    .card-box {
      border: 2px solid #082444;
      border-radius: 6px;
      padding: 18px 22px;
      margin-bottom: 16px;
      background: #fafcff;
      position: relative;
    }
    .section-badge {
      display: inline-block;
      border: 2px solid #082444;
      background: #ffffff;
      padding: 3px 12px;
      font-weight: 700;
      font-size: 14px;
      color: #082444;
      margin-bottom: 12px;
      border-radius: 4px;
    }
    .field-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      margin-bottom: 10px;
      font-size: 15px;
      line-height: 1.6;
    }
    .field-label {
      font-weight: 600;
      color: #082444;
      white-space: nowrap;
      margin-right: 6px;
    }
    .field-value {
      flex: 1;
      border-bottom: 1px dotted #94a3b8;
      padding: 0 4px;
      color: #1e293b;
      font-weight: 500;
    }
    .field-col-2 {
      display: flex;
      width: 100%;
      gap: 16px;
    }
    .field-col-2 > div {
      flex: 1;
      display: flex;
      align-items: baseline;
    }
    .stamp-container {
      margin: 18px 0;
      display: flex;
      justify-content: center;
    }
    .stamp-badge {
      display: inline-block;
      padding: 10px 24px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 16px;
      text-align: center;
      border: 2px dashed;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
    }
    .stamp-badge.approved {
      color: #047857;
      background: #ecfdf5;
      border-color: #059669;
    }
    .stamp-badge.rejected {
      color: #b91c1c;
      background: #fef2f2;
      border-color: #dc2626;
    }
    .stamp-badge.pending {
      color: #b45309;
      background: #fffbeb;
      border-color: #d97706;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .footer-bar {
      margin-top: 18px;
      text-align: right;
      font-size: 13px;
      color: #475569;
    }
    .actions-bar {
      margin-top: 24px;
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary { background: #005696; color: #ffffff; }
    .btn-primary:hover { background: #003e6d; }
    .btn-success { background: #059669; color: #ffffff; }
    .btn-success:hover { background: #047857; }
    .btn-danger { background: #dc2626; color: #ffffff; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-outline { background: #ffffff; border: 1.5px solid #082444; color: #082444; }
    .btn-outline:hover { background: #f8fafc; }

    /* Modal for Recording Return */
    #returnModal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      padding: 16px;
    }
    #returnModal.show { display: flex; }
    .modal-content {
      background: #ffffff;
      border-radius: 10px;
      max-width: 540px;
      width: 100%;
      padding: 24px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
    }

    @media print {
      body { background: #ffffff; padding: 0; }
      .card-container { box-shadow: none; border-color: #000; width: 100%; max-width: 100%; }
      .actions-bar, #returnModal { display: none !important; }
    }
  </style>
</head>
<body>

  <div class="card-container">
    
    <!-- Header -->
    <div class="header-bar">
      <div class="header-left">
        วันที่ <u>${data.day || p.day}</u> เดือน <u>${data.month || p.month}</u> พ.ศ. <u>${data.year || p.year}</u>
      </div>
      <div class="header-center">
        <img src="/assets/rtafnc_logo.png" alt="ตราสัญลักษณ์วิทยาลัยพยาบาลทหารอากาศ" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Royal_Thai_Air_Force_Nursing_College_Emblem.png/240px-Royal_Thai_Air_Force_Nursing_College_Emblem.png';">
      </div>
      <div class="header-right">
        รหัส นพอ. : <u>${data.studentId || '-'}</u>
      </div>
    </div>

    <!-- Title -->
    <div class="card-title-section">
      <h1>${isReturned ? 'บันทึก การตรวจ/รักษา นพอ.' : 'การขออนุญาต<br>การไปตรวจ หรือ ไปรักษา'}</h1>
      <div class="subtitle">วิทยาลัยพยาบาลทหารอากาศ กรมแพทย์ทหารอากาศ</div>
    </div>

    <!-- Section 1 -->
    <div class="card-box">
      <div class="section-badge">ส่วนที่ 1 : การไปตรวจ/รักษาอาการ</div>
      
      <div class="field-col-2">
        <div>
          <span class="field-label">ชื่อ – สกุล :</span>
          <span class="field-value">${data.studentName || '-'}</span>
        </div>
        <div style="max-width: 140px;">
          <span class="field-label">ชั้นปีที่ :</span>
          <span class="field-value">${data.yearLevel || '-'}</span>
        </div>
      </div>

      <div class="field-col-2" style="margin-top: 8px;">
        <div>
          <span class="field-label">ไปตรวจ/รักษา ที่ :</span>
          <span class="field-value">${data.hospital || 'โรงพยาบาลภูมิพลอดุลยเดช พอ.'}</span>
        </div>
        <div>
          <span class="field-label">เนื่องจาก :</span>
          <span class="field-value">${data.reason || 'มีอาการผิดปกติ'}</span>
        </div>
      </div>

      <div class="field-row" style="margin-top: 8px;">
        <span class="field-label">แผนกที่ไปตรวจ/รักษา :</span>
        <span class="field-value">${data.department || 'ห้องฉุกเฉินและอุบัติเหตุ (ER)'}</span>
      </div>

      <div class="field-row" style="margin-top: 8px;">
        <span class="field-label">อาการสำคัญ (CC) :</span>
        <span class="field-value">${data.chiefComplaint || '-'}</span>
      </div>
    </div>

    <!-- Approval Status Stamp -->
    <div class="stamp-container">
      ${statusBadge}
    </div>

    <!-- Section 2: ผลตรวจและผลการรักษาเมื่อกลับจาก รพ. -->
    ${showSection2 ? `
    <div class="card-box" style="background:#f8fafc; border-color:#334155;">
      <div class="section-badge" style="border-color:#334155;">ส่วนที่ 2 : การวินิจฉัย และ การรักษา</div>
      
      <div class="field-row">
        <span class="field-label">การวินิจฉัยของแพทย์ (Dx) :</span>
        <span class="field-value">${data.diagnosis || '-'}</span>
      </div>

      <div class="field-row" style="margin-top: 8px;">
        <span class="field-label">การรักษาของแพทย์ :</span>
        <span class="field-value">${data.treatment || '-'}</span>
      </div>

      <div class="field-row" style="margin-top: 8px;">
        <span class="field-label">ยา/วัคซีนที่ได้รับ :</span>
        <span class="field-value">${data.medicine || '-'}</span>
      </div>

      ${data.returnTime ? `
      <div class="field-row" style="margin-top: 8px;">
        <span class="field-label">เวลาที่กลับถึงวิทยาลัย :</span>
        <span class="field-value">${data.returnTime} น. (ผลการดูแล: ${data.outcome || 'ปกติ'})</span>
      </div>` : ''}
    </div>
    ` : ''}

    <!-- Footer -->
    <div class="footer-bar">
      บันทึกเมื่อ <u>${data.recordedDate || p.full}</u> เวลา <u>${data.recordedTime || p.time}</u> น.
      <br><small style="color:#94a3b8;">เลขที่อ้างอิง: ${data.id || '-'}</small>
    </div>

  </div>

  <!-- Actions Bar -->
  <div class="actions-bar">
    <button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> พิมพ์บัตร / บันทึกเป็น PDF</button>
    ${!isApproved && !isRejected && options.canApprove ? `
      <a href="/api/leave/approve?id=${data.id}&action=approve&token=${data.token}" class="btn btn-success"><i class="fas fa-check"></i> อนุมัติการไปตรวจ</a>
      <a href="/api/leave/approve?id=${data.id}&action=reject&token=${data.token}" class="btn btn-danger"><i class="fas fa-times"></i> ไม่อนุมัติ</a>
    ` : ''}
    ${isApproved && !isReturned ? `
      <button class="btn btn-success" onclick="openReturnModal()"><i class="fas fa-hospital-user"></i> บันทึกผลเมื่อกลับจาก รพ.</button>
    ` : ''}
    <a href="/?page=liff" class="btn btn-outline"><i class="fas fa-home"></i> กลับหน้าหลัก</a>
  </div>

  <!-- Return Record Modal -->
  <div id="returnModal">
    <div class="modal-content">
      <h3 style="font-family:'Kanit',sans-serif; color:#082444; margin-bottom:14px;"><i class="fas fa-hospital"></i> บันทึกผลการตรวจรักษา (เมื่อกลับจาก รพ.)</h3>
      <form id="returnForm" onsubmit="handleReturnSubmit(event)">
        <div style="margin-bottom:12px;">
          <label style="font-weight:600; display:block; margin-bottom:4px; font-size:14px;">การวินิจฉัยของแพทย์ (Dx):</label>
          <input type="text" name="diagnosis" required placeholder="เช่น อุบัติเหตุจราจร มีแผลถลอก, ไข้หวัดใหญ่" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-weight:600; display:block; margin-bottom:4px; font-size:14px;">การรักษาของแพทย์ (Rx):</label>
          <input type="text" name="treatment" placeholder="เช่น ทำแผล ฉีดยา พักสังเกตอาการ" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-weight:600; display:block; margin-bottom:4px; font-size:14px;">ยา/วัคซีนที่ได้รับ:</label>
          <input type="text" name="medicine" placeholder="เช่น Paracetamol, Cloxacillin, วัคซีนบาดทะยัก" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-weight:600; display:block; margin-bottom:4px; font-size:14px;">ผลการดูแล / ข้อกำหนดแพทย์:</label>
          <select name="outcome" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit;">
            <option value="กลับเข้าชั้นเรียน/ฝึกได้ตามปกติ">กลับเข้าชั้นเรียน/ฝึกได้ตามปกติ</option>
            <option value="พักฟื้นบนเรือนนอน">พักฟื้นบนเรือนนอน</option>
            <option value="พักสังเกตอาการห้องพยาบาล วพอ.">พักสังเกตอาการห้องพยาบาล วพอ.</option>
            <option value="ส่งตัวนอน รพ.ภูมิพลอดุลยเดช (Admit)">ส่งตัวนอน รพ.ภูมิพลอดุลยเดช (Admit)</option>
          </select>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="btn btn-outline" onclick="closeReturnModal()">ยกเลิก</button>
          <button type="submit" class="btn btn-success"><i class="fas fa-save"></i> บันทึกข้อมูล</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    function openReturnModal() { document.getElementById('returnModal').classList.add('show'); }
    function closeReturnModal() { document.getElementById('returnModal').classList.remove('show'); }
    async function handleReturnSubmit(e) {
      e.preventDefault();
      const f = e.target;
      const payload = {
        id: '${data.id || ''}',
        diagnosis: f.diagnosis.value,
        treatment: f.treatment.value,
        medicine: f.medicine.value,
        outcome: f.outcome.value
      };
      try {
        const res = await fetch('/api/leave/return', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const d = await res.json();
        if (d.ok) {
          alert('บันทึกผลการตรวจรักษาเรียบร้อยแล้ว');
          location.reload();
        } else {
          alert('เกิดข้อผิดพลาด: ' + (d.error || ''));
        }
      } catch (err) {
        alert('เชื่อมต่อไม่สำเร็จ: ' + err.message);
      }
    }
  </script>

</body>
</html>`;
}

export function encodeLeavePayload(data) {
  try {
    const compact = {
      id: data.studentId || data.id,
      name: data.studentName,
      y: data.yearLevel,
      h: data.hospital,
      d: data.department,
      r: data.reason,
      c: data.chiefComplaint,
      s: data.status,
      ap: data.approver,
      at: data.approvedAt,
      dx: data.diagnosis,
      rx: data.treatment,
      med: data.medicine,
      out: data.outcome,
      rt: data.returnTime
    };
    const jsonStr = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(jsonStr);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) {
    return '';
  }
}

export function decodeLeavePayload(str) {
  if (!str) return null;
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const jsonStr = new TextDecoder().decode(bytes);
    const raw = JSON.parse(jsonStr);
    return {
      id: 'REQ-' + (raw.id || ''),
      studentId: raw.id || '',
      studentName: raw.name || '',
      yearLevel: raw.y || '3',
      hospital: raw.h || 'โรงพยาบาลภูมิพลอดุลยเดช พอ.',
      department: raw.d || 'ห้องฉุกเฉินและอุบัติเหตุ (ER)',
      reason: raw.r || 'มีอาการผิดปกติ',
      chiefComplaint: raw.c || '-',
      status: raw.s || 'PENDING',
      approver: raw.ap,
      approvedAt: raw.at,
      diagnosis: raw.dx,
      treatment: raw.rx,
      medicine: raw.med,
      outcome: raw.out,
      returnTime: raw.rt
    };
  } catch (e) {
    return null;
  }
}

export function formatTelegramLeaveAlert(data, workerUrl) {
  const p = getThaiDateParts(data.createdAt || new Date());
  const urgencyEmoji = data.urgencyLevel && data.urgencyLevel.includes('ฉุกเฉิน') ? '🚨🔴' : (data.urgencyLevel && data.urgencyLevel.includes('ด่วน') ? '⚠️🟠' : '📋🔵');

  const enc = encodeLeavePayload(data);
  const text = `${urgencyEmoji} <b>ขออนุมัติการไปตรวจ/รักษา นพอ.</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>ชื่อ - สกุล:</b> ${data.studentName || '-'}
🆔 <b>รหัส นพอ.:</b> <code>${data.studentId || '-'}</code> (ชั้นปีที่ ${data.yearLevel || '-'})
🏥 <b>ไปตรวจ/รักษาที่:</b> ${data.hospital || 'โรงพยาบาลภูมิพลอดุลยเดช พอ.'}
🏢 <b>แผนกที่ไปตรวจ:</b> ${data.department || 'ห้องฉุกเฉินและอุบัติเหตุ (ER)'}
🩺 <b>อาการสำคัญ (CC):</b> <b>${data.chiefComplaint || '-'}</b>
📝 <b>เนื่องจาก:</b> ${data.reason || 'มีอาการผิดปกติ'}
⏰ <b>บันทึกเมื่อ:</b> ${p.day} ${p.month} ${p.year} เวลา ${p.time} น.
━━━━━━━━━━━━━━━━━━━━
<i>วิทยาลัยพยาบาลทหารอากาศ กรมแพทย์ทหารอากาศ</i>`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ อนุมัติการไปตรวจ', url: `${workerUrl}/api/leave/approve?id=${encodeURIComponent(data.id)}&action=approve&p=${enc}` },
        { text: '❌ ไม่อนุมัติ', url: `${workerUrl}/api/leave/approve?id=${encodeURIComponent(data.id)}&action=reject&p=${enc}` }
      ],
      [
        { text: '📄 เปิดดูบัตรขออนุญาต (ตรา วพอ.)', url: `${workerUrl}/card?id=${encodeURIComponent(data.id)}&p=${enc}` }
      ]
    ]
  };

  return { text, replyMarkup };
}
