import { methods, studentMethods } from './methods.mjs';
const encoder = new TextEncoder();
const json = (data, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
} });

async function sendTelegram(env, text) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return { ok: false, error: 'Telegram bot token or chat ID not configured' };
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  return await res.json();
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
    return json({ ok: true, liffId: env.LINE_LIFF_ID || '2010948179-Ympqt2bT' });
  }

  // Telegram test notification
  if (url.pathname === '/api/telegram/test' || url.pathname === '/api/testTelegram') {
    const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const text = `🔔 <b>ทดสอบการเชื่อมต่อระบบแจ้งเตือน Telegram (Cloudflare Worker Edge)</b>\nระบบเวชระเบียนและบริบาลสุขภาพ นพอ. วิทยาลัยพยาบาลทหารอากาศ\nเวลา: ${nowStr} น.\nสถานะ: 🟢 เชื่อมต่อสำเร็จ 100%`;
    const tgRes = await sendTelegram(env, text);
    return json({ ok: tgRes.ok, result: tgRes });
  }

  // Hospital referral Telegram alert
  if (url.pathname === '/api/telegram/referral' || url.pathname === '/api/referral') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const data = await request.json();
      const text = formatReferralAlert(data);
      const tgRes = await sendTelegram(env, text);
      return json({ ok: tgRes.ok, result: tgRes });
    } catch (err) {
      return json({ ok: false, error: err.message }, 400);
    }
  }

  // Pre-Triage student self-checkin Telegram alert
  if (url.pathname === '/api/telegram/triage' || url.pathname === '/api/pre-triage') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const data = await request.json();
      const text = formatTriageAlert(data);
      const tgRes = await sendTelegram(env, text);
      return json({ ok: tgRes.ok, result: tgRes });
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
