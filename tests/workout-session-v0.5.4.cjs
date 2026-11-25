// v0.5.4 헬스 기록 도우미 검사: node tests/workout-session-v0.5.4.cjs [index_v0.5.4.html] [exercise_library_v1.json]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.5.4.html');
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
assert.ok(start > 0 && end > start, 'helpers found');
assert.ok(!/<[A-Za-z][^>]*>/.test(html.slice(start, end).replace(/\/\/.*$/gm, '').replace(/'[^'\n]*'|`[^`]*`/g, '')), 'helper block has no JSX');
const ctx = {};
vm.createContext(ctx);
new vm.Script(html.slice(partsStart, partsEnd) + html.slice(start, end) + `
;Object.assign(globalThis, { buildExerciseIndex, exerciseInputKind, restSecondsFor, exerciseSetHistory, pickLastSets, makeSessionItem,
  recentWorkoutSessions, formatSessionSet, setHasValue, buildWorkoutLog, sessionFromLog, isCoachLog, libraryKeyMap, exerciseDetailLines });`).runInContext(ctx);
const index = ctx.buildExerciseIndex(lib);
const byKey = ctx.libraryKeyMap(index);
const E = (k) => byKey.get(k);

// 1. 입력 방식과 쉬는 시간(큰 종목 80초, 나머지 60초)
assert.equal(ctx.exerciseInputKind(E('barbell-bench-press')), 'weight');
assert.equal(ctx.exerciseInputKind(E('pull-up')), 'reps');
assert.equal(ctx.exerciseInputKind(E('weighted-pull-up')), 'weight');
assert.equal(ctx.exerciseInputKind(E('plank')), 'hold');
assert.equal(ctx.exerciseInputKind(E('push-up')), 'reps');
for (const k of ['barbell-squat', 'deadlift', 'barbell-bench-press', 'barbell-row', 'leg-press', 'seated-dumbbell-shoulder-press', 'pull-up', 'romanian-deadlift'])
  assert.equal(ctx.restSecondsFor(E(k)), 80, k);
for (const k of ['dumbbell-lateral-raise', 'ez-bar-curl', 'cable-rope-triceps', 'leg-extension', 'cable-upright-row', 'smith-calf-raise', 'face-pull', 'crunch', 'dumbbell-fly'])
  assert.equal(ctx.restSecondsFor(E(k)), 60, k);
pass('input kinds and rest seconds (80 big / 60 others)');

// 2. 지난 기록 불러오기
const logs = [
  { log_date: '2026-11-20', log_time: '07:00:00', exercise_meta: { location: 'apartment', items: [
    { name: '랫 풀다운', sets: [{ weight: 50, reps: 10 }, { weight: 50, reps: 8 }] },
    { name: '바벨 플랫 벤치 프레스', sets: [{ weight: 62.5, reps: 8 }] }] } },
  { log_date: '2026-11-18', log_time: '07:00:00', exercise_meta: { location: 'company', items: [
    { name: '랫 풀다운', sets: [{ weight: 45, reps: 12 }] },
    { name: '바벨 플랫 벤치 프레스', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 57.5, reps: 8 }] },
    { name: '바벨 스쿼트' }] } },
  { log_date: '2026-11-10', exercise_meta: { items: [{ name: '덤벨 레터럴 레이즈', sets: [{ weight: 8, reps: 15 }] }, { name: '근력 운동', sets: [{ weight: 1, reps: 1 }] }] } },
];
const history = ctx.exerciseSetHistory(logs, index);
assert.equal(history.get('barbell-bench-press')[0].date, '2026-11-20');
assert.ok(!history.has('barbell-squat'), 'no sets, no history');
assert.equal(ctx.pickLastSets(history, E('barbell-bench-press'), 'company').date, '2026-11-20', 'barbell: latest anywhere');
assert.equal(ctx.pickLastSets(history, E('lat-pulldown'), 'company').date, '2026-11-18', 'cable: same place first');
assert.equal(ctx.pickLastSets(history, E('lat-pulldown'), 'home').date, '2026-11-20', 'cable: latest when no same place');
const item = plain(ctx.makeSessionItem(E('barbell-bench-press'), ctx.pickLastSets(history, E('barbell-bench-press'), 'company')));
assert.deepEqual(item.sets.map(s => [s.weight, s.reps, s.done]), [[62.5, 8, false]]);
assert.equal(item.lastBest, 62.5);
assert.equal(item.restSec, 80);
const fresh = plain(ctx.makeSessionItem(E('hack-squat'), null));
assert.equal(fresh.sets.length, 3);
assert.ok(fresh.sets.every(s => s.weight == null && !s.done));
pass('last sets: whole previous sets, machines prefer same place, new exercise has 3 empty sets');

// 3. 최근 운동 그대로
const recent = plain(ctx.recentWorkoutSessions(logs, index, 3));
assert.deepEqual(recent.map(r => [r.date, r.keys.length]), [['2026-11-20', 2], ['2026-11-18', 3], ['2026-11-10', 1]]);
assert.deepEqual(recent[0].parts, ['등', '가슴']);
pass('recent sessions list date, parts and exercises');

// 4. 저장 줄 만들기(칼로리 없음, 체크한 세트만)
const session = {
  version: 1, stage: 'run', location: 'company', startedAt: '2026-11-25T10:00:00.000Z', date: '2026-11-25', time: '19:00', rating: 'ok', skippedToday: ['smith-calf-raise'],
  items: [
    { ...plain(ctx.makeSessionItem(E('barbell-bench-press'), ctx.pickLastSets(history, E('barbell-bench-press'), 'company'))),
      sets: [{ weight: 65, reps: 8, done: true }, { weight: 65, reps: 6, done: true, failed: true }, { weight: 65, reps: 6, done: false }] },
    { ...plain(ctx.makeSessionItem(E('pull-up'), null)), sets: [{ reps: 5, done: true }, { reps: 4, done: true }] },
    { ...plain(ctx.makeSessionItem(E('plank'), null)), sets: [{ seconds: 60, done: true }] },
    { ...plain(ctx.makeSessionItem(E('leg-extension'), null)), sets: [{ weight: 30, reps: 12, done: false }] },
  ],
};
const row = plain(ctx.buildWorkoutLog(session, Date.parse('2026-11-25T10:52:00.000Z')));
assert.equal(row.category, '운동');
assert.equal(row.log_date, '2026-11-25');
assert.equal(row.log_time, '19:00:00');
assert.equal(row.food_name, '회사 · 가슴·등·코어 52분');
assert.deepEqual(row.ingredients, ['바벨 플랫 벤치 프레스: 65kg×8, 65kg×6', '풀업: 5회, 4회', '플랭크: 60초']);
assert.equal(row.analysis, '가슴·등·코어 3종목 5세트 · 바벨 플랫 벤치 프레스 최고 65kg×8 (지난번 +2.5kg) · 적당했어요');
assert.ok(!/칼로리|kcal/i.test(JSON.stringify(row)), 'no calories');
const meta = row.exercise_meta;
assert.equal(meta.version, 2); assert.equal(meta.detailVersion, 2); assert.equal(meta.detailSource, 'coach'); assert.equal(meta.location, 'company');
assert.deepEqual(meta.session, { startedAt: '2026-11-25T10:00:00.000Z', endedAt: '2026-11-25T10:52:00.000Z', minutes: 52, rating: 'ok', failedSets: 1, skippedToday: ['smith-calf-raise'] });
assert.deepEqual(meta.items[0].sets, [{ weight: 65, unit: 'kg', reps: 8, seconds: null }, { weight: 65, unit: 'kg', reps: 6, seconds: null, failed: true }]);
assert.deepEqual(meta.items[2].sets, [{ weight: null, unit: 'kg', reps: null, seconds: 60 }]);
assert.deepEqual(meta.items.map(i => i.targets[0]), ['chest.mid_chest', E('pull-up').targets[0], E('plank').targets[0]]);
// 기존 카드 줄 함수가 그대로 읽는다
assert.deepEqual(plain(ctx.exerciseDetailLines(meta)).map(l => l.name), ['바벨 플랫 벤치 프레스', '풀업', '플랭크']);
pass('workout row: only checked sets, title, lines, summary, meta v2 with location and session, no calories');

// 5. 고치기
const back = plain(ctx.sessionFromLog({ id: 'L1', date: row.log_date, time: '19:00', category: '운동', exerciseMeta: meta }, byKey));
assert.equal(back.editLogId, 'L1'); assert.equal(back.stage, 'run'); assert.equal(back.location, 'company'); assert.equal(back.rating, 'ok');
assert.deepEqual(back.items.map(i => [i.key, i.input, i.sets.length, i.sets.every(s => s.done)]), [['barbell-bench-press', 'weight', 2, true], ['pull-up', 'reps', 2, true], ['plank', 'hold', 1, true]]);
assert.equal(back.items[0].sets[1].failed, true);
const again = plain(ctx.buildWorkoutLog(back, Date.parse(back.editEndedAt)));
assert.deepEqual(again.ingredients, row.ingredients, 'edit keeps lines');
assert.equal(again.food_name, row.food_name, 'edit keeps duration');
assert.ok(ctx.isCoachLog({ exerciseMeta: meta }) && !ctx.isCoachLog({ exerciseMeta: { detailSource: 'image' } }));
pass('coach logs reopen as checked sets and save back unchanged');

// 6. 화면 연결
const checks = [
  ['start button', /data-workout-start/],
  ['last place remembered', /localStorage\.setItem\('workoutLastPlace', session\.location\)/],
  ['session kept on the phone per user', /'workoutSession:' \+ session\.user\.id/],
  ['rest alarm vibrates', /navigator\.vibrate\(\[200, 100, 200\]\)/],
  ['sound unlocked on tap', /unlockWorkoutAudio\(\);\n\s*updateSet\(idx, setIdx, \{ done: !st\.done \}\)/],
  ['screen kept on while running', /navigator\.wakeLock\.request\('screen'\)/],
  ['banner on other tabs', /workoutSession && activeTab !== 'workout' && <WorkoutBanner/],
  ['insert own row without AI', /sb\.from\('logs'\)\.insert\(\{ \.\.\.row, user_id: session\.user\.id \}\)/],
  ['edit updates own row', /sb\.from\('logs'\)\.update\(row\)\.eq\('id', ws\.editLogId\)\.eq\('user_id', session\.user\.id\)/],
  ['coach logs edit in workout tab', /if \(log\.category === '운동' && isCoachLog\(log\)\)/],
  ['duplicate warning', /data-duplicate-warning/],
  ['today only keeps place list', /skippedToday: forever \? \(s\.skippedToday \|\| \[\]\) : \[\.\.\.\(s\.skippedToday \|\| \[\]\), item\.key\]/],
  ['remove forever edits place list', /if \(forever\) onSavePlaces\(\{ \.\.\.places, \[session\.location\]: placeKeys\.filter\(k => k !== item\.key\) \}\)/],
  ['added exercise joins place list with undo', /if \(ok\) setUndo\(\{ key, place: session\.location \}\)/],
  ['dumbbell is one-hand weight', /item\.equipment === 'dumbbell' \? '한 손 무게 · '/],
  ['records include time', /select\('log_date, log_time, ingredients, exercise_meta'\)/],
  ['setup starts from existing lists', /const hasLists = setupDone \|\| current\.company\.length > 0 \|\| current\.apartment\.length > 0;/],
];
for (const [name, re] of checks) { assert.match(html, re, name); pass(name); }

console.log(`\n${passed} passed`);
