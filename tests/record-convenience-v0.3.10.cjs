// v0.3.10 최근 아침 불러오기·기록 복사·입력 보존·Gemini 재시도 검사:
// node tests/record-convenience-v0.3.10.cjs [index_v0.3.10.html] [diet-ai_v0.0.15.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.3.10.html');
const serverFile = process.argv[3] || path.resolve(__dirname, '..', 'diet-ai_v0.0.15.ts');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));

const checks = [
  ['copy button on record cards except biometrics', /log\.category !== '생체기록' && \(\s*<button onClick=\{\(\) => handleCopyClick\(log\)\}/],
  ['copy opens a new entry dated today now', /naturalText: getCopyText\(log\)[\s\S]{0,200}editDate: formatDate\(new Date\(\)\), editTime: getCurrentTimeStr\(\)/],
  ['recent breakfasts only for a missing breakfast', /slot\.key === 'breakfast' && status === 'missing' && recentBreakfasts\.length > 0/],
  ['recent breakfasts look back 14 days before the viewed date', /since\.setDate\(since\.getDate\(\) - 14\)[\s\S]{0,300}\.eq\('category', '아침식사'\)\.gte\('log_date', formatDate\(since\)\)\.lt\('log_date', date\)/],
  ['choosing a breakfast opens the meal draft prefilled', /openMealDraft\(slot, choice\.text\)/],
  ['entry is kept before sending', /savePendingEntry\(entry\);\s*setPendingEntry\(null\);/],
  ['kept entry cleared right after the server saved (analyze)', /callAI\('analyze', payload, controller\.signal\);\s*clearTimeout\(timeoutId\);\s*clearPendingEntry\(\);/],
  ['kept entry cleared right after the server saved (reanalyze)', /callAI\('reanalyze', \{ id: editId, \.\.\.payload \}, controller\.signal\);\s*clearTimeout\(timeoutId\);\s*clearPendingEntry\(\);/],
  ['failure shows the kept entry again', /clearTimeout\(timeoutId\);\s*setPendingEntry\(readPendingEntry\(entry\.userId\)\);/],
  ['kept entry loaded per signed-in user', /setPendingEntry\(session \? readPendingEntry\(session\.user\?\.id\) : null\)/],
  ['pending banner with retry / edit / discard', /data-pending-entry[\s\S]{0,1500}onClick=\{retryPendingEntry\}[\s\S]{0,300}onClick=\{restorePendingEntry\}[\s\S]{0,300}onClick=\{discardPendingEntry\}/],
];
for (const [name, re] of checks) { assert.match(html, re, name); pass(name); }

// 화면 함수 실행
const grab = (startText, endText) => {
  const a = html.indexOf(startText), b = html.indexOf(endText, a);
  assert.ok(a > 0 && b > a, startText);
  return html.slice(a, b);
};
const store = new Map();
const ui = { localStorage: {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { if (v.length > 2000) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
  removeItem: k => store.delete(k),
} };
vm.createContext(ui);
new vm.Script(
  html.match(/const formatDate = [^\n]*\n/)[0] +
  html.match(/const parseDate = \(dateStr\) => \{[\s\S]*?\n    \};\n/)[0] +
  grab('    function getCopyText(log) {', '    function MealRecordSummary') +
  '\n;Object.assign(globalThis, { getCopyText, buildRecentMealChoices, savePendingEntry, readPendingEntry, clearPendingEntry, PENDING_ENTRY_KEY });'
).runInContext(ui);

{
  const textLog = { rawInput: JSON.stringify({ type: 'text', naturalText: '현미밥 반 공기, 계란 2개', memo: '' }) };
  assert.equal(ui.getCopyText(textLog), '현미밥 반 공기, 계란 2개');
  const photoLog = { rawInput: JSON.stringify({ type: 'image', memo: '반만 먹음' }), ingredients: ['김밥(밥, 김)', '라면(면)'], foodName: '분식' };
  assert.equal(ui.getCopyText(photoLog), '김밥, 라면 (반만 먹음)');
  assert.equal(ui.getCopyText({ rawInput: '{}', ingredients: [], foodName: '토스트' }), '토스트');
  pass('copy text uses the original words, photos become a food list');
}
{
  const log = (date, time, text) => ({ date, time, rawInput: JSON.stringify({ type: 'text', naturalText: text }) });
  const choices = plain(ui.buildRecentMealChoices([
    log('2026-11-03', '07:30', '현미밥, 계란 2개'),
    log('2026-11-02', '08:10', '두유'), log('2026-11-02', '07:20', '현미밥, 계란 2개'),
    log('2026-11-01', '07:00', '현미밥,  계란 2개, 두유'),
    log('2026-10-30', '07:00', '토스트'),
    log('2026-10-28', '07:00', '시리얼'),
    log('2026-11-04', '07:00', '오늘 기록은 제외'),
  ], '2026-11-04'));
  assert.deepEqual(choices.map(c => [c.label, c.text]), [
    ['어제', '현미밥, 계란 2개'],
    ['그저께', '현미밥, 계란 2개, 두유'],
    ['10/30', '토스트'],
  ]);
  assert.deepEqual(plain(ui.buildRecentMealChoices([], '2026-11-04')), []);
  pass('recent choices: same day merged in time order, duplicates folded, newest 3, today excluded');
}
{
  const entry = { userId: 'u1', payload: { type: 'image', naturalText: '', memo: '점심', base64Images: ['x'.repeat(3000)] }, isEdit: false };
  ui.savePendingEntry(entry);
  const kept = plain(ui.readPendingEntry('u1'));
  assert.equal(kept.photosDropped, true);
  assert.deepEqual(kept.payload.base64Images, []);
  assert.equal(kept.payload.memo, '점심');
  assert.equal(ui.readPendingEntry('someone-else'), null);
  ui.savePendingEntry({ userId: 'u1', payload: { type: 'text', naturalText: '두유' } });
  assert.equal(ui.readPendingEntry('u1').photosDropped, undefined);
  ui.clearPendingEntry();
  assert.equal(ui.readPendingEntry('u1'), null);
  store.set(ui.PENDING_ENTRY_KEY, '{broken');
  assert.equal(ui.readPendingEntry('u1'), null);
  pass('kept entry: per user, photos dropped only when too big, broken data ignored');
}

// 서버: Gemini 재시도
(async () => {
  const calls = [];
  let replies = [];
  const server = {
    console, Response, setTimeout: (fn) => fn(),
    Deno: { env: { get: () => 'test-only' }, serve: () => {} }, createClient: () => ({}),
    fetch: async () => {
      calls.push(1);
      const next = replies.shift();
      if (next === 'throw') throw new TypeError('network');
      return new Response(next.body, { status: next.status });
    },
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(fs.readFileSync(serverFile, 'utf8')).replace(/^import .*;$/gm, '') + '\n;globalThis.__call = callGemini;').runInContext(server);
  const ok = { status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"foodName":"ok"}' }] } }] }) };
  const run = async (list) => { calls.length = 0; replies = list; try { return { value: await server.__call([], 'p', 'log') }; } catch (e) { return { error: e.message }; } };

  let r = await run([{ status: 503, body: 'busy' }, ok]);
  assert.equal(r.value.foodName, 'ok'); assert.equal(calls.length, 2);
  r = await run([{ status: 429, body: 'rate' }, ok]);
  assert.equal(r.value.foodName, 'ok'); assert.equal(calls.length, 2);
  r = await run(['throw', ok]);
  assert.equal(r.value.foodName, 'ok'); assert.equal(calls.length, 2);
  pass('busy, rate-limit and network errors are retried once and then succeed');

  r = await run([{ status: 503, body: 'busy1' }, { status: 503, body: 'busy2' }, ok]);
  assert.match(r.error, /AI 분석 실패: busy2/); assert.equal(calls.length, 2);
  r = await run([{ status: 400, body: 'bad request' }, ok]);
  assert.match(r.error, /bad request/); assert.equal(calls.length, 1);
  r = await run([ok]);
  assert.equal(calls.length, 1);
  pass('at most two attempts; other errors and successes are not retried');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
