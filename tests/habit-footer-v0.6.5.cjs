// v0.6.5 짝 습관 아래 한 줄(쉼 · ⋯, 메모는 ⋯ 안)과 "습관" 이름 검사: node tests/habit-footer-v0.6.5.cjs [index_v0.6.5.html]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.6.5.html');
const html = fs.readFileSync(htmlFile, 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

{
  const row = grab('    function RoutineRow(', '    // 홈: 오늘의 루틴 카드');
  assert.ok(row.includes('{!pair && <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={`${routine.name} 더보기`}'), 'no ⋯ beside the boxes');
  const footer = row.slice(row.indexOf('data-pair-footer'), row.indexOf('{menuOpen && ('));
  assert.ok(footer.includes('😴 오늘은 쉼') && footer.includes('onClick={onSkipToggle}'), 'skip is one tap under the boxes');
  assert.ok(footer.includes('😴 쉬는 날 · 취소'), 'skipped day shows a cancel');
  assert.ok(!footer.includes('📝 메모') && footer.includes('aria-label={`${routine.name} 더보기`}'), 'only ⋯ on the right; memo lives inside ⋯');
  assert.ok(row.includes('placeholder="메모 (선택)"'), 'memo input is in the ⋯ menu');
  assert.ok(row.includes("{!pair && <button type=\"button\" onClick={() => { onSkipToggle(); setMenuOpen(false); }}"), 'menu no longer repeats skip for pairs');
  assert.ok(row.includes("className={`${pair ? '' : 'ml-12 '}mb-2 bg-gray-50 rounded-xl p-2.5 space-y-2`}"), 'menu uses full width for pairs');
  const boxes = grab('    function PairBoxes(', '    // ★ v0.6.0 주간 습관 점검');
  assert.ok(boxes.includes("const rest = state === 'skipped';") && boxes.includes("${rest ? 'opacity-40 grayscale' : ''}"), 'both boxes grey on a rest day');
  pass('pair rows: boxes full width, thin line below with rest · memo · ⋯');
}
{
  assert.ok(html.includes('data-home-pair-skip') && html.includes("onClick={() => skipPair(pairOpen)}"), 'home panel can rest too');
  assert.ok(html.includes('onSkip={routineActions.toggleSkip}'));
  pass('home panel: 😴 오늘은 쉼');
}
{
  for (const t of ["label: '습관', circle:", '>습관</span>', '내 습관 {active.length}개', '+ 습관 추가', '🌱 습관 기능 사용', "{isToday ? '오늘의' : '이 날의'} 습관", '마친 습관', '놓친 습관', '🌱 습관 <span']) assert.ok(html.includes(t), t);
  // 보이는 글자에는 "루틴"이 남지 않는다(주석·접근성 이름·코드 이름 제외)
  const visible = html.split('\n').filter(l => /루틴/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l)).map(l => l.replace(/\/\/.*$/, '').replace(/aria-label="[^"]*"/g, '')).filter(l => /루틴/.test(l));
  assert.deepEqual(visible, [], 'no visible "루틴" left');
  pass('screen words: 루틴 → 습관 (aria labels and code names kept)');
}

console.log(`\n${passed} passed`);
