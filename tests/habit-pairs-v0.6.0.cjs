// v0.6.0 짝 습관 검사(버릴 습관·최소 버전·두 번 연속 놓치지 않기·주간 점검): node tests/habit-pairs-v0.6.0.cjs [index_v0.6.0.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.6.0.html');
const html = fs.readFileSync(htmlFile, 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

const ctx = {};
vm.createContext(ctx);
new vm.Script(
  html.match(/const formatDate = [^\n]*\n/)[0] +
  html.match(/const parseDate = \(dateStr\) => \{[\s\S]*?\n    \};\n/)[0] +
  html.match(/const getWeekRange = \(dateStr\) => \{[\s\S]*?\n    \};\n/)[0] +
  'const getKoreanWeekLabel = () => "";\n' +
  grab('    const ROUTINE_SLOTS = [', '    function RoutineCheckButton(') +
  '\n;Object.assign(globalThis, { routineDayState, computeRoutineStats, isPairRoutine, habitWindowSummary, classifyHabit, habitTrend, habitSuggestion, weeklyReviewTarget, weeklyReviewRoutines, yesterdaySlippedRoutines, addDaysStr });'
).runInContext(ctx);

const R = (extra) => ({ id: 'r', name: '독서', kind: 'check', target: 1, step: 1, unit: '', schedule_type: 'daily', weekdays: [], month_days: [], interval_days: null, start_date: '2026-10-01', time_slot: 'anytime', time_of_day: null, sort_order: 0, archived_at: null, link_exercise: false, link_intake: false, bad_habit: '웹툰 보기', min_version: '', ...extra });
const checksFrom = (map) => (id, date) => map[date] || null;
const noAuto = () => false;

{
  const st = ctx.routineDayState;
  const r = R();
  assert.equal(st(r, { status: 'done' }, false), 'done');
  assert.equal(st(r, { status: 'mini' }, false), 'done', 'mini counts as kept');
  assert.equal(st(r, { status: 'slipped' }, false), 'slipped');
  assert.equal(st(r, { status: 'slipped' }, true), 'slipped', 'manual choice beats auto-done');
  assert.equal(st(r, null, false), 'todo');
  const c = R({ kind: 'count', target: 3, step: 1 });
  assert.equal(st(c, { status: 'progress', value: 1, bad_value: 2 }, false), 'slipped', 'count pair: bad count without reaching the goal');
  assert.equal(st(c, { status: 'progress', value: 3, bad_value: 2 }, false), 'done', 'count pair: goal reached wins');
  assert.equal(st(R({ kind: 'count', target: 3, bad_habit: '' }), { status: 'progress', value: 1, bad_value: 2 }, false), 'progress', 'plain routine ignores bad_value');
  assert.equal(ctx.isPairRoutine(R({ bad_habit: '  ' })), false);
  pass('day state: done / mini(=done) / slipped, count pairs by counts, manual choice first');
}

{
  // 주 11/16(월)~11/22(일). 시작 11/17(화), 11/17~11/20 했어요(11/18은 조금만), 11/21(토) 버릴 습관, 11/22(일) 오늘 아직
  const map ={ '2026-11-17': { status: 'done' }, '2026-11-18': { status: 'mini' }, '2026-11-19': { status: 'done' }, '2026-11-20': { status: 'done' }, '2026-11-21': { status: 'slipped' } };
  const s = ctx.computeRoutineStats(R({ start_date: '2026-11-17' }), checksFrom(map), noAuto, '2026-11-22');
  assert.equal(s.current, 0, 'yesterday slipped breaks the streak');
  assert.equal(s.best, 4);
  assert.deepEqual(plain(s.week.map(x => x.state)), ['none', 'done', 'done', 'done', 'done', 'slipped', 'today']);
  const s2 = ctx.computeRoutineStats(R({ start_date: '2026-11-17' }), checksFrom({ ...map, '2026-11-21': { status: 'done' }, '2026-11-22': { status: 'slipped' } }), noAuto, '2026-11-22');
  assert.equal(s2.current, 0, 'slipped today ends the streak too');
  pass('stats: slipped breaks streaks, shows as its own week dot');
}

{
  const sum = ctx.habitWindowSummary, cls = ctx.classifyHabit;
  const days = (from, n, status) => Object.fromEntries(Array.from({ length: n }, (_, i) => [ctx.addDaysStr(from, i), status ? { status } : null]));
  // 14일: 8 했어요(그중 3 mini), 2 버릴 습관, 1 쉼, 3 기록 없음
  const map = { ...days('2026-11-09', 5, 'done'), ...days('2026-11-14', 3, 'mini'), ...days('2026-11-17', 2, 'slipped'), ...days('2026-11-19', 1, 'skipped') };
  const s = plain(sum(R(), checksFrom(map), noAuto, '2026-11-22', 14));
  assert.deepEqual([s.due, s.done, s.mini, s.slipped, s.skipped, s.unrecorded, s.recorded, s.rate], [14, 8, 3, 2, 1, 3, 10, 80]);
  assert.equal(cls(s), 'good');
  // 기록 8번(절반 이상) 중 3번 지킴 → 흔들림. 기록이 절반 미만이면 "기록 부족"으로 따로 본다.
  const shaky = plain(sum(R(), checksFrom({ ...days('2026-11-09', 3, 'done'), ...days('2026-11-12', 5, 'slipped') }), noAuto, '2026-11-22', 14));
  assert.equal(shaky.rate, 38);
  assert.equal(cls(plain(sum(R(), checksFrom({ ...days('2026-11-09', 2, 'done'), ...days('2026-11-11', 4, 'slipped') }), noAuto, '2026-11-22', 14))), 'sparse', '6 records in 14 days');
  assert.equal(cls(shaky), 'shaky');
  const sparse = plain(sum(R(), checksFrom(days('2026-11-20', 3, 'done')), noAuto, '2026-11-22', 14));
  assert.equal(cls(sparse), 'sparse', 'pair habit with few records');
  const plainRoutine = plain(sum(R({ bad_habit: '' }), checksFrom(days('2026-11-09', 5, 'done')), noAuto, '2026-11-22', 14));
  assert.equal(plainRoutine.rate, 36, 'plain routine: done / due days');
  assert.equal(cls(plainRoutine), 'shaky');
  assert.equal(cls(plain(sum(R({ start_date: '2026-11-20' }), checksFrom({}), noAuto, '2026-11-22', 14))), 'few');
  assert.equal(cls(plain(sum(R({ bad_habit: '' }), checksFrom({}), noAuto, '2026-11-22', 14))), 'sparse', 'plain routine never recorded: probably unused, not shaky');
  assert.ok(html.includes(".slice(0, 2).map(x => x.r.id));"), 'at most two shaky suggestions at once');
  pass('2-week summary per habit: kept / mini / slipped / no record, classes good · shaky · sparse · few');

  const prevGood = { pair: true, due: 14, counted: 14, recorded: 10, done: 9, rate: 90, slipped: 1 };
  assert.equal(ctx.habitTrend({ ...prevGood, rate: 60 }, prevGood), 'down');
  assert.equal(ctx.habitTrend({ ...prevGood, rate: 95 }, prevGood), '');
  const sug = (r, cur, prev) => plain(ctx.habitSuggestion(r, cur, prev));
  assert.equal(sug(R(), shaky, prevGood).type, 'set_min');
  assert.equal(sug(R({ min_version: '1쪽만' }), shaky, prevGood).type, 'smaller_min');
  assert.equal(sug(R({ bad_habit: '' }), plainRoutine, prevGood).type, 'set_bad', 'plain shaky routine: suggest naming the bad habit');
  assert.deepEqual(sug(R({ kind: 'count', target: 10, step: 5, unit: '쪽' }), prevGood, prevGood).target, 15, 'good two windows: raise the goal');
  assert.equal(sug(R({ min_version: '1쪽만' }), prevGood, prevGood).type, 'raise_min');
  assert.equal(ctx.habitSuggestion(R(), prevGood, { ...prevGood, rate: 50 }), null, 'good once is not enough to raise');
  pass('suggestions: smaller when shaky, raise after two good windows, name the bad habit for plain routines');
}

{
  assert.deepEqual(plain(ctx.weeklyReviewTarget('2026-11-22')), { start: '2026-11-16', end: '2026-11-22' }, 'Sunday: this week');
  assert.deepEqual(plain(ctx.weeklyReviewTarget('2026-11-26')), { start: '2026-11-16', end: '2026-11-22' }, 'other days: last week');
  assert.deepEqual(plain(ctx.weeklyReviewTarget('2026-11-23')), { start: '2026-11-16', end: '2026-11-22' }, 'Monday after a missed Sunday');
  assert.equal(ctx.weeklyReviewRoutines([R(), R({ id: 'x', start_date: '2026-11-25' }), R({ id: 'y', archived_at: '2026-11-01' })], '2026-11-22').length, 1);
  pass('weekly review: Sunday = this week, otherwise last week; only active routines started by then');
}

{
  const map = { '2026-11-25': { status: 'slipped' } };
  const list = ctx.yesterdaySlippedRoutines([R(), R({ id: 'p', bad_habit: '' })], checksFrom(map), noAuto, '2026-11-26');
  assert.deepEqual(plain(list.map(r => r.id)), ['r']);
  assert.equal(ctx.yesterdaySlippedRoutines([R()], checksFrom({ ...map, '2026-11-26': { status: 'mini' } }), noAuto, '2026-11-26').length, 0, 'gone once recorded today');
  pass('never miss twice: yesterday slipped and not recorded today');
}

{
  for (const [name, text] of [
    ['bad habit field', '🚫 버릴 습관 (선택)'],
    ['min version optional', '+ 힘든 날의 최소 버전 정하기 (선택)'],
    ['form saves both', "bad_habit: String(d.bad_habit || '').trim().slice(0, 60),"],
    ['choice buttons', "onClick={() => onChoose('mini')}"],
    ['mini label shows the min version', "◐ 조금이라도{routine.min_version ? ` (${routine.min_version})` : ''}"],
    ['choose action', "return putRoutineCheck(routine, date, { status: choice, value: 0 });"],
    ['same choice again cancels', 'return undoRoutineCheck(routine, date);'],
    ['bad_value kept on save', 'bad_value: prev?.bad_value || 0,'],
    ['home pair panel', 'data-home-pair-panel'],
    ['comeback group in routine tab', '↺ 두 번 연속 놓치지 않기'],
    ['review card', 'data-routine-review-card'],
    ['home review link', 'data-home-review'],
    ['review saved per week', ".upsert(row, { onConflict: 'user_id,week_start' })"],
    ['reviews loaded', ".from('habit_weekly_reviews').select('week_start, reviewed_at, ai_note')"],
    ['suggestions applied through saveRoutine', 'onApply={(r, patch) => saveRoutine(r, patch)}'],
    ['no streak flame on pair habits', '{st.current > 0 && !isPairRoutine(r) &&'],
  ]) assert.ok(html.includes(text), name);
  const bar = grab('    function PairChoiceBar(', '    // ★ v0.6.0 주간 습관 점검');
  const btnClasses = bar.match(/flex-1 min-w-0 truncate text-\[11px\] font-bold px-2 py-1\.5/g) || [];
  assert.equal(btnClasses.length, 1, 'one shared button style: good and bad choices are the same size');
  assert.ok(!grab('    function HabitReviewSheet(', '    // 루틴 한 줄:').includes('전체 점수'), 'no overall score');
  pass('screen wiring: form, equal-size choices, choose/undo, home panel, comeback, weekly review');
}

console.log(`\n${passed} passed`);
