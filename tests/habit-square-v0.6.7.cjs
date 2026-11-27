// v0.6.7 네모 체크박스·점선 상태 칸·홈 칩·점검 카드 위치·시간대 머리줄 검사: node tests/habit-square-v0.6.7.cjs [index_v0.6.7.html]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.6.7.html');
const html = fs.readFileSync(htmlFile, 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

{
  const cb = grab('    function RoutineCheckButton(', '    function PairStatusDot(');
  assert.ok(cb.includes('className="shrink-0 w-10 h-10 flex items-center justify-center'), 'tap area 40px');
  assert.ok(cb.includes('w-7 h-7 rounded-lg border-2') && !cb.includes('rounded-full'), 'visible box is a 28px square');
  assert.ok(cb.includes("'bg-white border-emerald-400'") && !cb.includes("text-gray-300") && cb.includes(": ''}"), 'empty square, no faint check');
  assert.ok(cb.includes('+{routine.step || 1}'), 'count habits keep +1');
  pass('plain habits: empty square checkbox (28px, tap area 40px)');
}
{
  const dot = grab('    function PairStatusDot(', '    // ★ v0.6.3 짝 습관 제목');
  assert.ok(dot.includes('w-7 h-7 rounded-lg') && dot.includes('shrink-0 w-10 h-10') && !dot.includes('rounded-full'), 'same square, same column');
  assert.ok(dot.includes('border-2 border-dashed border-emerald-300') && !dot.includes('onClick'), 'dashed, not a button');
  assert.ok(html.includes('pb-2 pl-12" data-pair-footer'), 'footer lines up');
  assert.ok(html.includes("data-chip-checkbox></span>") && html.includes("isPairRoutine(r) ? 'border-dashed border-emerald-300' : 'border-emerald-400'"), 'home chips: square, dashed for pairs');
  pass('pair habits: dashed square in the same column; home chips square');
}
{
  const tab = grab('    function RoutineTab(', '    function App() {');
  const iCard = tab.indexOf('data-routine-review-card'), iViews = tab.indexOf('data-routine-views');
  assert.ok(iCard > 0 && iCard < iViews && tab.split('data-routine-review-card').length === 2, 'review card once, above the tabs');
  assert.ok(html.includes('data-routine-slot-head') && html.includes("flex-1 h-px"), 'thin time-slot header with a line');
  pass('review card above 오늘/관리; thin time-slot header');
}

console.log(`\n${passed} passed`);
