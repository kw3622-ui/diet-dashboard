// v0.5.0 운동 세트·유산소 숫자 화면 검사: node tests/exercise-details-ui-v0.5.0.cjs [index_v0.5.0.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.5.0.html');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };

const checks = [
  ['unread count uses detailVersion', /\.is\('exercise_meta->>detailVersion', null\)/],
  ['unread count only for classified records', /\.eq\('category', '운동'\)\.not\('exercise_meta', 'is', null\)\.is\('exercise_meta->>detailVersion', null\)/],
  ['backfill uses server action', /callAI\('readExerciseDetails', \{\}\)/],
  ['backfill loop stops when nothing processed', /setUnreadExerciseDetailCount\(res\.remaining \|\| 0\);\s*if \(!res\.remaining \|\| !res\.processed\) break;/],
  ['backfill is a user button', /onClick=\{handleReadExerciseDetails\}/],
  ['backfill row waits for part classification', /unclassifiedExerciseCount === 0 && unreadExerciseDetailCount > 0/],
  ['backfill row says AI is used once', /캡처 사진에서 한 번만 읽어요\(AI 사용\)/],
  ['AI failure handled like other actions', /handleAiFailure\(err, handleReadExerciseDetails\)/],
  ['detail lines only on exercise cards', /\{isEx && exerciseDetailLines\(log\.exerciseMeta\)\.length > 0 && \(/],
  ['detail box marker', /data-exercise-details/],
  ['old classify flow kept', /callAI\('classifyExercises', \{\}\)/],
];
for (const [name, re] of checks) { assert.match(html, re, name); pass(name); }

const start = html.indexOf('const formatExerciseSet = (s) => {');
const end = html.indexOf('// ★ v0.3.8 항목별 근거');
assert.ok(start > 0 && end > start, 'detail helpers found');
const ctx = {};
vm.createContext(ctx);
new vm.Script(html.slice(start, end) + '\n;Object.assign(globalThis, { formatExerciseSet, exerciseDetailLines });').runInContext(ctx);
const plain = (v) => JSON.parse(JSON.stringify(v));

assert.equal(ctx.formatExerciseSet({ weight: 60, unit: 'kg', reps: 8 }), '60kg×8');
assert.equal(ctx.formatExerciseSet({ weight: 20, unit: 'lb', seconds: 30 }), '20lb·30초');
assert.equal(ctx.formatExerciseSet({ weight: null, reps: 7 }), '7회');
assert.equal(ctx.formatExerciseSet({ seconds: 45 }), '45초');
assert.equal(ctx.formatExerciseSet({}), '');
pass('set text');

const lines = plain(ctx.exerciseDetailLines({ items: [
  { name: '바벨 벤치 프레스', kind: 'strength', sets: [{ weight: 60, unit: 'kg', reps: 8 }, { weight: 55, unit: 'kg', reps: 10 }] },
  { name: '밴드 풀 업', kind: 'strength', sets: [{ weight: null, reps: 7 }, { weight: null, reps: 6 }] },
  { name: '트레드밀 러닝', kind: 'cardio', minutes: 41, distanceKm: 5.3, paceSecPerKm: 462, avgHeartRate: 130 },
  { name: '보행', kind: 'cardio', minutes: 40 },
  { name: '랫 풀 다운', kind: 'strength', targets: ['back.lat'] },
] }));
assert.deepEqual(lines, [
  { name: '바벨 벤치 프레스', text: '60kg×8 · 55kg×10' },
  { name: '밴드 풀 업', text: '7회 · 6회' },
  { name: '트레드밀 러닝', text: `5.3km · 41분 · 7'42"/km · 130bpm` },
]);
assert.deepEqual(plain(ctx.exerciseDetailLines(null)), []);
assert.deepEqual(plain(ctx.exerciseDetailLines({ version: 1, items: [{ name: '보행', kind: 'cardio', minutes: 40 }] })), [], 'old records show nothing new');
pass('detail lines per exercise');

console.log(`\n${passed} passed`);
