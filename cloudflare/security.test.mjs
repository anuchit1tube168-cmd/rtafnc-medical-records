import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import { handleRequest } from './worker.mjs';

const secret = 'test-only-bridge-key-not-for-production';
function harness() {
  const properties = { GAS_BRIDGE_SECRET: secret };
  const ctx = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => properties[k], getProperties: () => ({ ...properties }), setProperty: (k,v) => { properties[k]=v; }, deleteProperty: k => { delete properties[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { Charset: { UTF_8: 'UTF-8' }, computeHmacSha256Signature: (text,key) => [...createHmac('sha256',key).update(text).digest()] },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    PUBLIC_METHODS_: ['isDemoEnabled'], STUDENT_METHODS_: [],
    Backend_: { isDemoEnabled: () => false, validateSession: () => { throw Error('กรุณาเข้าสู่ระบบใหม่'); }, saveVisit: () => { throw Error('must not run'); } }
  });
  vm.runInContext(fs.readFileSync('cloudflare/google-bridge.js', 'utf8'),ctx);
  return ctx;
}
function envelope(method = 'isDemoEnabled', args = []) {
  const e = { timestamp: Date.now(), nonce: crypto.randomUUID(), payload: JSON.stringify({ method, args }) };
  e.signature = createHmac('sha256',secret).update(`${e.timestamp}\n${e.nonce}\n${e.payload}`).digest('hex');
  return e;
}
test('signed request accepted once; replay, tampering and stale signatures rejected', () => {
  const ctx = harness(); const e = envelope();
  assert.equal(ctx.doPost({ postData: { contents: JSON.stringify(e) } }).ok, true);
  assert.equal(ctx.doPost({ postData: { contents: JSON.stringify(e) } }).ok, false);
  assert.throws(() => ctx.verifyEnvelope_({ ...envelope(), payload: '{}' }));
  assert.throws(() => ctx.verifyEnvelope_({ ...envelope(), timestamp: Date.now() - 120000 }));
});
test('unsigned imports and unknown helpers cannot reach backend', () => {
  const ctx = harness();
  for (const e of [{ action: 'importHealthData', students: [] }, envelope('getSpreadsheet'), envelope('validateSession'), envelope('saveVisit', ['SES-ADMIN-forged', {}])]) {
    assert.equal(ctx.doPost({ postData: { contents: JSON.stringify(e) } }).ok, false);
  }
});
test('forged admin session fails before reading database', () => {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync('cloudflare/google-overrides.js', 'utf8'),ctx);
  assert.throws(() => ctx.validateSession('SES-ADMIN-anything'), /กรุณา/);
  assert.throws(() => ctx.validateSession('containsADMIN'), /กรุณา/);
});
test('formula/markup write payload rejected', () => {
  const ctx = harness();
  assert.throws(() => ctx.validateWriteInput_({ Name: '=IMPORTXML("url")' }));
  assert.throws(() => ctx.validateWriteInput_({ Name: '<img src=x onerror=alert(1)>' }));
  assert.doesNotThrow(() => ctx.validateWriteInput_({ Name: 'นักเรียน', Value: -1 }));
});
test('Workers rejects foreign origins, methods and missing configuration', async () => {
  const request = (origin, body = {}) => new Request('https://health.example/api/rpc', { method:'POST', headers:{ Origin: origin, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
  assert.equal((await handleRequest(request('https://evil.example'), {})).status,403);
  assert.equal((await handleRequest(new Request('https://health.example/api/rpc'), {})).status,405);
  assert.equal((await handleRequest(request('https://health.example'), {})).status,503);
  const env = { GAS_WEB_APP_URL:'https://script.google.com/macros/s/test/exec', GAS_BRIDGE_SECRET:secret };
  assert.equal((await handleRequest(request('https://health.example', { method:'getSpreadsheet', args:[] }), env)).status,400);
});
test('generated bundle exposes only bridge endpoints, not legacy RPC globals', () => {
  const ctx = vm.createContext({ PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) }, SpreadsheetApp: { getActiveSpreadsheet: () => null } });
  vm.runInContext(fs.readFileSync('dist/google/Backend.gs','utf8'),ctx);
  assert.equal(typeof ctx.doPost, 'function');
  assert.equal(ctx.getSpreadsheet, undefined);
  assert.equal(ctx.loginUser, undefined);
  assert.equal(ctx.setupSystem, undefined);
  assert.equal(ctx.lookupStudentByStudentId, undefined);
});

test('generated bundle drops legacy admin password bypass and sample seeding', () => {
  const code = fs.readFileSync('dist/google/Backend.gs','utf8');
  assert.equal(/admin1234|password === "1234"/.test(code), false);
  assert.equal(code.includes('function ensureSampleStudentsExist() { return; }'), true);
  assert.equal(/REVIEW|ศุภัสสรา/.test(code), false);
});
