// v0.6.6 습관 탭(오늘/관리)·수정·삭제·체크박스·상태 표시 검사: node tests/habit-tab-v0.6.6.cjs [index_v0.6.6.html]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.6.6.html');
const html = fs.readFileSync(htmlFile, 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

const tab = grab('    function RoutineTab(', '    function App() {');
{
  assert.ok(tab.includes("const [view, setView] = useState('today');"), 'opens on today');
  assert.ok(tab.includes("{tabBtn('today', '오늘')}") && tab.includes("{tabBtn('manage', `내 습관 관리 ${active.length}`)}"), 'two tabs');
  const today = tab.slice(tab.indexOf("{view === 'today' && (<>"), tab.indexOf("{view === 'manage' && (<>"));
  const manage = tab.slice(tab.indexOf("{view === 'manage' && (<>"), tab.indexOf('{formFor && ('));
  assert.ok(today.includes('<TodayRoutineCard') && !today.includes('data-routine-list-item') && !today.includes('active.map(row)'), 'today: records only');
  assert.ok(manage.includes('active.map(row)') && !manage.includes('<TodayRoutineCard'), 'manage: list only (no duplicate)');
  pass('habit tab: 오늘 / 내 습관 관리, the same habit is not shown twice');
}
{
  assert.ok(tab.includes('✏️ 수정') && tab.includes('onClick={() => setFormFor(r)}'), 'edit on the row');
  assert.ok(tab.includes('🗑️ 삭제') && tab.includes('data-routine-delete-confirm') && tab.includes('보관(숨기기)') && tab.includes('onDelete(r)'), 'delete asks first, offers archive');
  assert.ok(tab.includes('aria-hidden="true">›</span>') && tab.includes('aria-label={`${r.name} 기록 보기`}'), '› shows the row opens details');
  assert.ok(html.includes('data-routine-menu-edit>✏️ 이 습관 수정</button>') && tab.includes('onEditRoutine={(r) => setFormFor(r)}'), 'edit from the today ⋯ menu');
  pass('edit and delete buttons at the right end, › for details, edit from ⋯');
}
{
  const cb = grab('    function RoutineCheckButton(', '    // ★ v0.6.6 짝 습관 왼쪽 상태 표시');
  // v0.6.7부터는 연한 ✓ 대신 빈 네모
  assert.ok((cb.includes("'bg-white border-emerald-300 text-gray-300'") && cb.includes(": '✓'}")) || cb.includes('data-checkbox-box'), 'empty checkbox looks tappable');
  assert.ok(cb.includes('e.stopPropagation(); onTap();'), 'no double toggle when the row is also tappable');
  assert.ok(html.includes("onClick={pair ? undefined : onTap} data-routine-row-body>"), 'whole row toggles plain habits');
  assert.ok(html.includes('data-chip-checkbox>✓</span>') || html.includes('data-chip-checkbox></span>'), 'home chips show a checkbox too');
  pass('checkboxes look tappable; whole row works');
}
{
  const dot = grab('    function PairStatusDot(', '    // ★ v0.6.3 짝 습관 제목');
  for (const t of ["state === 'done' ? ['bg-emerald-500 text-white', '✓', '지킴']", "state === 'slipped' ? ['bg-amber-500 text-white', '🚫', '버릴 습관']", "state === 'skipped' ? ['bg-gray-200 text-gray-500', '💤', '쉼']", "'border-2 border-dashed border-"]) assert.ok(dot.includes(t), t);
  assert.ok(!dot.includes('onClick') && dot.includes('role="img"'), 'status only, not a button');
  assert.ok(html.includes('{pair ? <PairStatusDot state={state} /> : <RoutineCheckButton'), 'same spot as the checkbox');
  assert.ok(html.includes('data-pair-footer') && (html.includes('pb-2 pl-11') || html.includes('pb-2 pl-12')), 'footer lines up after the status column');
  pass('pair habits: status dot (empty / ✓ / 🚫 / 💤) in the checkbox column');
}

console.log(`\n${passed} passed`);
