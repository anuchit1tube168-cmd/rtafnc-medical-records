addEventListener('fetch', e => e.respondWith(handle(e.request)));

const DEMO = [
  { id: 'DEMO-001', name: 'นพอ.ตัวอย่าง ก', year: 1, dx: 'ข้อเท้าพลิก', status: 'FOLLOW_UP' },
  { id: 'DEMO-002', name: 'นพอ.ตัวอย่าง ข', year: 4, dx: 'อาหารเป็นพิษ', status: 'WAITING_DOCTOR' }
];

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

function extract(line, key) {
  const re = new RegExp('^\\s*' + key + '\\s*[:：]?\\s*', 'i');
  return re.test(line) ? line.replace(re, '').trim() : null;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10
    ? digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6)
    : digits;
}

function parseCase(text, year) {
  const out = {
    year,
    name: '',
    nick: '',
    phone: '',
    symptom: '',
    ps: null,
    dx: '',
    treat: [],
    warnings: []
  };

  let treatmentMode = false;
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for (const raw of lines) {
    const line = raw.replace(/^[-•·]+\s*/, '').trim();
    let v;
    if ((v = extract(line, 'ชื่อ-สกุล')) !== null || (v = extract(line, 'ชื่อ')) !== null) {
      out.name = v;
      treatmentMode = false;
      continue;
    }
    if ((v = extract(line, 'ชื่อเล่น')) !== null) {
      out.nick = v;
      continue;
    }
    if ((v = extract(line, 'เบอร์โทรศัพท์')) !== null || (v = extract(line, 'เบอร์โทร')) !== null) {
      out.phone = normalizePhone(v);
      continue;
    }
    if ((v = extract(line, 'อาการปัจจุบัน')) !== null ||
        (v = extract(line, 'อาการปัจจุบ้น')) !== null ||
        (v = extract(line, 'อาการสำคัญ')) !== null) {
      out.symptom = v;
      const ps = v.match(/(?:ps|pain\s*score)\s*=\s*(\d+)/i);
      if (ps) out.ps = Number(ps[1]);
      continue;
    }
    if ((v = extract(line, 'วินิจฉัย')) !== null) {
      out.dx = v;
      continue;
    }
    if (/^(ยาที่ได้รับ|การรักษา)\s*[:：]?/i.test(line)) {
      treatmentMode = true;
      const after = line.replace(/^(ยาที่ได้รับ|การรักษา)\s*[:：]?\s*/i, '');
      if (after) out.treat.push(after);
      continue;
    }
    if (treatmentMode) out.treat.push(line.replace(/^\d+\.\s*/, ''));
  }

  if (!out.name) out.warnings.push('ไม่พบชื่อ');
  if (!out.dx) out.warnings.push('ยังไม่มีวินิจฉัย');
  return out;
}

function parseReport(raw) {
  const text = String(raw || '').trim();
  const reports = text.split(/(?=ขออนุญาตรายงานอาการป่วย)/g).filter(Boolean);
  const cases = [];

  for (const report of reports) {
    const y = (report.match(/ชั้นปีที่\s*(\d)/) || [])[1];
    report
      .split(/(?=😷)/g)
      .filter(x => /ชื่อ(?:-สกุล)?\s*[:：]/.test(x))
      .forEach(x => cases.push(parseCase(x.replace(/^😷\s*/, ''), y ? Number(y) : null)));
  }

  if (!cases.length) {
    const y = (text.match(/ชั้นปีที่\s*(\d)/) || [])[1];
    text
      .split(/(?=😷)/g)
      .filter(x => /ชื่อ(?:-สกุล)?\s*[:：]/.test(x))
      .forEach(x => cases.push(parseCase(x.replace(/^😷\s*/, ''), y ? Number(y) : null)));
  }

  return { cases };
}

function renderPlan(cases) {
  const grouped = {};
  for (const item of cases) {
    const year = item.year || '?';
    (grouped[year] || (grouped[year] = [])).push(item);
  }

  return Object.keys(grouped).map(year => ({
    year,
    count: grouped[year].length,
    template: 'HEALTH-FREESTYLE-Y' + year + '-' + Math.min(grouped[year].length, 4) + 'P-v1.0',
    photoPolicy: 'REAL_DRIVE_DICUT_ONLY',
    approvalRequired: true,
    productionWrite: false
  }));
}

const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RTAFNC Health Ops</title>
<style>
:root{--navy:#0e3b67;--blue:#1687c9;--pink:#ef518b;--bg:#f4f8fb;--ink:#17324d}*{box-sizing:border-box}body{margin:0;font-family:system-ui,"Noto Sans Thai",sans-serif;background:var(--bg);color:var(--ink)}.app{display:grid;grid-template-columns:230px 1fr;min-height:100vh}.side{background:linear-gradient(#0b3158,#0e4f81);color:#fff;padding:22px}.brand{font-size:19px;font-weight:900;margin-bottom:24px}.brand small{display:block;font-weight:400;opacity:.75}.side button{width:100%;border:0;background:transparent;color:#dcebf6;text-align:left;padding:12px;border-radius:12px;margin:4px 0}.side button.on{background:#ffffff1c}.env{font-size:12px;margin-top:26px;padding:12px;border:1px solid #ffffff2a;border-radius:12px}.main{padding:26px}.top{display:flex;justify-content:space-between;align-items:center}.muted{color:#70879a}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.card,.panel{background:#fff;border:1px solid #e4edf3;border-radius:20px;padding:18px;box-shadow:0 12px 35px #194c7012}.n{font-size:32px;font-weight:900}.btn{border:0;border-radius:13px;padding:11px 15px;font-weight:800;cursor:pointer}.primary{background:linear-gradient(135deg,var(--blue),#22a4dc);color:#fff}.pink{background:linear-gradient(135deg,var(--pink),#f27bb0);color:#fff}.tabs{display:flex;gap:8px;margin-bottom:14px}.tabs button{background:#fff;border:1px solid #d8e4ec;padding:9px 12px;border-radius:12px}.tabs button.on{background:#dff2fc}.page{display:none}.page.on{display:block}textarea{width:100%;min-height:250px;border:1px solid #cadce7;border-radius:16px;padding:14px;font:inherit}.note{background:#fff4f8;border-left:4px solid var(--pink);padding:12px;border-radius:12px;margin:10px 0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.case{border:1px solid #e2ebf1;border-radius:16px;padding:14px}.chip{display:inline-block;background:#eaf5fb;color:#166c9d;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800}.plan{margin-top:10px;padding:12px;border-radius:14px;background:#f1f9fd;border:1px solid #d5ebf6}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #edf2f5;text-align:left}@media(max-width:900px){.app{grid-template-columns:1fr}.side{display:none}.cards{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.main{padding:16px}}</style>
</head><body><div class="app"><aside class="side"><div class="brand">RTAFNC Health Ops<small>Student Health Command Center</small></div><button class="nav on" data-page="dash">🏥 ภาพรวม</button><button class="nav" data-page="gen">✨ Gen Infographic</button><button class="nav" data-page="events">📋 เคสสุขภาพ</button><button class="nav" data-page="sys">🛡️ System Health</button><div class="env">STAGING<br>Production write: OFF<br>AI person generation: BLOCKED</div></aside><main class="main"><div class="tabs"><button class="nav on" data-page="dash">ภาพรวม</button><button class="nav" data-page="gen">Gen Info</button><button class="nav" data-page="events">เคส</button><button class="nav" data-page="sys">ระบบ</button></div>
<section id="dash" class="page on"><div class="top"><div><h1>Today Command Center</h1><div class="muted">สุขภาพนักเรียนพยาบาลทหารอากาศ</div></div><button class="btn primary" onclick="go('gen')">+ Gen Infographic</button></div><div class="cards"><div class="card"><div class="muted">ผู้ป่วยวันนี้</div><div class="n">2</div></div><div class="card"><div class="muted">ส่ง รพ./รอแพทย์</div><div class="n">1</div></div><div class="card"><div class="muted">Follow-up</div><div class="n">1</div></div><div class="card"><div class="muted">รออนุมัติ INFO</div><div class="n">1</div></div></div><div class="panel"><h2>เคสล่าสุด</h2><table><thead><tr><th>นักเรียน</th><th>ปี</th><th>วินิจฉัย</th><th>สถานะ</th></tr></thead><tbody id="rows"></tbody></table></div></section>
<section id="gen" class="page"><h1>Paste → Parse → Match → Draft</h1><div class="panel"><div class="note"><b>Real Photo Lock:</b> ใช้รูปจริงจาก Google Drive แบบ DICUT non-generative เท่านั้น ห้าม AI สร้าง/แก้ใบหน้าและชุด</div><textarea id="raw" placeholder="วางข้อความรายงานอาการป่วย..."></textarea><p><button class="btn primary" id="parse">Parse รายงาน</button></p></div><div id="result"></div></section>
<section id="events" class="page"><h1>เคสสุขภาพ</h1><div class="panel"><table><thead><tr><th>ID</th><th>นักเรียน</th><th>ปี</th><th>Dx</th><th>สถานะ</th></tr></thead><tbody id="all"></tbody></table></div></section>
<section id="sys" class="page"><h1>System Health</h1><div class="cards"><div class="card"><div class="muted">API</div><div class="n" style="color:#1c9873">OK</div></div><div class="card"><div class="muted">Google DB</div><div class="n">READY</div></div><div class="card"><div class="muted">Renderer</div><div class="n">DRAFT</div></div><div class="card"><div class="muted">Production Write</div><div class="n" style="color:#d64b60">OFF</div></div></div><div class="panel"><div class="plan">✅ แยกชั้นปีเป็นคนละ INFO</div><div class="plan">✅ Auto Draft / Admin Approve</div><div class="plan">✅ REAL_DRIVE_DICUT_ONLY</div><div class="plan">✅ PARSE_FAILED / PHOTO_FAILED / RENDER_FAILED พร้อม Retry</div></div></section></main></div>
<script>
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function go(id){$$('.page').forEach(x=>x.classList.toggle('on',x.id===id));$$('.nav').forEach(x=>x.classList.toggle('on',x.dataset.page===id))}window.go=go;$$('.nav').forEach(b=>b.onclick=()=>go(b.dataset.page));
async function load(){const data=await fetch('/api/events').then(r=>r.json());$('#rows').innerHTML=data.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.year+'</td><td>'+esc(x.dx)+'</td><td><span class="chip">'+esc(x.status)+'</span></td></tr>').join('');$('#all').innerHTML=data.map(x=>'<tr><td>'+esc(x.id)+'</td><td>'+esc(x.name)+'</td><td>'+x.year+'</td><td>'+esc(x.dx)+'</td><td>'+esc(x.status)+'</td></tr>').join('')}load();
$('#parse').onclick=async()=>{const raw=$('#raw').value;if(!raw)return;const data=await fetch('/api/parse',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rawText:raw})}).then(r=>r.json());const cards=data.cases.map((c,i)=>'<div class="case"><span class="chip">ปี '+esc(c.year||'?')+'</span><h3>'+(i+1)+'. '+esc(c.name||'ไม่พบชื่อ')+'</h3><div>อาการ: '+esc(c.symptom||'-')+'</div><div>PS: '+esc(c.ps??'-')+' · Dx: '+esc(c.dx||'รอตรวจ')+'</div><div>รักษา: '+esc(c.treat.join(' / ')||'-')+'</div></div>').join('');$('#result').innerHTML='<div class="panel"><h2>ผล Parse</h2><div class="grid">'+cards+'</div><p><button class="btn pink" id="plan">สร้าง Draft แยกชั้นปี</button></p><div id="plans"></div></div>';$('#plan').onclick=async()=>{const plans=await fetch('/api/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json());$('#plans').innerHTML=plans.map(x=>'<div class="plan"><b>ชั้นปีที่ '+esc(x.year)+'</b> · '+x.count+' คน · '+esc(x.template)+'<br><small>'+esc(x.photoPolicy)+' · Admin approval required</small></div>').join('')}};
</script></body></html>`;

async function handle(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/meta') return json({ service: 'rtafnc-health-ops-staging', mode: 'STAGING', productionWrite: false, aiPersonGeneration: false });
  if (url.pathname === '/api/events') return json(DEMO);
  if (url.pathname === '/api/parse' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (typeof body.rawText !== 'string' || body.rawText.length > 100000) return json({ error: 'invalid' }, 400);
    return json(parseReport(body.rawText));
  }
  if (url.pathname === '/api/plan' && request.method === 'POST') {
    const body = await request.json().catch(() => ({ cases: [] }));
    return json(renderPlan(body.cases || []));
  }
  if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    }
  });
}
