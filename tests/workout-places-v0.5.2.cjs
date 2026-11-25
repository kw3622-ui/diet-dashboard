// v0.5.2 장소 설정 검사: node tests/workout-places-v0.5.2.cjs [index_v0.5.2.html] [exercise_library_v1.json]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.5.2.html');
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
assert.ok(start > 0 && end > start && partsStart > 0, 'helpers found');
const ctx = {};
vm.createContext(ctx);
new vm.Script(html.slice(partsStart, partsEnd) + html.slice(start, end) + `
;Object.assign(globalThis, { buildExerciseIndex, sanitizeWorkoutPlaces, emptyWorkoutPlaces, collectRecordedExercises, applyPlaceChoices,
  choiceFromPlaces, homeExercisesFor, placeExerciseName, searchExerciseLibrary, groupExercisesByPart, shortTargetLabels, missingSubParts });`).runInContext(ctx);
const index = ctx.buildExerciseIndex(lib);

// 1. 저장 값 정리
assert.equal(ctx.sanitizeWorkoutPlaces(null), null);
assert.equal(ctx.sanitizeWorkoutPlaces([]), null);
assert.deepEqual(plain(ctx.sanitizeWorkoutPlaces({ company: ['deadlift', 'deadlift', 3, ''], apartment: 'x', homeEquipment: ['pullup_bar', 'rocket'], setupDone: 'yes', extra: 1 })),
  { version: 1, company: ['deadlift'], apartment: [], homeEquipment: ['pullup_bar'], setupDone: false });
assert.equal(ctx.sanitizeWorkoutPlaces({ company: Array.from({ length: 300 }, (_, i) => 'k' + i) }).company.length, 200);
pass('saved value is cleaned');

// 2. 기록에서 종목 모으기
const logs = [
  { log_date: '2026-11-20', exercise_meta: { items: [
    { name: '밴드 풀 업: 총 25회 수행', kind: 'strength' }, { name: '밴드 풀업', kind: 'strength' },
    { name: '근력 운동', kind: 'strength' }, { name: '보행', kind: 'cardio' }, { name: '최고 중량', kind: 'strength' },
    { name: '케틀벨 스윙', kind: 'strength' }] } },
  { log_date: '2026-11-18', exercise_meta: { items: [{ name: '데드 리프트', kind: 'strength' }, { name: '케틀벨 스윙 3세트', kind: 'strength' }] } },
  { log_date: '2026-11-10', ingredients: ['밴드 풀업(6세트)', '런닝머신 2km 15분', '알 수 없는 것'] },
];
const rec = plain(ctx.collectRecordedExercises(logs, index));
assert.deepEqual(rec.map(r => [r.key, r.count, r.lastDate]), [
  ['band-pull-up', 2, '2026-11-20'],
  ['custom:케틀벨 스윙', 2, '2026-11-20'],
  ['deadlift', 1, '2026-11-18'],
]);
assert.equal(rec[0].name, '밴드 풀업');
pass('recorded strength exercises: once per log, no generic, cardio or one-off unknown names');

// 3. 처음 설정 → 장소 목록
const records = rec.map(r => ({ key: r.key }));
const placed = plain(ctx.applyPlaceChoices({ ...ctx.emptyWorkoutPlaces(), company: ['push-up', 'deadlift'], apartment: ['leg-press'] }, records,
  { 'band-pull-up': 'both', deadlift: 'company', 'custom:케틀벨 스윙': 'none' }));
assert.deepEqual(placed.company, ['push-up', 'band-pull-up', 'deadlift']);
assert.deepEqual(placed.apartment, ['leg-press', 'band-pull-up']);
assert.equal(placed.setupDone, true);
assert.deepEqual(plain(ctx.applyPlaceChoices(null, [{ key: 'deadlift' }], {})).apartment, ['deadlift'], 'default is both');
assert.equal(ctx.choiceFromPlaces(placed, 'band-pull-up'), 'both');
assert.equal(ctx.choiceFromPlaces(placed, 'deadlift'), 'company');
assert.equal(ctx.choiceFromPlaces(placed, 'leg-press'), 'apartment');
assert.equal(ctx.choiceFromPlaces(placed, 'custom:케틀벨 스윙'), 'none');
pass('setup choices become place lists and keep manually added ones');

// 4. 집 종목, 이름, 검색
const homeBase = ctx.homeExercisesFor(lib, []);
assert.ok(homeBase.length > 0 && homeBase.every(e => e.equipment === 'bodyweight' && e.kind === 'strength'));
const homeBar = ctx.homeExercisesFor(lib, ['pullup_bar']);
assert.ok(homeBar.some(e => e.key === 'pull-up') && !homeBar.some(e => e.equipment === 'dumbbell'));
pass('home exercises follow equipment');
const byKey = new Map(lib.exercises.map(e => [e.key, e]));
assert.equal(ctx.placeExerciseName('deadlift', byKey), '데드리프트');
assert.equal(ctx.placeExerciseName('custom:케틀벨 스윙', byKey), '케틀벨 스윙');
const found = plain(ctx.searchExerciseLibrary(lib, '레그 컬', [])).map(e => e.key);
assert.ok(found.includes('lying-leg-curl'));
assert.ok(!plain(ctx.searchExerciseLibrary(lib, '', ['deadlift'])).some(e => e.key === 'deadlift' || e.kind !== 'strength'));
pass('names and library search');

// 5. 부위별 묶음과 빈 부위
const groups = plain(ctx.groupExercisesByPart(['deadlift', 'barbell-bench-press', 'custom:케틀벨 스윙', 'push-up', 'nope'], k => byKey.get(k)));
const ORDER = ['chest', 'back', 'shoulder', 'arm', 'legs', 'core', 'other'];
const keysInOrder = groups.map(g => ORDER.indexOf(g.key));
assert.ok(keysInOrder.every((v, i) => v >= 0 && (i === 0 || v > keysInOrder[i - 1])), 'groups follow part order, no empty groups');
assert.ok(groups.find(g => g.key === byKey.get('deadlift').targets[0].split('.')[0]).items.includes('deadlift'), 'first target decides group');
assert.deepEqual(groups.find(g => g.key === 'other').items, ['custom:케틀벨 스윙', 'nope']);
assert.deepEqual(groups.find(g => g.key === 'chest').items.slice(0, 1), ['barbell-bench-press'], 'keeps order inside group');
assert.deepEqual(plain(ctx.shortTargetLabels({ targets: ['chest.upper_chest', 'legs', 'x.y', 'chest.upper_chest'] })), ['윗가슴', '하체']);
assert.equal(ctx.missingSubParts([]).length, 17);
const obliques = lib.exercises.filter(e => (e.targets || []).includes('core.obliques'));
assert.ok(!ctx.missingSubParts(obliques).some(m => m.target === 'core.obliques'));
assert.deepEqual(plain(ctx.missingSubParts(lib.exercises)), [], 'library covers every sub part');
const sideOnly = plain(ctx.searchExerciseLibrary(lib, '', [], 'core.obliques'));
assert.ok(sideOnly.length > 0 && sideOnly.every(e => e.targets.includes('core.obliques')));
pass('part groups, short labels, missing parts, part search');

// 5. 화면 연결
const checks = [
  ['profile reads workout_places', /workoutPlaces: sanitizeWorkoutPlaces\(data\.workout_places\)/],
  ['profile refetch reads workout_places', /workoutPlaces: sanitizeWorkoutPlaces\(freshProfile\.workout_places\)/],
  ['saves own profile only', /sb\.from\('profiles'\)\.update\(\{ workout_places: value \}\)\.eq\('id', session\.user\.id\)/],
  ['failed save rolls back', /setProfile\(p => \(\{ \.\.\.p, workoutPlaces: prev \}\)\)/],
  ['records are only mine', /\.eq\('user_id', session\.user\.id\)\.eq\('category', '운동'\)/],
  ['bottom nav has workout tab', /aria-label="운동 화면" onClick=\{\(\) => setActiveTab\('workout'\)\}/],
  ['nav grid widened', /grid \$\{showRoutines \? 'grid-cols-5' : 'grid-cols-4'\}/],
  ['no date nav on workout tab', /const hidesDateNav = isLongTermView \|\| activeTab === 'routine' \|\| activeTab === 'workout';/],
  ['no period fetch on workout tab', /else if \(activeTab !== 'routine' && activeTab !== 'workout'\)/],
  ['workout tab restorable', /\['home', 'routine', 'workout', 'status', 'analysis'\]\.includes\(saved\.activeTab\)/],
  ['tab rendered', /<WorkoutTab exerciseLib=\{exerciseLib\} places=\{profile\?\.workoutPlaces\} onSave=\{saveWorkoutPlaces\}/],
  ['names open explanation', /onClick=\{\(\) => onShowInfo\(entry\)\} data-exercise-name/],
  ['setup grouped by part', /partGroups\('setup', groupExercisesByPart\(list, r => r\.entry\)/],
  ['place list grouped by part', /partGroups\(view, groupExercisesByPart\(keys, k => byKey\.get\(k\)\)/],
  ['home list grouped by part', /partGroups\('home', groupExercisesByPart\(list, e => e\)/],
  ['missing parts open part search', /missingNotice\(keys\.map\(k => byKey\.get\(k\)\)\.filter\(Boolean\), place\.label, pickMissing\)/],
  ['home missing parts are notice only', /missingNotice\(list, '집', null\)/],
  ['search filtered by picked part', /searchExerciseLibrary\(library, query, keys, partFilter\)/],
];
for (const [name, re] of checks) { assert.match(html, re, name); pass(name); }

// 6. SQL
const sql = fs.readFileSync(path.resolve(__dirname, '..', 'workout_places_v0.5.2.sql'), 'utf8');
const rollback = fs.readFileSync(path.resolve(__dirname, '..', 'workout_places_v0.5.2_rollback.sql'), 'utf8');
assert.match(sql, /add column if not exists workout_places jsonb/);
assert.match(sql, /jsonb_typeof\(workout_places\) = 'object' and pg_column_size\(workout_places\) <= 32768/);
assert.match(rollback, /drop column if exists workout_places/);
pass('migration and rollback');

console.log(`\n${passed} passed`);
