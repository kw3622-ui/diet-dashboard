// v0.6.3 짝 습관 한 줄 제목·이기는 쪽 크기 검사: node tests/habit-pair-title-v0.6.3.cjs [index_v0.6.3.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.6.3.html');
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
  '\n;Object.assign(globalThis, { pairBalance, PAIR_LEVEL_SCALE, addDaysStr });'
).runInContext(ctx);

const R = { id: 'r', name: '독서', kind: 'check', target: 1, step: 1, schedule_type: 'daily', weekdays: [], month_days: [], start_date: '2026-10-01', time_slot: 'anytime', bad_habit: '웹툰 보기', min_version: '5쪽' };
const make = (spec) => { const map = {}; let i = 0; spec.forEach(([n, status]) => { for (let k = 0; k < n; k++) map[ctx.addDaysStr('2026-11-27', -(i++))] = { status }; }); return (id, date) => map[date] || null; };
const bal = (spec) => plain(ctx.pairBalance(R, make(spec), () => false, '2026-11-27'));

{
  assert.deepEqual(bal([[7, 'done'], [3, 'slipped']]), { kept: 7, slipped: 3, goodLevel: 2, badLevel: 0 });
  assert.deepEqual(bal([[5, 'done'], [3, 'mini']]), { kept: 8, slipped: 0, goodLevel: 4, badLevel: 0 }, 'mini counts as kept');
  assert.deepEqual(bal([[14, 'done']]), { kept: 14, slipped: 0, goodLevel: 5, badLevel: 0 }, 'capped at 5 steps');
  assert.deepEqual(bal([[2, 'done'], [6, 'slipped']]), { kept: 2, slipped: 6, goodLevel: 0, badLevel: 2 }, 'the bad habit grows when it is winning');
  assert.deepEqual(bal([[3, 'done'], [3, 'slipped']]), { kept: 3, slipped: 3, goodLevel: 0, badLevel: 0 }, 'tie');
  assert.deepEqual(bal([[3, 'done']]), { kept: 3, slipped: 0, goodLevel: 0, badLevel: 0 }, 'fewer than 4 records: no change');
  assert.deepEqual(bal([[4, 'done'], [1, 'slipped']]), { kept: 4, slipped: 1, goodLevel: 1, badLevel: 0 });
  assert.deepEqual(plain(ctx.PAIR_LEVEL_SCALE), [1, 1.08, 1.16, 1.24, 1.32, 1.4]);
  pass('winner grows one step per 2 net wins, max 5 (1.4x), loser never shrinks, needs 4+ records');
}

{
  const boxes = html.includes('    function PairBoxes('); // v0.6.4부터 두 상자
  const title = grab('    function PairTitle(', boxes ? '    // ★ v0.6.4 짝 습관 기록' : '    // ★ v0.6.0 짝 습관 기록 버튼');
  assert.ok(title.includes('const goodPx = Math.round(base * PAIR_LEVEL_SCALE[balance?.goodLevel || 0]);') && title.includes('const badPx = Math.round(base * PAIR_LEVEL_SCALE[balance?.badLevel || 0]);'), 'same base size for both sides');
  assert.ok(/text-emerald-[78]00/.test(title) && /text-amber-[68]00/.test(title), 'different colours');
  assert.ok(title.includes('<div className="flex items-baseline gap-1.5 min-w-0">') && (title.match(/min-w-0 max-w-\[50%\] truncate/g) || []).length === 2, 'one line, each side at most half, cut with … when long');
  assert.ok(boxes || html.includes('{pair && onChoose && <div className="pb-1.5" data-pair-choices-row><PairChoiceBar'), 'choice buttons use the full row width');
  assert.ok(title.includes('transition-all duration-500'), 'grows smoothly');
  assert.ok(title.includes('최근 2주 <span className="text-emerald-600 font-bold">{balance.kept}</span> : <span className="text-amber-600 font-bold">{balance.slipped}</span>'), 'shows 7 : 3');
  const bar = grab(boxes ? '    function PairBoxes(' : '    function PairChoiceBar(', '    // ★ v0.6.0 주간 습관 점검');
  assert.ok(!bar.includes('vs 🚫'), 'no second "vs" line under the buttons');
  // v0.6.4부터 기록하는 곳(루틴 줄·홈 칸)은 두 상자, 보기만 하는 곳(목록·점검)은 한 줄 제목
  for (const [name, text] of [
    ['routine tab rows', boxes ? '<PairBoxes routine={routine} check={check} state={state} balance={balance} onChoose={onChoose} base={14} />' : '<PairTitle routine={routine} balance={balance} base={14}'],
    ['rows get the balance for the viewed day', 'balance: isPairRoutine(r) ? pairBalance(r, getCheck, isAutoDone, date) : null,'],
    ['home panel', boxes ? 'balance={pairBalance(pairOpen, getCheck, isAutoDone, date)}' : '<PairTitle routine={pairOpen} balance={pairBalance(pairOpen, getCheck, isAutoDone, date)} base={13} />'],
    ['my routine list', '<PairTitle routine={r} balance={pairBalance(r, getCheck, isAutoDone, today)} base={14} />'],
    ['weekly review', '<PairTitle routine={x.r} balance={pairBalance(x.r, getCheck, isAutoDone, target.end)} base={14} showCount={false} />'],
  ]) assert.ok(html.includes(text), name);
  pass('one-line title with equal base size and colours, used in rows, home panel, list and weekly review');
}

console.log(`\n${passed} passed`);
