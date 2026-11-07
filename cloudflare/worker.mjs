import { methods, studentMethods } from './methods.mjs';
import { renderLeaveCardHtml, formatTelegramLeaveAlert, getThaiDateParts, encodeLeavePayload, decodeLeavePayload } from './leave-card.mjs';
const encoder = new TextEncoder();
const json = (data, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
} });

// In-memory store for hospital leave requests & cards
const LEAVE_STORE = new Map([
  ['6703864', {
    id: 'REQ-6703864',
    studentId: '6703864',
    studentName: 'นพอ. รมิตา ธัยยาวัฒน์',
    yearLevel: '3',
    hospital: 'ห้องพยาบาล วพอ.พอ.',
    department: 'แผนกปกครอง วพอ.พอ.',
    reason: 'มีอาการผิดปกติ',
    chiefComplaint: 'ปวดหัว รู้สึกหนาว',
    status: 'APPROVED',
    approver: 'อาจารย์เวร วพอ.',
    approvedAt: '11:30 น.',
    day: 22,
    month: 'ตุลาคม',
    year: 2569,
    recordedDate: '30 ตุลาคม 2569',
    recordedTime: '11:25',
    token: 'auth-6703864'
  }],
  ['6703865', {
    id: 'REQ-6703865',
    studentId: '6703865',
    studentName: 'นพอ.(ช) โรจน์ศักดิ์ ทินนา',
    yearLevel: '3',
    hospital: 'โรงพยาบาลภูมิพลอดุลยเดช พอ.',
    department: 'ห้องฉุกเฉินและอุบัติเหตุ (ER)',
    reason: 'ประสบอุบัติเหตุจราจร',
    chiefComplaint: 'มีแผลถลอกบริเวณนิ้วโป้งซ้าย นิ้วชี้และนิ้วกลางด้านขวา',
    status: 'RETURNED',
    approver: 'อาจารย์เวร วพอ.',
    approvedAt: '08:20 น.',
    diagnosis: 'อุบัติเหตุจราจร มีแผลถลอกบริเวณนิ้วโป้งซ้าย นิ้วชี้และนิ้วกลางด้านขวา',
    treatment: 'ทำแผล ทำความสะอาดแผล ใส่ยาฆ่าเชื้อ',
    medicine: 'ยาแก้ปวด Paracetamol, ยาฆ่าเชื้อ Cloxacillin',
    returnTime: '10:30',
    outcome: 'กลับเข้าชั้นเรียนได้ตามปกติ',
    day: 18,
    month: 'ตุลาคม',
    year: 2569,
    recordedDate: '30 ตุลาคม 2569',
    recordedTime: '08:12',
    token: 'auth-6703865'
  }]
]);

async function sendTelegram(env, text, replyMarkup) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return { ok: false, error: 'Telegram bot token or chat ID not configured' };
  }
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return await res.json();
}

async function sendLine(env, text) {
  const token = env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  const target = env.LINE_TARGET_ID || env.LINE_STAFF_USER_ID;
  if (!token || !target) {
    return { ok: false, error: 'LINE messaging token or target ID not configured' };
  }
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to: target,
        messages: [{ type: 'text', text: text }]
      })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, result: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, '');
}

function formatReferralAlert(data) {
  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const hospital = data.destinationHospital || data.hospital || 'รพ.ภูมิพลอดุลยเดช พอ.';
  const urgency = data.urgencyLevel || data.urgency || 'เร่งด่วน';
  const urgencyEmoji = urgency.includes('ฉุกเฉิน') ? '🚨🔴' : (urgency.includes('ด่วน') ? '⚠️🟠' : 'ℹ️🔵');

  return `${urgencyEmoji} <b>แจ้งเตือนการส่งต่อผู้ป่วย (Hospital Referral)</b>
━━━━━━━━━━━━━━━━━━━━
🏥 <b>สถานพยาบาลปลายทาง:</b> ${hospital}
👤 <b>ผู้ป่วย/นักเรียน:</b> ${data.studentName || '-'}
🆔 <b>รหัส นพอ.:</b> <code>${data.studentId || '-'}</code>
📋 <b>ชั้นปี / สังกัด:</b> ${data.group || data.department || '-'}
🩺 <b>อาการสำคัญ / การวินิจฉัย:</b> ${data.diagnosis || data.chiefComplaint || '-'}
⚠️ <b>ประวัติแพ้ยา:</b> ${data.allergy || 'ไม่มี'}
🩸 <b>กรุ๊ปเลือด:</b> ${data.bloodGroup || '-'}
🚨 <b>ระดับความเร่งด่วน:</b> <b>${urgency}</b>
📝 <b>เหตุผลการส่งต่อ:</b> ${data.referralReason || data.reason || '-'}
👨‍⚕️ <b>ผู้ส่งต่อ / เจ้าหน้าที่:</b> ${data.referredBy || 'น.พยาบาล เวร'}
⏰ <b>เวลาส่งต่อ:</b> ${now} น.
━━━━━━━━━━━━━━━━━━━━
<i>ระบบเวชระเบียนและบริบาลสุขภาพ วิทยาลัยพยาบาลทหารอากาศ</i>`;
}

function formatTriageAlert(data) {
  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const urgency = data.urgency || 'ปกติ';
  const urgencyEmoji = urgency.includes('ฉุกเฉิน') ? '🚨🔴' : (urgency.includes('ด่วน') ? '⚠️🟠' : '🟢');

  return `🩺 <b>แจ้งเตือนคัดกรองตนเองผ่าน LINE LIFF (Pre-Triage)</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>นพอ.:</b> ${data.studentName || '-'}
🆔 <b>รหัสนักเรียน:</b> <code>${data.studentId || '-'}</code>
📋 <b>ชั้นปี / ตอน:</b> ${data.group || data.department || '-'}
🩸 <b>กรุ๊ปเลือด:</b> ${data.bloodGroup || '-'}
⚠️ <b>ประวัติแพ้ยา:</b> ${data.allergy && data.allergy !== 'ไม่มี' && data.allergy !== '-' ? `⚠️ <b>${data.allergy}</b>` : 'ไม่มี'}
📍 <b>สถานที่ปัจจุบัน:</b> ${data.location || 'อาคารกองการปกครอง / หอนอน'}
🌡️ <b>อาการที่พบ:</b> <b>${data.chiefComplaint || data.symptoms || '-'}</b>
📝 <b>รายละเอียดเพิ่มเติม:</b> ${data.incidentDetails || data.details || '-'}
${urgencyEmoji} <b>ระดับความเร่งด่วน:</b> <b>${urgency}</b>
⏰ <b>เวลาแจ้ง:</b> ${now} น.
━━━━━━━━━━━━━━━━━━━━
<i>วิทยาลัยพยาบาลทหารอากาศ กรมแพทย์ทหารอากาศ</i>`;
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  // Short URL redirects / shortcuts
  if (url.pathname === '/roster') {
    return Response.redirect(new URL('/?page=roster', url).toString(), 302);
  }

  // Leave card digital pass view (Image 1 & Image 2 template)
  if (url.pathname === '/card' || url.pathname === '/leave' || url.pathname === '/api/leave/card') {
    const rawId = url.searchParams.get('id') || '6703864';
    const id = rawId.replace(/^REQ-/, '');
    const pStr = url.searchParams.get('p');
    let data = (pStr && decodeLeavePayload(pStr)) || LEAVE_STORE.get(id) || LEAVE_STORE.get('REQ-' + id) || LEAVE_STORE.get('6703864');
    const isApprovedParam = url.searchParams.get('approved') === 'true';
    if (isApprovedParam && data) {
      data.status = 'APPROVED';
    }
    const html = renderLeaveCardHtml(data || {
      id: 'REQ-' + id,
      studentId: id,
      studentName: 'นพอ. รมิตา ธัยยาวัฒน์',
      yearLevel: '3',
      hospital: 'ห้องพยาบาล วพอ.พอ.',
      department: 'แผนกปกครอง วพอ.พอ.',
      reason: 'มีอาการผิดปกติ',
      chiefComplaint: 'ปวดหัว รู้สึกหนาว',
      status: 'APPROVED',
      token: 'preview'
    }, { canApprove: true, isStaff: true });

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  // Leave request submission (student requests hospital leave)
  if (url.pathname === '/api/leave/request') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const data = await request.json();
      const p = getThaiDateParts();
      const id = data.studentId ? `REQ-${data.studentId}` : `REQ-${Date.now()}`;
      const token = crypto.randomUUID().slice(0, 8);
      const record = {
        id,
        studentId: data.studentId || '-',
        studentName: data.studentName || '-',
        yearLevel: data.yearLevel || data.group || '3',
        hospital: data.hospital || 'โรงพยาบาลภูมิพลอดุลยเดช พอ.',
        department: data.department || 'ห้องฉุกเฉินและอุบัติเหตุ (ER)',
        reason: data.reason || 'มีอาการผิดปกติ',
        chiefComplaint: data.chiefComplaint || '-',
        urgencyLevel: data.urgencyLevel || 'ทั่วไป',
        status: 'PENDING',
        day: p.day,
        month: p.month,
        year: p.year,
        recordedDate: p.full,
        recordedTime: p.time,
        createdAt: new Date().toISOString(),
        token
      };

      LEAVE_STORE.set(data.studentId, record);
      LEAVE_STORE.set(id, record);

      // Send interactive Telegram alert to group with Inline Buttons!
      const workerUrl = `${url.protocol}//${url.host}`;
      const alert = formatTelegramLeaveAlert(record, workerUrl);
      const tgRes = await sendTelegram(env, alert.text, alert.replyMarkup);

      // Also notify LINE if configured
      const lineText = `📋 ขออนุมัติการไปตรวจ/รักษา นพอ.\nรหัส: ${record.studentId} (${record.studentName})\nไปที่: ${record.hospital} (${record.department})\nอาการ: ${record.chiefComplaint}\nเปิดดูบัตร: ${workerUrl}/card?id=${record.studentId}`;
      const lineRes = await sendLine(env, lineText);

      return json({
        ok: true,
        id,
        cardUrl: `${workerUrl}/card?id=${record.studentId}`,
        telegram: tgRes,
        line: lineRes
      });
    } catch (err) {
      return json({ ok: false, error: err.message }, 400);
    }
  }

  // Leave approval endpoint (Teacher approves via Telegram button or Web)
  if (url.pathname === '/api/leave/approve') {
    const rawId = url.searchParams.get('id') || '';
    const id = rawId.replace(/^REQ-/, '');
    const action = url.searchParams.get('action') || 'approve';
    const approver = url.searchParams.get('approver') || 'อาจารย์เวร วพอ.';
    const pStr = url.searchParams.get('p');
    let record = (pStr && decodeLeavePayload(pStr)) || LEAVE_STORE.get(id) || LEAVE_STORE.get('REQ-' + id);
    if (!record) {
      record = {
        id: 'REQ-' + id,
        studentId: id,
        studentName: 'นพอ. ผู้ขออนุญาต',
        yearLevel: '3',
        hospital: 'โรงพยาบาลภูมิพลอดุลยเดช พอ.',
        department: 'ห้องฉุกเฉินและอุบัติเหตุ (ER)',
        reason: 'มีอาการผิดปกติ',
        chiefComplaint: 'มีอาการเจ็บป่วย'
      };
    }

    const p = getThaiDateParts();
    const workerUrl = `${url.protocol}//${url.host}`;
    if (action === 'approve') {
      record.status = 'APPROVED';
      record.approver = approver;
      record.approvedAt = `${p.time} น.`;
      LEAVE_STORE.set(id, record);
      LEAVE_STORE.set(record.id, record);

      // Post update to Telegram group
      const updateMsg = `✅ <b>อนุมัติการไปตรวจ/รักษา เรียบร้อยแล้ว</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>นพอ.:</b> ${record.studentName} (รหัส <code>${record.studentId}</code>)
🏥 <b>สถานที่:</b> ${record.hospital} (${record.department})
🩺 <b>อาการ:</b> ${record.chiefComplaint}
👨‍🏫 <b>ผู้อนุมัติ:</b> ${approver}
⏰ <b>เวลาอนุมัติ:</b> ${p.time} น.
━━━━━━━━━━━━━━━━━━━━
📄 <b>บัตรผ่านดิจิทัล:</b> <a href="${workerUrl}/card?id=${record.studentId}&approved=true">กดเปิดดูบัตรขออนุญาตที่นี่</a>`;
      await sendTelegram(env, updateMsg);

      const enc = encodeLeavePayload(record);
      return Response.redirect(`${workerUrl}/card?id=${record.studentId}&approved=true&p=${enc}`, 302);
    } else {
      record.status = 'REJECTED';
      record.approver = approver;
      record.approvedAt = `${p.time} น.`;
      LEAVE_STORE.set(id, record);
      LEAVE_STORE.set(record.id, record);

      const rejectMsg = `❌ <b>ไม่อนุมัติการไปตรวจ/รักษา</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>นพอ.:</b> ${record.studentName} (รหัส <code>${record.studentId}</code>)
👨‍🏫 <b>ผู้ไม่อนุมัติ:</b> ${approver}
⏰ <b>เวลา:</b> ${p.time} น.`;
      await sendTelegram(env, rejectMsg);

      const enc = encodeLeavePayload(record);
      return Response.redirect(`${workerUrl}/card?id=${record.studentId}&p=${enc}`, 302);
    }
  }

  // Record Return from hospital (Section 2)
  if (url.pathname === '/api/leave/return') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const data = await request.json();
      const rawId = data.id || '';
      const id = rawId.replace(/^REQ-/, '');
      const record = LEAVE_STORE.get(id) || LEAVE_STORE.get('REQ-' + id);
      if (!record) return json({ ok: false, error: 'ไม่พบรายการคำขอ' }, 404);

      const p = getThaiDateParts();
      record.status = 'RETURNED';
      record.diagnosis = data.diagnosis || '-';
      record.treatment = data.treatment || '-';
      record.medicine = data.medicine || '-';
      record.outcome = data.outcome || 'กลับเข้าชั้นเรียนได้ตามปกติ';
      record.returnTime = p.time;

      // Post return summary to Telegram group
      const workerUrl = `${url.protocol}//${url.host}`;
      const returnMsg = `🏥 <b>บันทึกการกลับจาก รพ. เรียบร้อยแล้ว</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>นพอ.:</b> ${record.studentName} (รหัส <code>${record.studentId}</code>)
🏥 <b>สถานที่ไปตรวจ:</b> ${record.hospital}
🩺 <b>การวินิจฉัย (Dx):</b> ${record.diagnosis}
💊 <b>การรักษา (Rx):</b> ${record.treatment}
📦 <b>ยา/วัคซีนที่ได้รับ:</b> ${record.medicine}
🏠 <b>ผลการดูแล:</b> <b>${record.outcome}</b>
⏰ <b>เวลาที่กลับถึง วพอ.:</b> ${record.returnTime} น.
━━━━━━━━━━━━━━━━━━━━
📄 <b>ใบตรวจรักษาฉบับสมบูรณ์:</b> <a href="${workerUrl}/card?id=${record.studentId}">กดเปิดดูใบตรวจรักษา</a>`;
      await sendTelegram(env, returnMsg);

      return json({ ok: true, record });
    } catch (err) {
      return json({ ok: false, error: err.message }, 400);
    }
  }

  // Non-API asset handling
  if (!url.pathname.startsWith('/api/')) {
    if (!env.ASSETS) return json({ error: 'ASSETS binding not available' }, 503);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Content-Type-Options', 'nosniff');
    const isLiff = url.pathname.includes('/liff') || url.searchParams.get('page') === 'liff';
    if (!isLiff) {
      headers.set('X-Frame-Options', 'DENY');
    }
    return new Response(response.body, { status: response.status, headers });
  }

  // Health check endpoint
  if (url.pathname === '/api/health') {
    return json({ ok: true, service: 'rtafnc-medical-worker', version: '2.0.0', timestamp: new Date().toISOString() });
  }

  // LIFF Config endpoint
  if (url.pathname === '/api/liff-config') {
    return json({ ok: true, liffId: env.LINE_LIFF_ID || '2012450964-nLKUtgQn' });
  }

  // Telegram test notification
  if (url.pathname === '/api/telegram/test' || url.pathname === '/api/testTelegram') {
    const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const text = `🔔 <b>ทดสอบการเชื่อมต่อระบบแจ้งเตือน Telegram (Cloudflare Worker Edge)</b>\nระบบเวชระเบียนและบริบาลสุขภาพ นพอ. วิทยาลัยพยาบาลทหารอากาศ\nเวลา: ${nowStr} น.\nสถานะ: 🟢 เชื่อมต่อสำเร็จ 100%`;
    const tgRes = await sendTelegram(env, text);
    return json({ ok: tgRes.ok, result: tgRes });
  }

  // LINE test notification / status check
  if (url.pathname === '/api/line/test' || url.pathname === '/api/testLine') {
    const token = env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
    const target = env.LINE_TARGET_ID || env.LINE_STAFF_USER_ID;
    if (!token || !target) {
      return json({
        ok: false,
        status: 'LINE_MESSAGING_NOT_CONFIGURED',
        message: 'ยังไม่ได้ตั้งค่า LINE_MESSAGING_CHANNEL_ACCESS_TOKEN หรือ LINE_TARGET_ID (ใช้ LIFF ได้ตามปกติ)',
        liff: {
          configured: true,
          liffId: env.LINE_LIFF_ID || '2012450964-nLKUtgQn',
          liffUrl: `https://liff.line.me/${env.LINE_LIFF_ID || '2012450964-nLKUtgQn'}`
        }
      });
    }
    const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const text = `🔔 [แจ้งเตือนระบบเวชระเบียน วพอ.]\nทดสอบการเชื่อมต่อ LINE Messaging API สำเร็จ เวลา ${nowStr} น.`;
    const lineRes = await sendLine(env, text);
    return json({ ok: lineRes.ok, result: lineRes });
  }

  // Hospital referral alert (Telegram + LINE)
  if (url.pathname === '/api/telegram/referral' || url.pathname === '/api/referral') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const data = await request.json();
      const text = formatReferralAlert(data);
      const tgRes = await sendTelegram(env, text);
      const lineRes = await sendLine(env, stripHtml(text));
      return json({ ok: tgRes.ok || lineRes.ok, result: tgRes, line: lineRes });
    } catch (err) {
      return json({ ok: false, error: err.message }, 400);
    }
  }

  // Pre-Triage student self-checkin alert (Telegram + LINE)
  if (url.pathname === '/api/telegram/triage' || url.pathname === '/api/pre-triage') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const data = await request.json();
      const text = formatTriageAlert(data);
      const tgRes = await sendTelegram(env, text);
      const lineRes = await sendLine(env, stripHtml(text));
      return json({ ok: tgRes.ok || lineRes.ok, result: tgRes, line: lineRes });
    } catch (err) {
      return json({ ok: false, error: err.message }, 400);
    }
  }

  // Proxy students API from GAS
  if (url.pathname === '/api/students') {
    if (!env.GAS_WEB_APP_URL) return json({ error: 'GAS_WEB_APP_URL not configured' }, 503);
    const gasUrl = new URL(env.GAS_WEB_APP_URL);
    gasUrl.searchParams.set('api', 'students');
    const gasRes = await fetch(gasUrl.toString(), { redirect: 'follow' });
    const data = await gasRes.json();
    return json(data);
  }

  // Proxy student photo endpoint with Cloudflare Edge Caching
  if (url.pathname.startsWith('/api/photo/')) {
    const fileId = url.pathname.slice('/api/photo/'.length).trim();
    if (!fileId || !/^[a-zA-Z0-9_-]{20,80}$/.test(fileId)) {
      return json({ error: 'Invalid file ID' }, 400);
    }
    const driveUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
    try {
      const driveRes = await fetch(driveUrl, { redirect: 'follow' });
      const contentType = driveRes.headers.get('content-type') || '';
      if (driveRes.ok && contentType.startsWith('image/')) {
        const respHeaders = new Headers();
        respHeaders.set('Content-Type', contentType);
        respHeaders.set('Cache-Control', 'public, max-age=604800, immutable');
        respHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(driveRes.body, { status: 200, headers: respHeaders });
      }
    } catch (e) {}
    return Response.redirect(`https://drive.google.com/thumbnail?id=${fileId}&sz=w400`, 302);
  }

  // RPC Bridge endpoint
  if (url.pathname !== '/api/rpc') return json({ error: 'Not found' }, 404);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('Origin') !== url.origin) return json({ error: 'Origin rejected' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
  if (!env.GAS_WEB_APP_URL || !env.GAS_BRIDGE_SECRET) return json({ error: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google' }, 503);
  try {
    const upstream = new URL(env.GAS_WEB_APP_URL);
    if (upstream.origin !== 'https://script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(upstream.pathname) || upstream.search) throw new Error('config');
    // Stream with a hard bound instead of trusting Content-Length.
    const reader = request.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 131072) { await reader.cancel(); return json({ error: 'คำขอมีขนาดใหญ่เกินไป' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let input;
    try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!methods.includes(input.method) || !Array.isArray(input.args) || input.args.length > 4) return json({ error: 'Unsupported method' }, 400);
    const payload = JSON.stringify({ method: input.method, args: input.args,
      idToken: studentMethods.includes(input.method) ? input.idToken : undefined });
    const timestamp = Date.now(); const nonce = crypto.randomUUID();
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.GAS_BRIDGE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}\n${nonce}\n${payload}`)))].map(x => x.toString(16).padStart(2, '0')).join('');
    const response = await fetch(upstream, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp, nonce, payload, signature }), redirect: 'follow', signal: AbortSignal.timeout(55000) });
    if (!response.ok) throw new Error('upstream');
    const result = await response.json();
    if (typeof result.ok !== 'boolean') throw new Error('protocol');
    return json(result, result.ok ? 200 : 400);
  } catch {
    return json({ error: 'เชื่อมต่อ Google ไม่สำเร็จ หากเพิ่งบันทึก กรุณาตรวจรายการก่อนลองซ้ำ' }, 502);
  }
}
export default { fetch: handleRequest };
