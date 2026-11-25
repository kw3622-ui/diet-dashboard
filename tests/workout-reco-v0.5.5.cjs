// v0.5.5 헬스 추천(규칙) 검사: node tests/workout-reco-v0.5.5.cjs [index_v0.5.5.html] [exercise_library_v1.json]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.5.5.html');
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
;Object.assign(globalThis, { buildExerciseIndex, libraryKeyMap, exerciseSetHistory, recoveryStatus, consecutiveWorkoutDays, chooseFocusGroups,
  weightStepFor, progressSets, pickGroupExercises, supplementSuggestion, weeklyCardioMinutes, buildRecommendation, buildWorkoutLog });`).runInContext(ctx);
const index = ctx.buildExerciseIndex(lib);
const keyMap = ctx.libraryKeyMap(index);
const E = (k) => keyMap.get(k);
const today = '2026-11-26';
const nowMs = Date.parse('2026-11-26T19:00:00');
const coach = (date, location, items, rating = 'ok') => ({ log_date: date, log_time: '19:00:00', exercise_meta: { detailSource: 'coach', location, session: { rating }, items } });
const capture = (date, items) => ({ log_date: date, log_time: '07:00:00', exercise_meta: { items } });
const S = (w, r, extra = {}) => ({ weight: w, reps: r, ...extra });

// 1. 회복 상태
const logs1 = [
  capture('2026-11-25', [{ name: '바벨 플랫 벤치 프레스', sets: [S(60, 8), S(60, 8), S(60, 8)] }]), // 가슴 어제(<48h) → 회복 중
  capture('2026-11-25', [{ name: '이지바 바이셉 컬', sets: [S(18, 12)] }]),                         // 이두 어제 07시 → 36시간 ≥ 24h → 준비
  capture('2026-11-18', [{ name: '바벨 스쿼트', sets: [S(60, 5)] }]),                                // 하체 8일 전
  coach('2026-11-24', 'company', [{ key: 'lat-pulldown', name: '랫 풀다운', targets: ['back.lat'], sets: Array.from({ length: 9 }, () => S(50, 10)) }]), // 등 9세트 → 72h
];
const status = Object.fromEntries(plain(ctx.recoveryStatus(logs1, index, nowMs, today)).map(s => [s.key, s]));
assert.equal(status.chest.ready, false); assert.equal(status.chest.days, 1);
assert.equal(status.biceps.ready, true);
assert.equal(status.legs.ready, true); assert.equal(status.legs.days, 8);
assert.equal(status.back.ready, false, 'heavy day adds 24h');
assert.equal(status.core.days, null);
pass('recovery: big 48h, small 24h, +24h after 8+ sets or hard');

// 2. 부위 고르기: 한 부위 기본, 60분 이상이면 짝
assert.deepEqual(plain(ctx.chooseFocusGroups(plain(ctx.recoveryStatus(logs1, index, nowMs, today)), 45).groups), ['legs']);
assert.deepEqual(plain(ctx.chooseFocusGroups(plain(ctx.recoveryStatus(logs1, index, nowMs, today)), 60).groups), ['legs', 'shoulder']);
pass('focus: most rested ready part, pair only from 60 minutes');

// 3. 무게 단계와 올림/유지/낮춤
assert.equal(ctx.weightStepFor(E('dumbbell-lateral-raise'), 'company'), 2);
assert.equal(ctx.weightStepFor(E('dumbbell-lateral-raise'), 'apartment'), 1);
assert.equal(ctx.weightStepFor(E('lat-pulldown'), 'company'), 5);
assert.equal(ctx.weightStepFor(E('leg-press'), 'company'), 5);
assert.equal(ctx.weightStepFor(E('barbell-squat'), 'company'), 2.5);
const prog = (logs, key, loc = 'company', opts = {}) => plain(ctx.progressSets(ctx.exerciseSetHistory(logs, index), E(key), loc, opts));
const benchUp = prog([coach('2026-11-20', 'company', [{ key: 'barbell-bench-press', name: '바벨 플랫 벤치 프레스', plannedSets: 2, sets: [S(60, 8), S(57.5, 8)] }])], 'barbell-bench-press');
assert.equal(benchUp.change, 'up'); assert.deepEqual(benchUp.sets.map(s => s.weight), [62.5, 60]);
const dbUpApt = prog([coach('2026-11-20', 'apartment', [{ key: 'dumbbell-lateral-raise', name: '덤벨 레터럴 레이즈', plannedSets: 1, sets: [S(8, 15)] }])], 'dumbbell-lateral-raise', 'apartment');
assert.deepEqual(dbUpApt.sets.map(s => s.weight), [9]);
assert.equal(prog([coach('2026-11-20', 'company', [{ key: 'barbell-bench-press', name: 'x', plannedSets: 2, sets: [S(60, 8), S(60, 5, { failed: true })] }])], 'barbell-bench-press').change, 'hold');
assert.match(prog([coach('2026-11-20', 'company', [{ key: 'barbell-bench-press', name: 'x', plannedSets: 4, sets: [S(60, 8), S(60, 8)] }])], 'barbell-bench-press').reason, /덜 해서 유지/);
assert.match(prog([capture('2026-11-20', [{ name: '바벨 플랫 벤치 프레스', sets: [S(60, 8)] }])], 'barbell-bench-press').reason, /평가 없음/);
const hardTwice = prog([
  coach('2026-11-20', 'company', [{ key: 'barbell-squat', name: 'x', plannedSets: 1, sets: [S(100, 5)] }], 'hard'),
  coach('2026-11-17', 'company', [{ key: 'barbell-squat', name: 'x', plannedSets: 1, sets: [S(100, 5)] }], 'hard'),
], 'barbell-squat');
assert.equal(hardTwice.change, 'down'); assert.equal(hardTwice.sets[0].weight, 90);
const drunk = prog([coach('2026-11-20', 'company', [{ key: 'barbell-bench-press', name: 'x', plannedSets: 3, sets: [S(60, 8), S(60, 8), S(60, 8)] }])], 'barbell-bench-press', 'company', { alcohol: true });
assert.equal(drunk.change, 'hold'); assert.equal(drunk.sets.length, 2); assert.equal(drunk.sets[0].weight, 60);
const pullUp = prog([coach('2026-11-20', 'company', [{ key: 'pull-up', name: '풀업', plannedSets: 2, sets: [{ reps: 5 }, { reps: 4 }] }])], 'pull-up');
assert.deepEqual(pullUp.sets.map(s => s.reps), [6, 5]);
assert.equal(prog([], 'barbell-bench-press').change, 'new');
pass('progression: steps by equipment and place, up / hold (fail, less, old, alcohol -1 set) / down 10% / new');

// 4. 전체 추천
const places = { company: ['barbell-squat', 'leg-press', 'leg-extension', 'lying-leg-curl', 'dumbbell-lateral-raise', 'dumbbell-side-bend', 'barbell-bench-press'], apartment: [] };
const logs4 = [
  coach('2026-11-18', 'company', [
    { key: 'barbell-squat', name: '바벨 스쿼트', targets: ['legs.quads'], plannedSets: 3, sets: [S(80, 5), S(80, 5), S(80, 5)] },
    { key: 'leg-extension', name: '레그 익스텐션', targets: ['legs.quads'], plannedSets: 3, sets: [S(30, 12), S(30, 12), S(30, 12)] },
    { key: 'lying-leg-curl', name: '라잉 레그 컬', targets: ['legs.hamstrings'], plannedSets: 3, sets: [S(25, 12), S(25, 12), S(25, 12)] }]),
  coach('2026-11-25', 'company', [{ key: 'barbell-bench-press', name: '바벨 플랫 벤치 프레스', targets: ['chest.mid_chest'], plannedSets: 3, sets: [S(60, 8), S(60, 8), S(60, 8)] },
    { name: '트레드밀 러닝', kind: 'cardio', minutes: 25 }]),
  capture('2026-11-24', [{ name: '보행', kind: 'cardio', minutes: 40 }]),
];
const reco = plain(ctx.buildRecommendation({ logs: logs4, index, places, location: 'company', minutes: 45, nowMs, today, yesterday: {} }));
assert.deepEqual(reco.groups, ['legs']);
assert.equal(reco.items[0].key, 'barbell-squat', 'big lift that is often done comes first');
assert.ok(reco.items.every(i => keyMap.get(i.key).targets[0].startsWith('legs')));
assert.equal(reco.items.find(i => i.key === 'barbell-squat').sets[0].weight, 82.5);
assert.ok(reco.minutesPlanned <= 45);
// 4주 0회인 세부 부위 중 앞 순서(어깨·측면)부터, 그 장소에 종목이 있는 것
assert.equal(reco.supplement.key, 'dumbbell-lateral-raise');
assert.match(reco.supplement.reason, /편식 보충 · 어깨·측면 4주간 0회/);
assert.deepEqual(reco.cardio, { minutes: 65, goal: 90 });
const tired = plain(ctx.buildRecommendation({ logs: logs4, index, places, location: 'company', minutes: 45, condition: 'tired', nowMs, today, yesterday: {} }));
assert.ok(tired.minutesPlanned <= 45 * 0.75 && tired.items.length <= reco.items.length, 'tired plan is not longer');
const forced = plain(ctx.buildRecommendation({ logs: logs4, index, places, location: 'company', groups: ['shoulder'], nowMs, today, yesterday: { alcohol: true, lateNight: true } }));
assert.deepEqual(forced.groups, ['shoulder']); assert.equal(forced.items[0].key, 'dumbbell-lateral-raise');
assert.equal(forced.alcohol, true); assert.equal(forced.lateNight, true);
const rest = plain(ctx.buildRecommendation({ logs: [capture('2026-11-25', []), capture('2026-11-24', []), capture('2026-11-23', [])], index, places, location: 'company', nowMs, today, yesterday: {} }));
assert.equal(rest.restSuggest, true);
assert.equal(ctx.consecutiveWorkoutDays([capture('2026-11-25', []), capture('2026-11-23', [])], today), 1);
pass('recommendation: part, order, raised weights, time budget, supplement, cardio, tired, forced part, alcohol, rest days');

// 5. 저장에 추천 내용
const session = { location: 'company', startedAt: '2026-11-26T10:00:00.000Z', date: today, time: '19:00', plan: { groups: ['legs'], auto: true, minutes: 45, items: [{ key: 'barbell-squat', change: 'up', reason: '지난번 다 성공 · +2.5kg' }] },
  items: [{ key: 'barbell-squat', name: '바벨 스쿼트', input: 'weight', equipment: 'barbell', targets: ['legs.quads'], sets: [{ weight: 82.5, reps: 5, done: true }] }] };
const row = plain(ctx.buildWorkoutLog(session, Date.parse('2026-11-26T10:30:00.000Z')));
assert.deepEqual(row.exercise_meta.session.plan.groups, ['legs']);
pass('saved log keeps the plan');

// 6. 화면 연결
const checks = [
  ['recommendation card', /data-reco-card/],
  ['hooks are not inside a stage branch', /const recommendation = React\.useMemo\([\s\S]*?\n      if \(session\.stage === 'pick'\) \{/],
  ['yesterday alcohol and late night loaded for own logs', /select\('category, is_alcohol'\)\.eq\('user_id', session\.user\.id\)\.eq\('log_date', day\)/],
  ['minutes default 40, -10/+10 within 20~120', /const RECO_DEFAULT_MINUTES = 40;\n\s*const RECO_MINUTES_STEP = 10;\n\s*const RECO_MIN_MINUTES = 20;\n\s*const RECO_MAX_MINUTES = 120;/],
  ['minus and plus buttons around the minutes', /data-reco-minus[\s\S]{0,400}data-reco-minute-value[\s\S]{0,600}data-reco-plus/],
  ['condition buttons', /data-reco-cond=\{v\}/],
  ['start from recommendation', /onClick=\{startFromReco\} data-reco-start/],
  ['reason shown while working out', /data-item-reason/],
  ['supplement can be turned off', /편식 보충 1종목 넣기/],
];
for (const [name, re] of checks) { assert.match(html, re, name); pass(name); }

console.log(`\n${passed} passed`);
