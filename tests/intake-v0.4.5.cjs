// v0.4.5 복용 후속 검사(홈 n/m, 30일 복용률, 기간 리포트, 루틴 연결): node tests/intake-v0.4.5.cjs [index_v0.4.5.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.4.5.html');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

const ctx = {};
vm.createContext(ctx);
new vm.Script(
  "const SUPPLEMENT_CATEGORY = '건강식품';\nconst isSupplementLog = (log) => log?.category === SUPPLEMENT_CATEGORY;\n" +
  html.match(/const formatDate = [^\n]*\n/)[0] +
  html.match(/const parseDate = \(dateStr\) => \{[\s\S]*?\n    \};\n/)[0] +
  grab('    const SUPPLEMENT_NUTRIENTS = {', '    // 건강식품 기록 아래:') +
  grab('    // ★ v0.4.4 복용 관리: 오래 먹는', '    // 홈: 루틴 칸 아래 한 줄.') +
  grab('    function routineDayState(', '\n    }\n') + '\n    }\n' +
  '\n;Object.assign(globalThis, { intakeAdherence, intakeRoutineAutoDone, intakeCheckKey, routineDayState });'
).runInContext(ctx);

const I = (id, kind, name, times, extra = {}) => ({ id, kind, name, times, start_date: '2026-10-01', end_date: null, stopped_at: null, sort_order: 0, ...extra });
const K = ctx.intakeCheckKey;
const C = (item, date, slot, time = '08:00') => ({ [K(item, date, slot)]: { item_id: item, check_date: date, slot, taken_time: time } });

{
  // 혈압약(아침) 10일 전부터, 오메가3(아침·저녁) 5일 전부터 → 최근 30일
  const bp = I('m1', 'medicine', '혈압약', ['morning'], { start_date: '2026-11-04' });
  const omega = I('s1', 'supplement', '오메가3', ['morning', 'evening'], { start_date: '2026-11-09' });
  let checks = {};
  for (let d = 4; d <= 13; d++) {
    const date = `2026-11-${String(d).padStart(2, '0')}`;
    if (d !== 7) checks = { ...checks, ...C('m1', date, 'morning') }; // 7일 하루 빠짐
    if (d >= 9 && d <= 12) checks = { ...checks, ...C('s1', date, 'morning') }; // 저녁은 안 먹음
  }
  const a = plain(ctx.intakeAdherence([bp, omega], checks, '2026-11-13', 30));
  assert.deepEqual(a.perItem.m1, { due: 10, done: 9, rate: 90 }, 'today counted because it is checked');
  assert.deepEqual(a.perItem.s1, { due: 8, done: 4, rate: 50 }, 'today unchecked slots are not counted yet');
  assert.equal(a.medicine, 90);
  assert.equal(a.supplement, 50);
  assert.equal(a.rate, Math.round(13 / 18 * 100));
  // 시작일을 10/1로 적었지만 앱에는 11/10에 등록: 등록 전 날짜는 빼고, 등록 전이라도 체크한 날은 센다.
  const late = I('m9', 'medicine', '통풍약', ['morning'], { start_date: '2026-10-01', created_at: '2026-11-10T09:00:00+09:00' });
  const lateChecks = { ...C('m9', '2026-11-05', 'morning'), ...C('m9', '2026-11-10', 'morning'), ...C('m9', '2026-11-11', 'morning') };
  assert.deepEqual(plain(ctx.intakeAdherence([late], lateChecks, '2026-11-13', 30)).perItem.m9, { due: 4, done: 3, rate: 75 }, '11/5 (checked) + 11/10~12; today 11/13 not checked yet');
  const none = plain(ctx.intakeAdherence([], {}, '2026-11-13', 30));
  assert.equal(none.rate, null);
  pass('30-day adherence per item and kind; today only counts what is already checked');
}

{
  const bp = I('m1', 'medicine', '혈압약', ['morning']);
  const omega = I('s1', 'supplement', '오메가3', ['morning', 'evening']);
  const R = (slot) => ({ id: 'r', link_intake: true, time_slot: slot, kind: 'check' });
  const date = '2026-11-13';
  const auto = (routine, checks, hasLog = false) => ctx.intakeRoutineAutoDone(routine, date, [bp, omega], checks, hasLog);
  assert.equal(auto(R('morning'), { ...C('m1', date, 'morning') }), false, 'morning: omega still missing');
  assert.equal(auto(R('morning'), { ...C('m1', date, 'morning'), ...C('s1', date, 'morning') }), true, 'morning rows all checked');
  assert.equal(auto(R('evening'), { ...C('m1', date, 'morning'), ...C('s1', date, 'morning') }), false, 'evening omega not checked');
  assert.equal(auto(R('anytime'), { ...C('m1', date, 'morning'), ...C('s1', date, 'morning') }), false, 'anytime needs the whole day');
  assert.equal(auto(R('anytime'), { ...C('m1', date, 'morning'), ...C('s1', date, 'morning'), ...C('s1', date, 'evening') }), true);
  assert.equal(auto(R('late_morning'), { ...C('m1', date, 'morning'), ...C('s1', date, 'morning'), ...C('s1', date, 'evening') }), true, 'non-intake slot uses the whole day');
  assert.equal(auto(R('lunch'), {}, false), false, 'nothing due at lunch and no record');
  assert.equal(auto(R('lunch'), {}, true), true, 'nothing due at lunch: a supplement record completes it');
  assert.equal(ctx.intakeRoutineAutoDone({ link_intake: false, time_slot: 'morning' }, date, [bp], C('m1', date, 'morning'), true), false, 'not linked');
  assert.equal(ctx.intakeRoutineAutoDone(R('morning'), date, [], {}, false), false);
  pass('routine linked to intake: slot rows all checked, whole day for other slots, supplement record when nothing registered');

  const st = ctx.routineDayState;
  const linked = { kind: 'check', link_intake: true, link_exercise: false };
  assert.equal(st(linked, null, true), 'done');
  assert.equal(st(linked, { status: 'progress', value: 0, note: '' }, true), 'todo', 'manual check still wins');
  assert.equal(st({ kind: 'check', link_intake: false, link_exercise: false }, null, true), 'todo');
  pass('routine state: intake auto-done, manual check wins');
}

for (const [name, text] of [
  ['home intake strip under the routine card (also when routines are off)', '<HomeIntakeStrip items={intakeItems} checks={intakeChecks} date={currentDate}'],
  ['home strip shows n/m and what is left', "{left.length ? `남은: ${leftText}` : '다 챙겼어요 🎉'}"],
  ['sheet shows 30-day adherence', '최근 30일 복용률 {adherence.rate}%'],
  ['manager shows per-item adherence', 'data-intake-item-rate'],
  ['checks loaded for a year', ".from('intake_checks').select('*').gte('check_date', intakeSinceStr)"],
  ['older dates loaded on demand', "if (!session || !currentDate || currentDate >= intakeSinceStr) return;"],
  ['routine form option', '💊 복용 체크를 다 하면 자동으로 완료'],
  ['routine saves the link', 'link_intake: !!d.link_intake,'],
  ['routine row label', '복용 체크로 자동 완료'],
  ['supplement record dates loaded for routines', ".select('log_date').eq('category', SUPPLEMENT_CATEGORY)"],
  ['auto-done uses intake', 'if (intakeRoutineAutoDone(routine, date, intakeItems, intakeChecks, hasSupplementLog)) return true;'],
  ['monthly report counts supplement checks', '- 등록한 건강식품 복용 체크: ${checkSummary || \'없음\'}'],
  ['weekly report lists supplement checks', '(등록한 건강식품 복용 체크)`));'],
  ['report tells AI supplements are not meals', '건강식품은 식사가 아니므로 식사·간식으로 세지 말고'],
]) assert.ok(html.includes(text), name);
const report = grab('        const periodSupplementChecks = ', '        if (statsMode === \'month\') {');
assert.ok(report.includes("x.item?.kind === 'supplement'"), 'medicines never go into period reports');
pass('screen wiring: home strip, adherence, routine link, period reports (medicines excluded)');

console.log(`\n${passed} passed`);
