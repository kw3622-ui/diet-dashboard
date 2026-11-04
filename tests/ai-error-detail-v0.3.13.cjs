// v0.3.13 AI 오류 전문 보기·서버 오류 기록 검사:
// node tests/ai-error-detail-v0.3.13.cjs [index_v0.3.13.html] [diet-ai_v0.0.17.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.3.13.html');
const serverFile = process.argv[3] || path.resolve(__dirname, '..', 'diet-ai_v0.0.17.ts');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };

// 화면 구조: v0.3.12의 처리 위에 원문 보관·보기·복사
const texts = [
  ['every temporary failure keeps the raw error', "showAiBusy(temporaryAiMessage(detail), detail, retry);"],
  ['slow requests explain the timeout', "showAiBusy(AI_SLOW_MESSAGE, AI_SLOW_DETAIL, handleGenerateHabitReport)"],
  ['slow period report', "showAiBusy(AI_SLOW_MESSAGE, AI_SLOW_DETAIL, handleGeneratePeriodReport)"],
  ['slow condition report', "showAiBusy(AI_SLOW_MESSAGE, AI_SLOW_DETAIL, handleGenerateConditionReport)"],
  ['slow daily report', "showAiBusy(AI_SLOW_MESSAGE, AI_SLOW_DETAIL, handleGenerateDailyReport)"],
  ['record save failure keeps the raw error', 'showAiBusy(`${temporaryAiMessage(detail)} 입력한 기록은 홈 맨 위 "저장되지 않은 기록"에 있어요.`, detail, null);'],
  ['detail toggle button', "{showAiDetail ? '오류 전문 닫기' : '오류 전문 보기'}"],
  ['detail shows time and raw text', 'data-ai-error-detail'],
  ['detail can be copied', 'navigator.clipboard.writeText(`[${aiBusy.at}]\\n${aiBusy.detail}`)'],
  ['copy failure has a fallback hint', '복사하지 못했어요. 위 글을 길게 눌러 복사해 주세요.'],
  ['retry still offered', "aiBusy.retry && ("],
];
for (const [name, text] of texts) { assert.ok(html.includes(text), name); pass(name); }
assert.equal((html.match(/setAiBusy\(\{/g) || []).length, 1, 'only showAiBusy sets the notice');
pass('the notice is always set through showAiBusy');

// 문구 구분
const a = html.indexOf('    function temporaryAiMessage(detail) {');
const b = html.indexOf('    // ★ v0.3.12 오류로 새로고침될 때', a);
const ctx = {};
vm.createContext(ctx);
new vm.Script(html.slice(a, b) + '\n;globalThis.m = temporaryAiMessage;').runInContext(ctx);
assert.match(ctx.m('AI 분석 실패: HTTP 429 {"error":{"status":"RESOURCE_EXHAUSTED"}}'), /무료 사용 한도/);
assert.match(ctx.m('AI 분석 실패: {"message":"You exceeded your current quota"}'), /무료 사용 한도/);
assert.match(ctx.m('Failed to fetch'), /인터넷 연결/);
assert.match(ctx.m('AI 분석 실패: HTTP 503 {"error":{"status":"UNAVAILABLE"}}'), /AI가 잠시 바빠요/);
assert.match(ctx.m('AI 응답 포맷 에러'), /AI가 잠시 바빠요/);
pass('quota, network and busy errors get their own wording');

// 서버: Gemini 오류에 HTTP 상태, 실패 요청은 action과 오류만 로그에
(async () => {
  const logged = [];
  let handler;
  const replies = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: () => {
      const q = { select: () => q, eq: () => q, single: async () => ({ data: { is_approved: true, is_admin: false, disease: '', ai_mode: 'normal' }, error: null }) };
      return q;
    },
  };
  const server = {
    console: { ...console, error: (...args) => logged.push(args.join(' ')) },
    Request, Response, setTimeout: (fn) => fn(),
    Deno: { env: { get: () => 'test-only' }, serve: (fn) => { handler = fn; } }, createClient: () => client,
    fetch: async () => { const r = replies.shift(); return new Response(r.body, { status: r.status }); },
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(fs.readFileSync(serverFile, 'utf8')).replace(/^import .*;$/gm, '') + '\n;globalThis.__call = callGemini;').runInContext(server);

  replies.push({ status: 429, body: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}' }, { status: 429, body: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}' });
  await assert.rejects(server.__call([], 'p', 'log'), /^Error: AI 분석 실패: HTTP 429 \{"error":\{"code":429,"status":"RESOURCE_EXHAUSTED"\}\}$/);
  replies.push({ status: 400, body: 'x'.repeat(3000) });
  await assert.rejects(server.__call([], 'p', 'log'), (e) => e.message.length < 1600);
  pass('Gemini errors carry the HTTP status and are trimmed');

  const res = await handler(new Request('https://example.invalid/diet-ai', {
    method: 'POST', headers: { Authorization: 'Bearer t' },
    body: JSON.stringify({ action: 'longTermQuestion', payload: { kind: 'nope', question: '내 비밀 질문' } }),
  }));
  assert.equal(res.status, 500);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^diet-ai failed \{"action":"longTermQuestion","error":"질문할 수 있는 분석이 아닙니다\."\}$/);
  assert.ok(!logged[0].includes('내 비밀 질문'), 'user text is not logged');
  pass('failed requests log only the action and the error text');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
