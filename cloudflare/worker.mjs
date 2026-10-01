import { methods, studentMethods } from './methods.mjs';
const encoder = new TextEncoder();
const json = (data, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
} });

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    return new Response(response.body, { status: response.status, headers });
  }
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
