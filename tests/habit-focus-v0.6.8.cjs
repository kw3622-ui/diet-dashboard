// v0.6.8 마친 습관에서 체크를 풀면 그 줄로 따라가기 검사: node tests/habit-focus-v0.6.8.cjs [index_v0.6.8.html]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.6.8.html');
const html = fs.readFileSync(htmlFile, 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

const card = grab('    function TodayRoutineCard(', '    function HomeRoutineStrip(');
{
  assert.ok(card.includes("const back = [...prev.ids].filter(id => !ids.has(id) && all.some(r => r.id === id));"), 'finds the habit that left the finished list');
  assert.ok(card.includes('if (prev.date === date && prev.ids)'), 'changing the day does not jump');
  assert.ok(card.includes("window.scrollTo({ top: target, behavior: 'smooth' })") && card.includes('if (Math.abs(window.scrollY - target) > 40) window.scrollTo(0, target);'), 'scrolls to it (jumps if smooth scroll is not supported)');
  assert.ok(card.includes('if (r.top < 70 || r.bottom > window.innerHeight - 90)'), 'no scroll when already visible');
  assert.ok(card.includes("className={focusId === r.id ? 'rt-focus' : ''}") && card.includes('setTimeout(() => setFocusId(null), 1900)'), 'brief highlight');
  pass('unchecking from the finished list scrolls to the row and flashes it');
}
{
  assert.ok(card.includes('{open.map(r => focusWrap(r, <RoutineRow') && card.includes('{comeback.map(r => focusWrap(r, <RoutineRow'), 'both lists can be focused');
  const hooks = card.slice(0, card.indexOf('      return ('));
  assert.ok(!/\bif \([^)]*\) \{[^}]*use(State|Effect|Ref)\(/.test(hooks), 'hooks not inside if');
  assert.ok(html.includes('@keyframes rtFocus') && html.includes('prefers-reduced-motion: reduce) { .rt-focus'), 'animation css');
  pass('applies to time-slot rows and the comeback group; hooks at top level');
}

console.log(`\n${passed} passed`);
