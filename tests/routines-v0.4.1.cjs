// v0.4.1 루틴 검사(루틴별 이번 주 진행·30일 달성률에 오늘 포함): node tests/routines-v0.4.1.cjs [index_v0.4.1.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.4.1.html');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));

// 화면 구조
const texts = [
  ['bottom menu has four tabs (three when routines are off)', "showRoutines ? 'grid-cols-4' : 'grid-cols-3'"],
  ['routine tab button', 'aria-label="루틴 화면"'],
  ['routine tab screen', "{activeTab === 'routine' && showRoutines && (\n              <RoutineTab"],
  ['full today list with day switching at the top of the routine tab', '<TodayRoutineCard routines={routines} date={viewDate}'],
  ['status/analysis block excludes routine', "{activeTab !== 'home' && activeTab !== 'routine' && ("],
  ['one-line strip on the home screen', '<HomeRoutineStrip routines={routines}'],
  ['home shows at most three chips', 'const shown = open.slice(0, 3);'],
  ['home title', "home: { icon: '📋', label: '하루 기록'"],
  ['Pretendard font', 'pretendardvariable-dynamic-subset.min.css'],
  ['routine on/off setting', 'name="showRoutines" defaultChecked={profile?.showRoutines !== false}'],
  ['setting saved to the account', "show_routines: fd.get('showRoutines') === 'on',"],
  ['setting read from the account', 'showRoutines: data.show_routines !== false'],
  ['routine tab help explains the setting', 'data-routine-help'],
  ['empty home strip mentions the setting', '루틴을 쓰지 않으면 ⚙️ 설정에서 끌 수 있어요.'],
  ['no date picker on routine tab', 'const hidesDateNav = isLongTermView || activeTab === \'routine\';'],
  ['no period fetch on routine tab', "} else if (activeTab !== 'routine') {"],
  ['no swipe on routine tab', "|| activeTab === 'routine') { touchStartRef.current = null; return; }"],
  ['checks saved one per routine and day', ".upsert(row, { onConflict: 'routine_id,check_date' })"],
  ['failed saves are rolled back with a notice', 'showNotice(ROUTINE_SAVE_FAILED)'],
  ['reload restore knows the routine tab', "['home', 'routine', 'status', 'analysis'].includes(saved.activeTab)"],
  ['skip option', '오늘은 건너뛰기(쉬는 날)'],
  ['optional memo', 'placeholder="메모 (선택)"'],
  ['delete warns about history', '삭제하면 이 루틴의 체크 기록도 모두 지워져요'],
];
for (const [name, text] of texts) { assert.ok(html.includes(text), name); pass(name); }
const homeCard = html.indexOf('<HomeRoutineStrip routines={routines}');
const mealTable = html.indexOf('data-today-records>', homeCard);
assert.ok(homeCard > 0 && mealTable > homeCard && mealTable - homeCard < 700);
pass('routine strip sits directly above the meal table');

// 계산 함수 실행
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };
const ctx = {};
vm.createContext(ctx);
new vm.Script(
  html.match(/const formatDate = [^\n]*\n/)[0] +
  html.match(/const parseDate = \(dateStr\) => \{[\s\S]*?\n    \};\n/)[0] +
  html.match(/const getWeekRange = \(dateStr\) => \{[\s\S]*?\n    \};\n/)[0] +
  'const getKoreanWeekLabel = () => "";\n' +
  grab('    const ROUTINE_SLOTS = [', '    function RoutineCheckButton(') +
  '\n;Object.assign(globalThis, { isRoutineDue, routineDayState, computeRoutineStats, buildTodayRoutineGroups, currentRoutineSlot, describeRoutineSchedule, compareRoutines });'
).runInContext(ctx);

const R = (extra) => ({ id: 'r', name: 'x', kind: 'check', target: 1, step: 1, schedule_type: 'daily', weekdays: [], month_days: [], interval_days: null, start_date: '2026-01-01', time_slot: 'anytime', time_of_day: null, sort_order: 0, archived_at: null, link_exercise: false, ...extra });

{
  const due = ctx.isRoutineDue;
  assert.equal(due(R(), '2026-11-10'), true);
  assert.equal(due(R({ start_date: '2026-11-11' }), '2026-11-10'), false);
  const weekly = R({ schedule_type: 'weekly', weekdays: [1, 3, 5] }); // 월·수·금
  assert.deepEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-13', '2026-11-15'].map(d => due(weekly, d)), [true, false, true, true, false]);
  const monthly = R({ schedule_type: 'monthly', month_days: [1, 31] });
  assert.deepEqual(['2026-11-01', '2026-11-30', '2026-12-31', '2026-02-28', '2026-02-27', '2028-02-29', '2028-02-28'].map(d => due(monthly, d)), [true, true, true, true, false, true, false]);
  const feb30 = R({ schedule_type: 'monthly', month_days: [28, 30] });
  assert.equal(due(feb30, '2026-02-28'), true, '28 and 30 both fall on Feb 28');
  const interval = R({ schedule_type: 'interval', interval_days: 3, start_date: '2026-11-01' });
  assert.deepEqual(['2026-10-29', '2026-11-01', '2026-11-02', '2026-11-04', '2026-11-07', '2026-11-08'].map(d => due(interval, d)), [false, true, false, true, true, false]);
  const archived = R({ archived_at: '2026-11-05T03:00:00Z' });
  assert.equal(due(archived, '2026-11-05'), true);
  assert.equal(due(archived, '2026-11-06'), false);
  pass('due days: daily, weekdays, month days (missing date = last day), every n days, start and archive');
}
{
  const st = ctx.routineDayState;
  assert.equal(st(R(), null, false), 'todo');
  assert.equal(st(R(), { status: 'done' }, false), 'done');
  assert.equal(st(R(), { status: 'skipped' }, true), 'skipped');
  assert.equal(st(R(), { status: 'progress', note: 'memo' }, false), 'todo');
  assert.equal(st(R({ link_exercise: true }), null, true), 'done');
  const count = R({ kind: 'count', target: 30 });
  assert.equal(st(count, { status: 'progress', value: 10 }, false), 'progress');
  assert.equal(st(count, { status: 'progress', value: 30 }, false), 'done');
  pass('day state: done, skipped, memo only, exercise link, count progress');
}
{
  const today = '2026-11-10';
  const checks = {
    '2026-11-09': { status: 'done' }, '2026-11-08': { status: 'skipped' }, '2026-11-07': { status: 'done' },
    '2026-11-06': { status: 'done' }, /* 11-05 missed */ '2026-11-04': { status: 'done' }, '2026-11-03': { status: 'done' },
    '2026-11-02': { status: 'done' }, '2026-11-01': { status: 'done' },
  };
  const getCheck = (id, d) => checks[d] || null;
  const s = plain(ctx.computeRoutineStats(R({ start_date: '2026-11-01' }), getCheck, () => false, today));
  assert.equal(s.current, 3, 'today not done yet, skip keeps the streak, missed day stops it');
  assert.equal(s.best, 4);
  assert.equal(s.totalDone, 7);
  assert.equal(s.score, 78, '7 of 9 due days: today counts even before it is done, only the skip is left out');
  // 이번 주 11/9(월) ~ 11/15(일), 오늘은 11/10(화)
  assert.deepEqual(s.week.map(x => x.state), ['done', 'today', 'future', 'future', 'future', 'future', 'future']);
  assert.deepEqual([s.weekDone, s.weekDue, s.nextDue], [1, 7, null]);
  checks[today] = { status: 'done' };
  const done = ctx.computeRoutineStats(R({ start_date: '2026-11-01' }), getCheck, () => false, today);
  assert.equal(done.current, 4);
  assert.equal(done.score, 89, '8 of 9 due days once today is done');
  checks['2026-11-11'] = { status: 'skipped' };
  assert.equal(ctx.computeRoutineStats(R({ start_date: '2026-11-01' }), getCheck, () => false, today).weekDue, 6, 'a skip marked ahead on a future day is left out');
  delete checks['2026-11-11'];
  const weekly = R({ schedule_type: 'weekly', weekdays: [1], start_date: '2026-10-01' }); // 월요일만
  const wChecks = { '2026-11-09': { status: 'done' }, '2026-11-02': { status: 'done' }, '2026-10-26': { status: 'done' } };
  const ws = plain(ctx.computeRoutineStats(weekly, (id, d) => wChecks[d] || null, () => false, today));
  assert.equal(ws.current, 3, 'days that are not due never break a weekly streak');
  assert.deepEqual(ws.week.map(x => x.state), ['done', 'none', 'none', 'none', 'none', 'none', 'none']);
  assert.deepEqual([ws.weekDone, ws.weekDue], [1, 1]);
  pass('stats: streak with skips, best streak, 30-day score includes today, this week Mon-Sun');
}
{
  const today = '2026-11-10';
  // 오늘 처음 만든 루틴 5개 중 1개만 체크: 루틴마다 따로 보이고, 전체 100% 같은 숫자는 없다.
  const fresh = ['a', 'b', 'c', 'd', 'e'].map(id => R({ id, start_date: today }));
  const checks = { 'a|2026-11-10': { status: 'done' } };
  const st = fresh.map(r => plain(ctx.computeRoutineStats(r, (id, d) => checks[`${id}|${d}`] || null, () => false, today)));
  assert.deepEqual(st.map(x => x.score), [100, 0, 0, 0, 0]);
  assert.deepEqual(st.map(x => `${x.weekDone}/${x.weekDue}`), ['1/6', '0/6', '0/6', '0/6', '0/6']);
  assert.deepEqual(st[1].week.map(x => x.state), ['none', 'today', 'future', 'future', 'future', 'future', 'future']);
  const monthly = R({ schedule_type: 'monthly', month_days: [31], start_date: '2026-11-01' });
  const ms = plain(ctx.computeRoutineStats(monthly, () => null, () => false, today));
  assert.deepEqual([ms.weekDue, ms.nextDue], [0, '2026-11-30'], 'no day this week: show the next one (Nov has no 31st)');
  const every10 = R({ schedule_type: 'interval', interval_days: 10, start_date: '2026-11-01' });
  assert.equal(plain(ctx.computeRoutineStats(every10, () => null, () => false, today)).nextDue, null, '11/11 is due this week');
  assert.equal(ctx.computeRoutineStats(R({ start_date: '2026-11-11' }), () => null, () => false, today).score, null);
  assert.ok(!html.includes('이번 주 루틴 달성'), 'overall weekly card removed');
  assert.ok(html.includes('data-routine-week'));
  pass('first day: each routine on its own, next due day when none this week, overall card removed');
}
{
  const list = [
    R({ id: 'a', time_slot: 'morning', name: '명상' }),
    R({ id: 'b', time_slot: 'evening', time_of_day: '21:00', name: '약' }),
    R({ id: 'c', time_slot: 'evening', time_of_day: '19:30', name: '산책' }),
    R({ id: 'd', time_slot: 'evening', sort_order: 5, name: '일기' }),
    R({ id: 'e', time_slot: 'anytime', name: '물' }),
    R({ id: 'f', time_slot: 'afternoon', schedule_type: 'weekly', weekdays: [0], name: '일요일만' }),
    R({ id: 'g', time_slot: 'lunch', archived_at: '2026-11-01T00:00:00Z', name: '보관' }),
  ];
  const groups = plain(ctx.buildTodayRoutineGroups(list, '2026-11-10', true, 'afternoon'));
  assert.deepEqual(groups.map(g => [g.key, g.items.map(i => i.id)]), [['evening', ['c', 'b', 'd']], ['anytime', ['e']], ['morning', ['a']]]);
  assert.equal(groups.find(g => g.key === 'morning').past, true);
  const other = plain(ctx.buildTodayRoutineGroups(list, '2026-11-09', false, 'afternoon'));
  assert.deepEqual(other.map(g => g.key), ['morning', 'evening', 'anytime']);
  pass('today list: only due routines, now-slot first, earlier slots last, exact times first');
}
{
  const slot = (h) => ctx.currentRoutineSlot(new Date(2026, 10, 10, h, 0));
  assert.deepEqual([3, 6, 10, 12, 15, 19, 22].map(slot), ['bedtime', 'morning', 'late_morning', 'lunch', 'afternoon', 'evening', 'bedtime']);
  assert.equal(ctx.describeRoutineSchedule(R({ schedule_type: 'weekly', weekdays: [0, 1, 5] })), '매주 월·금·일');
  assert.equal(ctx.describeRoutineSchedule(R({ schedule_type: 'monthly', month_days: [15, 1] })), '매월 1·15일');
  assert.equal(ctx.describeRoutineSchedule(R({ schedule_type: 'interval', interval_days: 2 })), '2일마다');
  pass('time slots by hour and schedule wording');
}

console.log(`\n${passed} passed`);
