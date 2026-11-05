// diet-ai v0.0.18 대체 모델 검사: node tests/model-fallback-v0.0.18.cjs [diet-ai_v0.0.18.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const serverFile = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.18.ts');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };

(async () => {
  const calls = [];
  const logs = [];
  let replies = [];
  const server = {
    console: { ...console, log: (...a) => logs.push(a.join(' ')) }, Response, setTimeout: (fn) => fn(),
    Deno: { env: { get: () => 'test-key' }, serve: () => {} }, createClient: () => ({}),
    fetch: async (url) => {
      calls.push(String(url).match(/models\/([^:]+):/)[1]);
      const next = replies.shift();
      if (next === 'throw') throw new TypeError('Failed to fetch');
      return new Response(next.body, { status: next.status });
    },
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(fs.readFileSync(serverFile, 'utf8')).replace(/^import .*;$/gm, '') + '\n;globalThis.__call = callGemini;').runInContext(server);
  const ok = (name) => ({ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ foodName: name }) }] } }] }) });
  const busy = { status: 503, body: '{"error":{"code":503,"status":"UNAVAILABLE"}}' };
  const run = async (list) => {
    calls.length = 0; logs.length = 0; replies = list;
    try { return { value: await server.__call([], 'p', 'log') }; } catch (e) { return { error: e.message }; }
  };

  let r = await run([ok('main')]);
  assert.equal(r.value.foodName, 'main');
  assert.deepEqual(calls, ['gemini-3.1-flash-lite']);
  assert.equal(logs.length, 0);
  pass('normal requests use only gemini-3.1-flash-lite');

  r = await run([busy, ok('main-retry')]);
  assert.equal(r.value.foodName, 'main-retry');
  assert.deepEqual(calls, ['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite']);
  pass('one busy reply is still solved by the retry on the same model');

  r = await run([busy, busy, ok('fallback')]);
  assert.equal(r.value.foodName, 'fallback');
  assert.deepEqual(calls, ['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^diet-ai fallback \{"from":"gemini-3.1-flash-lite","to":"gemini-2.5-flash-lite","status":503\}$/);
  pass('two busy replies go once to gemini-2.5-flash-lite and the switch is logged');

  r = await run([{ status: 429, body: 'quota' }, { status: 429, body: 'quota' }, ok('fallback')]);
  assert.equal(r.value.foodName, 'fallback');
  assert.equal(calls[2], 'gemini-2.5-flash-lite');
  r = await run(['throw', { status: 504, body: 'timeout' }, ok('fallback')]);
  assert.equal(r.value.foodName, 'fallback');
  pass('quota and gateway errors also fall back');

  r = await run([busy, busy, { status: 503, body: 'fallback busy too' }]);
  assert.match(r.error, /^AI 분석 실패: HTTP 503 fallback busy too$/);
  assert.equal(calls.length, 3);
  pass('if the fallback also fails, the error is reported after three tries in total');

  r = await run([{ status: 400, body: 'bad request' }]);
  assert.match(r.error, /HTTP 400 bad request/);
  assert.deepEqual(calls, ['gemini-3.1-flash-lite']);
  pass('request errors (400) are not retried or sent to the fallback');

  const src = fs.readFileSync(serverFile, 'utf8');
  assert.ok(!/models\/gemini-3\.1-flash-lite:generateContent/.test(src), 'model names come from the constants only');
  pass('model names are defined once');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
