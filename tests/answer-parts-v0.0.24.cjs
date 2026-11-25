// diet-ai v0.0.24 나눠 온 답 잇기 검사: node tests/answer-parts-v0.0.24.cjs [diet-ai_v0.0.24.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const serverFile = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.24.ts');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };

(async () => {
  const logs = [];
  let reply = null;
  const server = {
    console: { ...console, log: (...a) => logs.push(a.join(' ')) }, Response, setTimeout: (fn) => fn(),
    Deno: { env: { get: () => 'test-key' }, serve: () => {} }, createClient: () => ({}),
    fetch: async () => new Response(JSON.stringify(reply), { status: 200 }),
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(fs.readFileSync(serverFile, 'utf8')).replace(/^import .*;$/gm, '') +
    '\n;globalThis.__call = callGemini; globalThis.__text = geminiAnswerText;').runInContext(server);
  const run = async (parts, type, finishReason = 'STOP') => {
    logs.length = 0;
    reply = { candidates: [{ content: { parts }, finishReason }] };
    return server.__call([], 'p', type);
  };

  // 1. 글 조각을 모두 잇는다(생각 조각은 뺀다)
  const text = await run([{ text: '회사에서' }, { text: ' 짬을 내어 오셨네요.' }, { text: ' 오늘은 등이에요.' }], 'report');
  assert.equal(text, '회사에서 짬을 내어 오셨네요. 오늘은 등이에요.');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^diet-ai answer \{"finish":"STOP","parts":3,"chars":\d+\}$/);
  const thought = await run([{ text: '사용자가 피곤해 보인다', thought: true }, { text: '오늘은 가볍게 해요.' }], 'report');
  assert.equal(thought, '오늘은 가볍게 해요.');
  pass('report answers join every text part in order, without thought parts, and log only counts');

  // 2. JSON 답이 쪼개져 와도 읽는다(기존 기록 분석 등)
  const json = await run([{ text: '{"foodName": "비빔' }, { text: '밥", "ingredients": ["밥"]}' }], 'log');
  assert.deepEqual(JSON.parse(JSON.stringify(json)), { foodName: '비빔밥', ingredients: ['밥'] });
  pass('JSON answers split across parts are parsed');

  // 3. 한 조각, 정상 종료면 로그 없음 / 끝난 이유가 이상하면 로그
  await run([{ text: '하나' }], 'report');
  assert.equal(logs.length, 0);
  await run([{ text: '잘린' }], 'report', 'MAX_TOKENS');
  assert.match(logs[0], /"finish":"MAX_TOKENS","parts":1/);
  pass('single normal answers are not logged; unusual finish reasons are');

  // 4. 빈 답은 오류
  await assert.rejects(() => run([{ text: 'x', thought: true }], 'report'), /AI 응답이 비어있습니다/);
  await assert.rejects(() => run([], 'report'), /AI 응답이 비어있습니다/);
  pass('only-thought or empty answers fail clearly');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
