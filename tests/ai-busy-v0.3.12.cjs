// v0.3.12 AI 일시 오류 안내·화면 복원 검사: node tests/ai-busy-v0.3.12.cjs [index_v0.3.12.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.3.12.html');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };

// 모든 AI 요청은 일시 오류를 새로고침 대신 안내로 처리한다.
const aiHandlers = [
  ['habit report', "handleAiFailure(err, handleGenerateHabitReport)"],
  ['period report', "handleAiFailure(err, handleGeneratePeriodReport)"],
  ['condition report', "handleAiFailure(err, handleGenerateConditionReport)"],
  ['daily report', "handleAiFailure(err, handleGenerateDailyReport)"],
  ['record followup keeps the question', "handleAiFailure(err, () => handleAskFollowup(logId))"],
  ['portion answer', "handleAiFailure(err, () => handleAnswerPortion(logId, share))"],
  ['long-term question keeps the question', "handleAiFailure(err, () => handleAskLongTerm(kind, reportId))"],
  ['exercise classification', "handleAiFailure(err, handleClassifyExercises)"],
  ['slow habit report', "setAiBusy({ message: AI_SLOW_MESSAGE, retry: handleGenerateHabitReport })"],
  ['slow period report', "setAiBusy({ message: AI_SLOW_MESSAGE, retry: handleGeneratePeriodReport })"],
  ['slow condition report', "setAiBusy({ message: AI_SLOW_MESSAGE, retry: handleGenerateConditionReport })"],
  ['slow daily report', "setAiBusy({ message: AI_SLOW_MESSAGE, retry: handleGenerateDailyReport })"],
  ['record save points to the kept entry', 'if (isTemporaryAiError(err)) {\n              setAiBusy({ message: \'AI가 잠시 바빠 저장하지 못했어요.'],
  ['view state saved right before reload', 'sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify({\n              activeTab, currentDate, statsMode, longTermDrafts, followupDraft, openFollowupId, savedAt: Date.now(),'],
  ['initial tab and date come from the saved view', "useState(restoredView?.activeTab || 'home')"],
  ['initial week/month comes from the saved view', "useState(restoredView?.statsMode || 'week')"],
  ['question drafts restored', "useState(restoredView?.longTermDrafts || {})"],
  ['busy notice with retry and close', 'data-ai-busy'],
];
for (const [name, text] of aiHandlers) { assert.ok(html.includes(text), name); pass(name); }

// AI 요청 뒤에 바로 새로고침하는 곳이 남아 있지 않다.
for (const call of ['habitReport', 'periodReport', 'conditionReport', 'dailyReport', 'followupQuestion', 'answerPortion', 'longTermQuestion', 'classifyExercises']) {
  const i = html.indexOf(`callAI('${call}'`);
  assert.ok(i > 0, call);
  const after = html.slice(i, i + 900);
  const catchPart = after.slice(after.indexOf('catch (err)'), after.indexOf('catch (err)') + 400);
  assert.ok(!/reportFatalError\(err\)/.test(catchPart), call + ' still reloads on error');
}
pass('no AI request reloads the page directly on failure');

// 함수 실행
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };
const store = new Map();
const ctx = { sessionStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }, Date };
vm.createContext(ctx);
new vm.Script(grab('    function isTemporaryAiError(err) {', "    const PENDING_ENTRY_KEY = 'pendingEntry';") +
  '\n;Object.assign(globalThis, { isTemporaryAiError, takeSavedViewState, VIEW_STATE_KEY });').runInContext(ctx);
{
  const t = ctx.isTemporaryAiError;
  assert.equal(t(new Error('AI 분석 실패: {"error":{"code":503}}')), true);
  assert.equal(t(new Error('AI 응답이 비어있습니다.')), true);
  assert.equal(t(new Error('AI 응답 포맷 에러')), true);
  assert.equal(t(new TypeError('Failed to fetch')), true);
  assert.equal(t(new TypeError('Load failed')), true);
  assert.equal(t(new Error('인증이 필요합니다.')), false);
  assert.equal(t(new Error('저장 실패: permission denied')), false);
  assert.equal(t(new Error('가입 승인 대기 중입니다.')), false);
  const abort = new Error('AI 분석 실패'); abort.name = 'AbortError';
  assert.equal(t(abort), false);
  pass('temporary AI and network errors are told apart from login/save errors');
}
{
  const save = (v) => store.set(ctx.VIEW_STATE_KEY, JSON.stringify(v));
  save({ activeTab: 'analysis', currentDate: '2026-11-04', statsMode: 'month', longTermDrafts: { 'habit:h1': '야식?' }, followupDraft: 'q', openFollowupId: 'l1', savedAt: Date.now() - 60000 });
  const v = JSON.parse(JSON.stringify(ctx.takeSavedViewState()));
  assert.deepEqual(v, { activeTab: 'analysis', currentDate: '2026-11-04', statsMode: 'month', longTermDrafts: { 'habit:h1': '야식?' }, followupDraft: 'q', openFollowupId: 'l1' });
  assert.equal(ctx.takeSavedViewState(), null, 'used only once');
  save({ activeTab: 'analysis', currentDate: '2026-11-04', statsMode: 'week', savedAt: Date.now() - 11 * 60000 });
  assert.equal(ctx.takeSavedViewState(), null, 'older than 10 minutes');
  save({ activeTab: 'admin', currentDate: 'x', statsMode: 'year', longTermDrafts: 'bad', savedAt: Date.now() });
  const bad = JSON.parse(JSON.stringify(ctx.takeSavedViewState()));
  assert.deepEqual(bad, { activeTab: null, currentDate: null, statsMode: null, longTermDrafts: {}, followupDraft: '', openFollowupId: null });
  store.set(ctx.VIEW_STATE_KEY, '{broken');
  assert.equal(ctx.takeSavedViewState(), null);
  pass('saved view: used once, within 10 minutes, invalid values ignored');
}

console.log(`\n${passed} passed`);
