// v0.6.2 간단 입력·숫자 최소 버전 검사: node tests/habit-simple-v0.6.2.cjs [index_v0.6.2.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.6.2.html');
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
  '\n;Object.assign(globalThis, { parseMinVersion, formatMinVersion, scaleMinVersion, pickRoutineEmoji, habitSuggestion, HABIT_TEMPLATES, MIN_UNITS, withRo });'
).runInContext(ctx);

{
  const p = (t) => plain(ctx.parseMinVersion(t));
  assert.deepEqual(p('10분'), { amount: 10, unit: '분' });
  assert.deepEqual(p('1.5 시간'), { amount: 1.5, unit: '시간' });
  assert.deepEqual(p('5쪽'), { amount: 5, unit: '쪽' });
  assert.deepEqual(p('3km'), { amount: 3, unit: 'km' });
  assert.equal(p('스트레칭 5분'), null, 'old free text stays text');
  assert.equal(p('0분'), null);
  assert.equal(p(''), null);
  assert.equal(ctx.formatMinVersion('10', '분'), '10분');
  assert.equal(ctx.formatMinVersion(1.25, '시간'), '1.3시간');
  assert.equal(ctx.formatMinVersion('', '분'), '');
  assert.deepEqual(plain(ctx.MIN_UNITS), ['분', '시간', '회', '쪽', '개']);
  pass('min version: number + unit stored as text ("10분"), free text left alone');

  const sc = ctx.scaleMinVersion;
  assert.deepEqual([sc('10분', 'down'), sc('5분', 'down'), sc('3쪽', 'down'), sc('1회', 'down')], ['5분', '2분', '1쪽', null]);
  assert.deepEqual([sc('10분', 'up'), sc('5쪽', 'up'), sc('1회', 'up'), sc('스트레칭 5분', 'up')], ['15분', '8쪽', '2회', null]);
  pass('smaller = half (never below 1), bigger = plus half');
}

{
  const R = (extra) => ({ id: 'r', name: '독서', kind: 'check', target: 1, step: 1, unit: '', bad_habit: '웹툰 보기', min_version: '', ...extra });
  const shaky = { pair: true, due: 14, counted: 14, recorded: 8, done: 3, mini: 0, slipped: 5, rate: 38 };
  const good = { pair: true, due: 14, counted: 14, recorded: 10, done: 9, mini: 2, slipped: 1, rate: 90 };
  const sug = (r, cur, prev) => plain(ctx.habitSuggestion(r, cur, prev));
  assert.deepEqual(sug(R({ min_version: '10분' }), shaky, good), { type: 'smaller_min', to: '5분', text: '최소 10분 → 5분으로 줄여 볼까요?' });
  assert.equal(ctx.habitSuggestion(R({ min_version: '1회' }), shaky, good), null, 'already the smallest');
  assert.equal(sug(R(), shaky, good).type, 'set_min');
  assert.deepEqual(sug(R({ min_version: '10쪽' }), good, good), { type: 'raise_min', to: '15쪽', text: '2주 넘게 잘 지켰어요. 최소 10쪽 → 15쪽으로 올려 볼까요?' });
  assert.equal(sug(R({ min_version: '스트레칭 5분' }), shaky, good).type, 'smaller_min', 'free text: typed suggestion as before');
  assert.deepEqual(['5분', '2회', '5km', '1시간', '3쪽', '1개', '10'].map(ctx.withRo), ['5분으로', '2회로', '5km로', '1시간으로', '3쪽으로', '1개로', '10로']);
  pass('weekly suggestions with numbers: one-tap smaller / bigger, correct 으로/로');
}

{
  const e = ctx.pickRoutineEmoji;
  assert.deepEqual(['독서 30분', '아침운동', '업무 집중', '점심 걷기', '물 2L', '영양제 챙기기', '일기 쓰기', '12시 전 잠들기', '뭔가 새로운 것'].map(e),
    ['📚', '💪', '🎯', '🚶', '💧', '💊', '📝', '🛏️', '✅']);
  const names = plain(ctx.HABIT_TEMPLATES.map(t => `${t.name}/${t.bad_habit}/${t.min_version}`));
  assert.deepEqual(names, ['독서/웹툰 보기/5쪽', '아침운동/알람 끄고 다시 눕기/5분', '업무 집중/걱정만 하고 미루기/10분', '점심 걷기/앉아서 쉬기/10분']);
  assert.ok(ctx.HABIT_TEMPLATES.every(t => ctx.parseMinVersion(t.min_version)), 'templates use numeric minimums');
  pass('emoji picked from the name, templates from the user’s examples with numeric minimums');
}

{
  const form = grab('    function RoutineForm(', '    const ROUTINE_DOT = ');
  const simple = form.slice(0, form.indexOf('data-routine-more-panel'));
  for (const t of ['하고 싶은 습관', '🚫 버릴 습관 (선택)', '◐ 힘든 날 최소 (선택)', '<MinVersionInput', '언제', '⚙️ 자세히 설정']) assert.ok(simple.includes(t), t);
  for (const t of ['종류', '반복', '다짐 한 줄', '운동을 기록하면 자동으로 완료', '이모지']) assert.ok(!simple.includes(`>${t}`) || t === '이모지' ? true : false, t + ' is folded');
  assert.ok(!simple.includes('ROUTINE_EMOJIS.map'), 'emoji picker folded');
  assert.ok(!simple.includes("[['daily', '매일']"), 'schedule folded');
  assert.ok(form.includes("const templates = initial ? [] : HABIT_TEMPLATES.filter(t => !existingNames.includes(t.name));"), 'templates only for new habits, hide existing names');
  assert.ok(form.includes("const emoji = emojiTouched ? (d.emoji || '✅') : pickRoutineEmoji(name);"), 'auto emoji unless chosen');
  assert.ok(form.includes("min_version: String(d.min_version || '').trim().slice(0, 60),"), 'min version saved even before a bad habit is set');
  assert.ok(form.includes("|| Boolean(initial.time_of_day) || Boolean(initial.motto) || Boolean(initial.link_exercise)"), 'details open when editing a routine that uses them');
  assert.ok(html.includes('existingNames={(routines || []).map(r => r.name)}'));
  assert.ok(html.includes("{routine.min_version ? `◐ 최소 ${routine.min_version}` : '◐ 조금이라도'}"), 'record button shows "◐ 최소 5쪽"');
  const review = grab('    function HabitReviewSheet(', '    // 루틴 한 줄:');
  assert.ok(review.includes("onClick={() => apply(x, { min_version: x.sug.to })}") && review.includes("{x.sug.type === 'raise_min' ? '올리기' : '줄이기'}"), 'one-tap adjust');
  assert.ok(review.includes('<MinVersionInput value="" onChange={(v) => setDrafts(d => ({ ...d, [x.r.id]: v }))} />'), 'set minimum with number + unit');
  pass('simple form: four rows, details folded, templates, auto emoji; review adjusts in one tap');
}

console.log(`\n${passed} passed`);
