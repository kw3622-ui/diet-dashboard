// v0.5.3 사전 확장·기록에서 찾은 새 운동 검사: node tests/workout-discover-v0.5.3.cjs [index_v0.5.3.html] [exercise_library_v1.json]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.5.3.html');
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
const ctx = {};
vm.createContext(ctx);
new vm.Script(html.slice(partsStart, partsEnd) + html.slice(start, end) + `
;Object.assign(globalThis, { normalizeExerciseKey, buildExerciseIndex, sanitizeWorkoutPlaces, collectRecordedExercises, discoverExercises,
  customEntries, mergeCustomLibrary, homeExercisesFor, groupExercisesByPart, missingSubParts, searchExerciseLibrary, HOME_EQUIPMENT_OPTIONS });`).runInContext(ctx);

// 1. 사전 확장
const PARTS = { chest: ['upper_chest', 'mid_chest', 'lower_chest'], back: ['lat', 'mid_back', 'lower_back'], shoulder: ['front_delt', 'side_delt', 'rear_delt'], arm: ['biceps', 'triceps'], legs: ['quads', 'hamstrings', 'glutes', 'calves'], core: ['abs', 'obliques'] };
assert.ok(lib.exercises.length >= 160, 'library has ' + lib.exercises.length);
const seenNames = new Map();
for (const e of lib.exercises) {
  for (const t of e.targets) { const [p, s] = t.split('.'); assert.ok(PARTS[p] && (!s || PARTS[p].includes(s)), 'target ' + e.key); }
  assert.ok(lib.equipmentLabels[e.equipment], 'equipment ' + e.key);
  for (const n of [e.name, ...(e.aliases || [])]) {
    const k = ctx.normalizeExerciseKey(n);
    assert.ok(!seenNames.has(k) || seenNames.get(k) === e.key, `name "${n}" used by ${seenNames.get(k)} and ${e.key}`);
    seenNames.set(k, e.key);
  }
}
for (const k of ['kettlebell', 'parallel_bars', 'ab_wheel']) assert.ok(lib.equipmentLabels[k], k);
pass(`library grew to ${lib.exercises.length} entries, names unique, labels for new equipment`);

const index = ctx.buildExerciseIndex(lib);
for (const [raw, key] of [
  ['케틀벨 스윙', 'kettlebell-swing'], ['RDL', 'romanian-deadlift'], ['펙덱', 'pec-deck'], ['버터플라이', 'pec-deck'], ['스컬 크러셔', 'skull-crusher'],
  ['시티드 레그 컬', 'seated-leg-curl'], ['힙 어브덕션', 'hip-abduction'], ['윗몸일으키기', 'sit-up'], ['AB 슬라이드', 'ab-wheel'],
  // 예전 이름은 예전 종목 그대로
  ['V-bar 랫 풀다운', 'v-bar-lat-pulldown'], ['케이블 푸시다운', 'cable-rope-triceps'], ['프론트 레이즈', 'cable-front-raise'],
]) assert.equal(index.get(ctx.normalizeExerciseKey(raw))?.key, key, raw);
const search = (q) => plain(ctx.searchExerciseLibrary(lib, q, [])).map(e => e.key);
assert.ok(search('케틀').includes('kettlebell-swing'));
assert.ok(search('레그 컬').includes('seated-leg-curl') && search('레그 컬').includes('lying-leg-curl'));
pass('new names are found, old record names keep their entries, short search works');

// 2. 집 장비
assert.deepEqual(plain(ctx.HOME_EQUIPMENT_OPTIONS).map(([k]) => k), ['pullup_bar', 'dumbbell', 'band', 'kettlebell', 'ab_wheel']);
assert.ok(ctx.homeExercisesFor(lib, ['kettlebell']).some(e => e.key === 'kettlebell-swing'));
assert.ok(!ctx.homeExercisesFor(lib, []).some(e => e.equipment === 'kettlebell'));
pass('home equipment includes kettlebell and ab wheel');

// 3. 직접 추가한 종목 저장 값
const saved = plain(ctx.sanitizeWorkoutPlaces({
  company: ['custom:랜드마인 프레스'],
  customExercises: {
    'custom:랜드마인 프레스': { name: '랜드마인 프레스', targets: ['shoulder.front_delt', 'chest.upper_chest', 'x.y', 'legs'], equipment: 'barbell' },
    'custom:엉터리': { name: '', targets: [] },
    'deadlift': { name: '가짜', targets: [] },
    'custom:이상한 장비': { name: '이상한 장비', targets: ['core.abs'], equipment: 'rocket' },
  },
  ignored: ['custom:해당 없음', 7],
}));
assert.deepEqual(saved.customExercises, {
  'custom:랜드마인 프레스': { name: '랜드마인 프레스', targets: ['shoulder.front_delt', 'chest.upper_chest'], equipment: 'barbell' },
  'custom:이상한 장비': { name: '이상한 장비', targets: ['core.abs'], equipment: 'bodyweight' },
});
assert.deepEqual(saved.ignored, ['custom:해당 없음']);
assert.ok(!('customExercises' in plain(ctx.sanitizeWorkoutPlaces({ company: [] }))), 'empty extras are not stored');
pass('custom exercises and ignored names are cleaned');

// 4. 직접 추가한 종목이 사전처럼 쓰인다
const merged = ctx.mergeCustomLibrary(lib, saved);
assert.equal(merged.exercises.length, lib.exercises.length + 2);
const mIndex = ctx.buildExerciseIndex(merged);
assert.equal(mIndex.get(ctx.normalizeExerciseKey('랜드마인 프레스 3세트'))?.key, 'custom:랜드마인 프레스');
const byKey = new Map(merged.exercises.map(e => [e.key, e]));
assert.equal(plain(ctx.groupExercisesByPart(['custom:랜드마인 프레스'], k => byKey.get(k)))[0].key, 'shoulder');
assert.ok(!ctx.missingSubParts([byKey.get('custom:랜드마인 프레스')]).some(m => m.target === 'shoulder.front_delt'));
assert.ok(ctx.homeExercisesFor(merged, []).some(e => e.key === 'custom:이상한 장비'), 'bodyweight custom goes to home');
pass('custom exercises join groups, missing parts, record matching and home');

// 5. 기록에서 찾은 새 운동
const logs = [
  { log_date: '2026-11-20', exercise_meta: { items: [
    { name: '랜드마인 로우 3세트', kind: 'strength' }, { name: '케틀벨 스윙', kind: 'strength' }, { name: '해당 없음', kind: 'strength' },
    { name: '코어 근육을 활용한 균형 잡기', kind: 'strength' }, { name: '최고 중량', kind: 'strength' }, { name: '보행', kind: 'cardio' },
    { name: '아주아주아주아주아주아주긴 이름의 운동입니다', kind: 'strength' }, { name: '랜드마인 프레스', kind: 'strength' }, { name: '프로울러 푸시', kind: 'strength' }] } },
];
const found = plain(ctx.discoverExercises(logs, index, null)).map(r => r.key);
assert.deepEqual(found.sort(), ['custom:랜드마인 로우', 'custom:랜드마인 프레스', 'custom:프로울러 푸시'].sort());
assert.deepEqual(plain(ctx.discoverExercises(logs, mIndex, { ...saved, ignored: ['custom:프로울러 푸시'] })).map(r => r.key), ['custom:랜드마인 로우'],
  'added custom and ignored names are gone');
pass('discover shows one-off unknown names but not library, custom, ignored or sentence-like names');

// 6. 화면 연결
const checks = [
  ['tab merges custom library', /const library = hasCustom \? mergeCustomLibrary\(exerciseLib\?\.library, places\)/],
  ['records loaded once for discover', /loadRecords\(\)\.then\(logs => \{ if \(alive\) setAllLogs\(logs\); \}\)/],
  ['discover card on main', /data-discover-card/],
  ['save needs a part', /disabled=\{saving \|\| draft\.targets\.length === 0\}/],
  ['custom saved with place lists', /customExercises: \{ \.\.\.\(current\.customExercises \|\| \{\}\), \[d\.key\]: \{ name: d\.name, targets: d\.targets, equipment: d\.equipment \} \}/],
  ['not an exercise hides it', /ignored: \[\.\.\.\(current\.ignored \|\| \[\]\), r\.key\]/],
  ['hidden names can come back', /save\(\{ \.\.\.current, ignored: \[\] \}\)/],
  ['custom names link to youtube', /data-custom-exercise/],
];
for (const [name, re] of checks) { assert.match(html, re, name); pass(name); }

console.log(`\n${passed} passed`);
