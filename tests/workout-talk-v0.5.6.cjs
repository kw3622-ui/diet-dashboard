// v0.5.6 한 줄 입력·코치 한마디 검사: node tests/workout-talk-v0.5.6.cjs [index_v0.5.6.html] [exercise_library_v1.json]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.5.6.html');
const libFile = process.argv[3] || path.resolve(__dirname, '..', 'exercise_library_v1.json');
const html = fs.readFileSync(htmlFile, 'utf8').replace(/\r\n/g, '\n');
const lib = JSON.parse(fs.readFileSync(libFile, 'utf8'));
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = (v) => JSON.parse(JSON.stringify(v));

const start = html.indexOf('const formatExerciseSet = (s) => {');
const end = html.indexOf('// ★ v0.3.8 항목별 근거');
const partsStart = html.indexOf('const EXERCISE_PARTS = [');
const partsEnd = html.indexOf('const RECOMMENDABLE_EXERCISE_PARTS');
assert.ok(!/<[A-Za-z][^>]*>/.test(html.slice(start, end).replace(/\/\/.*$/gm, '').replace(/'[^'\n]*'|`[^`]*`/g, '')), 'helper block has no JSX');
const ctx = {};
vm.createContext(ctx);
new vm.Script(html.slice(partsStart, partsEnd) + html.slice(start, end) + `
;Object.assign(globalThis, { buildExerciseIndex, libraryKeyMap, parseWorkoutText, buildRecommendation, touchesAvoided, chooseFocusGroups, recoveryStatus });`).runInContext(ctx);
const index = ctx.buildExerciseIndex(lib);
const keyMap = ctx.libraryKeyMap(index);

// 1. 규칙으로 읽기
const P = (t) => { const r = plain(ctx.parseWorkoutText(t)); delete r.matched; return r; };
assert.deepEqual(P('피곤해서 30분만'), { groups: [], avoid: [], minutes: 30, condition: 'tired' });
assert.deepEqual(P('어깨가 좀 아파'), { groups: [], avoid: ['shoulder'] });
assert.deepEqual(P('아파트에서 하체'), { groups: ['legs'], avoid: [], place: 'apartment' }, '아파트 is not pain');
assert.deepEqual(P('등이랑 이두 한 시간 반'), { groups: ['back', 'biceps'], avoid: [], minutes: 90 });
assert.deepEqual(P('어깨 아픈데 가슴 하고 싶어'), { groups: ['chest'], avoid: ['shoulder'] });
assert.deepEqual(P('피곤해서 30분만, 어깨 좀 아파'), { groups: [], avoid: ['shoulder'], minutes: 30, condition: 'tired' });
assert.deepEqual(P('허리가 결려서 가볍게'), { groups: [], avoid: ['back'] });
assert.deepEqual(P('컨디션 좋아요 150분'), { groups: [], avoid: [], minutes: 120, condition: 'good' });
assert.deepEqual(P('회사에서 팔'), { groups: ['biceps', 'triceps'], avoid: [], place: 'company' });
assert.equal(ctx.parseWorkoutText('오늘은 그냥 대충').matched, false, 'unknown sentence goes to AI');
assert.equal(ctx.parseWorkoutText('').matched, false);
pass('rule reading: minutes, condition, place, parts, pain parts (아파트 is a place), cut to 20~120');

// 2. 뺄 부위가 추천에 반영
assert.equal(ctx.touchesAvoided(keyMap.get('barbell-bench-press'), ['triceps']), keyMap.get('barbell-bench-press').targets.some(t => t === 'arm.triceps'));
assert.equal(ctx.touchesAvoided(keyMap.get('dumbbell-lateral-raise'), ['shoulder']), true);
assert.equal(ctx.touchesAvoided(keyMap.get('leg-press'), []), false);
const today = '2026-11-26';
const nowMs = Date.parse('2026-11-26T19:00:00');
const places = { company: ['barbell-squat', 'leg-press', 'dumbbell-lateral-raise', 'seated-dumbbell-shoulder-press', 'face-pull', 'barbell-bench-press', 'dumbbell-side-bend'] };
const logs = [{ log_date: '2026-11-10', log_time: '19:00:00', exercise_meta: { items: [{ name: '덤벨 레터럴 레이즈', sets: [{ weight: 8, reps: 15 }] }] } },
  { log_date: '2026-11-20', log_time: '19:00:00', exercise_meta: { items: [{ name: '바벨 스쿼트', sets: [{ weight: 60, reps: 5 }] }, { name: '바벨 플랫 벤치 프레스', sets: [{ weight: 60, reps: 8 }] }] } }];
const normal = plain(ctx.buildRecommendation({ logs, index, places, location: 'company', nowMs, today, yesterday: {} }));
assert.deepEqual(normal.groups, ['shoulder'], 'shoulder is the most rested');
const avoided = plain(ctx.buildRecommendation({ logs, index, places, location: 'company', nowMs, today, yesterday: {}, avoid: ['shoulder'] }));
assert.ok(!avoided.groups.includes('shoulder'));
assert.ok(avoided.items.every(i => !ctx.touchesAvoided(keyMap.get(i.key), ['shoulder'])), 'no shoulder-using exercise');
assert.ok(!avoided.supplement || !ctx.touchesAvoided(keyMap.get(avoided.supplement.key), ['shoulder']));
assert.deepEqual(avoided.avoid, ['shoulder']);
const forced = plain(ctx.buildRecommendation({ logs, index, places, location: 'company', nowMs, today, yesterday: {}, groups: ['shoulder', 'legs'], avoid: ['shoulder'] }));
assert.deepEqual(forced.groups, ['legs'], 'chosen parts minus avoided');
const pairStatus = [{ key: 'legs', ready: true, days: 8 }, { key: 'chest', ready: true, days: 2 }];
assert.deepEqual(plain(ctx.chooseFocusGroups(pairStatus, 60).groups), ['legs'], 'pair not added when its status is unknown (filtered out)');
pass('avoided parts: not chosen, no exercise or supplement using them, removed from chosen parts');

// 3. 화면 연결
const checks = [
  ['one-line input on the card', /data-talk-input/],
  ['rules first, AI only when nothing matched', /let parsed = parseWorkoutText\(text\);[\s\S]*if \(!parsed\.matched\) \{[\s\S]*callAI\('workoutCoach', \{ mode: 'parse', text \}, controller\.signal\)/],
  ['AI reading also gives up after the wait limit', /const timer = setTimeout\(\(\) => controller\.abort\(\), COACH_COMMENT_TIMEOUT_MS\);\n\s*try \{\n\s*const res = await callAI\('workoutCoach', \{ mode: 'parse'/],
  ['applied values shown as chips with undo', /data-talk-chips[\s\S]*data-talk-undo/],
  ['undo restores previous buttons and place', /return \{ \.\.\.s, location: b\.location, reco: \{ \.\.\.rest, minutes: b\.minutes, condition: b\.condition, groups: b\.groups, avoid: b\.avoid \} \};/],
  ['avoid notice', /운동은 뺐어요\. 아프면 무리하지 마세요\./],
  ['coach comment only when starting from the recommendation', /window\.scrollTo\(0, 0\);\n\s*requestCoachComment\(\);/],
  ['comment waits at most 15 seconds', /const COACH_COMMENT_TIMEOUT_MS = 15000;[\s\S]*setTimeout\(\(\) => controller\.abort\(\), COACH_COMMENT_TIMEOUT_MS\)/],
  ['comment failure does not stop the workout', /catch \{ \/\* 한마디 없이 운동은 그대로 \*\/ \}/],
  ['comment saved in plan and shown while working out', /plan: \{ \.\.\.s\.plan, comment \}[\s\S]*data-coach-comment/],
  ['sets sent to the AI as weight and reps words with a set count', /`\$\{x\.weight\}kg \$\{x\.reps\}회`[\s\S]{0,200}const setsText = `\$\{r\.sets\.length\}세트/],
  ['no profile data sent with the plan', /const plan = \{\n\s*place: session\.location, minutes: reco\.minutes/],
];
for (const [name, re] of checks) { assert.match(html, re, name); pass(name); }
assert.ok(!/callAI\('workoutCoach'[^)]*username|callAI\('workoutCoach'[^)]*disease/.test(html));

console.log(`\n${passed} passed`);
