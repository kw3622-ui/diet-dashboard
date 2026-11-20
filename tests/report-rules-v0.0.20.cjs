// diet-ai v0.0.20 총평 규칙 검사: node tests/report-rules-v0.0.20.cjs [diet-ai_v0.0.20.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const serverFile = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.20.ts');
const src = fs.readFileSync(serverFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };

(async () => {
  const prompts = [];
  let reply = '{"grade":"A","comment":"좋아요"}';
  const server = {
    console, Response, setTimeout: (fn) => fn(),
    Deno: { env: { get: () => 'test-key' }, serve: () => {} }, createClient: () => ({}),
    fetch: async (url, init) => {
      prompts.push(JSON.parse(init.body).contents[0].parts[0].text);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] } }] }), { status: 200 });
    },
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(src).replace(/^import .*;$/gm, '') +
    '\n;Object.assign(globalThis, { getIntakeReportRules, handleDailyReport, handlePeriodReport });').runInContext(server);

  const rules = server.getIntakeReportRules();
  for (const t of [
    '식사·간식 횟수로 세지 마세요', '꾸준히 챙긴 사실은 짧게 언급해도 됩니다',
    '의학적으로 확립된 것만 한 문장으로, 단정하지 않게', '효소, 노니 등', '등급의 근거로 삼지 마세요',
    "'[등록한 약 복용]' 줄은 약 이름 없이", '약·복용법·약과 음식의 관계에 대한 조언은 절대 하지 마세요', '나무라지 말고',
  ]) assert.ok(rules.includes(t), t);
  pass('one rule for supplements and medicine counts');

  const sb = new Proxy({}, { get: (t, p) => p === 'then' ? undefined : (p === 'from' ? () => chain : undefined) });
  const chain = new Proxy({}, { get: (t, p) => p === 'then' ? (res) => res({ data: [], error: null }) : (p === 'single' || p === 'maybeSingle' ? async () => ({ data: null, error: null }) : () => chain) });
  await server.handleDailyReport(sb, 'u', { date: '2026-11-20', summaryData: '[08:00] [건강식품] 오메가3 2알\n[등록한 약 복용] 이날 먹을 2회 중 2회 체크' });
  assert.ok(prompts[0].includes('[건강식품·약 다루는 규칙]') && prompts[0].includes('[등록한 약 복용] 이날 먹을 2회 중 2회 체크'));
  assert.ok(!prompts[0].includes('효능을 평가하거나 등급의 근거로 삼지 마세요.\\n') && !src.includes("먹은 사실만 참고하며 효능을 평가하거나"), 'old daily rule replaced');
  pass('daily report prompt carries the rule');

  reply = '## 요약\n좋아요';
  try { await server.handlePeriodReport(sb, 'u', { periodStart: '2026-11-16', summaryData: 'x', isMonth: false }); } catch (e) { /* 저장 단계 오류는 무시: 프롬프트만 본다 */ }
  const periodPrompt = prompts.find(p => p.includes('[🚨 리포트 디자인 양식'));
  assert.ok(periodPrompt && periodPrompt.includes('[건강식품·약 다루는 규칙]'), 'period report prompt carries the rule');
  pass('period report prompt carries the rule');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
