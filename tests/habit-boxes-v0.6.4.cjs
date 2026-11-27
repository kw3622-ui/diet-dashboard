// v0.6.4 짝 습관 두 상자 검사: node tests/habit-boxes-v0.6.4.cjs [index_v0.6.4.html]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.6.4.html');
const html = fs.readFileSync(htmlFile, 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

const boxes = grab('    function PairBoxes(', '    // ★ v0.6.0 주간 습관 점검');
{
  assert.ok(boxes.includes('data-pair-good-box') && boxes.includes('data-pair-bad-box'), 'two boxes');
  assert.ok(boxes.includes("bg-emerald-50 border-emerald-200") && boxes.includes("bg-amber-50 border-amber-200"), 'green and orange boxes');
  const good = boxes.slice(boxes.indexOf('data-pair-good-box'), boxes.indexOf('data-pair-bad-box'));
  const bad = boxes.slice(boxes.indexOf('data-pair-bad-box'));
  assert.ok(good.includes("onChoose('done')") && good.includes("onChoose('mini')") && !good.includes("onChoose('slipped')"), 'good box has only its own buttons');
  assert.ok(bad.includes("onChoose('slipped')") && !bad.includes("onChoose('done')") && !bad.includes("onChoose('mini')"), 'bad box has only its own button');
  pass('two boxes, each with only its own buttons');
}
{
  assert.ok(boxes.includes('const goodShare = 50 + (goodLevel - badLevel) * 2;'), 'width 50/50, up to 60/40 at 5 steps');
  assert.ok(boxes.includes("style={{ flexBasis: `${goodShare}%` }}") && boxes.includes("style={{ flexBasis: `${100 - goodShare}%` }}"));
  assert.ok(boxes.includes('const goodPx = Math.round(base * PAIR_LEVEL_SCALE[goodLevel]);') && boxes.includes('const badPx = Math.round(base * PAIR_LEVEL_SCALE[badLevel]);'), 'name size grows too');
  assert.ok(boxes.includes('2주 {balance.kept}번') && boxes.includes('2주 {balance.slipped}번'), 'each box shows its own 2-week count');
  assert.ok(boxes.includes("? (good ? 'bg-emerald-500 border-emerald-500' : 'bg-amber-500 border-amber-500')") && boxes.includes("${otherChosen ? 'opacity-50' : ''}"), 'chosen box filled, the other dimmed');
  assert.ok(boxes.includes('line-clamp-2'), 'long names wrap to two lines inside the box');
  pass('winner grows in width (max 60%) and letter size, counts per box, chosen box filled');
}
{
  assert.ok(html.includes("{!pair && <RoutineCheckButton routine={routine} state={state} value={value} onTap={onTap} />}"), 'no check circle on pair rows');
  assert.ok(html.includes('? <PairBoxes routine={routine} check={check} state={state} balance={balance} onChoose={onChoose} base={14} />'), 'routine tab rows use boxes');
  assert.ok(html.includes("{routine.kind === 'count' && !pair && ("), 'count bar replaced by counts in the boxes');
  assert.ok(html.includes('<PairBoxes routine={pairOpen} check={getCheck(pairOpen.id, date)} state={stateOf(pairOpen)} balance={pairBalance(pairOpen, getCheck, isAutoDone, date)}'), 'home panel uses boxes');
  assert.ok(!html.includes('PairChoiceBar'), 'old button row removed');
  assert.ok(html.includes('<PairTitle routine={r} balance={pairBalance(r, getCheck, isAutoDone, today)} base={14} />'), 'list keeps the one-line title');
  pass('applied to routine rows and home panel; lists keep the one-line title');
}

console.log(`\n${passed} passed`);
