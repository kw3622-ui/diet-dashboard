// v0.5.1 운동 종목 사전 검사: node tests/exercise-library-v0.5.1.cjs [index_v0.5.1.html] [exercise_library_v1.json]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.5.1.html');
const libFile = process.argv[3] || path.resolve(__dirname, '..', 'exercise_library_v1.json');
const html = fs.readFileSync(htmlFile, 'utf8');
const lib = JSON.parse(fs.readFileSync(libFile, 'utf8'));
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };

// 1. 사전 형식
const PARTS = { chest: ['upper_chest', 'mid_chest', 'lower_chest'], back: ['lat', 'mid_back', 'lower_back'], shoulder: ['front_delt', 'side_delt', 'rear_delt'], arm: ['biceps', 'triceps'], legs: ['quads', 'hamstrings', 'glutes', 'calves'], core: ['abs', 'obliques'] };
const keys = new Set();
for (const e of lib.exercises) {
  assert.ok(e.key && !keys.has(e.key), 'unique key ' + e.key); keys.add(e.key);
  assert.ok(e.name && typeof e.summary === 'string' && e.summary.length > 10, 'summary ' + e.key);
  assert.ok(Array.isArray(e.steps) && e.steps.length >= 2, 'steps ' + e.key);
  assert.ok(Array.isArray(e.mistakes), 'mistakes ' + e.key);
  assert.ok(['strength', 'cardio', 'flexibility'].includes(e.kind), 'kind ' + e.key);
  assert.ok(lib.equipmentLabels[e.equipment], 'equipment ' + e.key);
  for (const t of e.targets) { const [p, s] = t.split('.'); assert.ok(PARTS[p] && (!s || PARTS[p].includes(s)), 'target ' + e.key + ' ' + t); }
  assert.ok(e.image === null || /^[A-Za-z0-9_\-]+$/.test(e.image), 'image id ' + e.key);
}
assert.ok(lib.imageBase.startsWith('https://') && lib.imageCredit.includes('free-exercise-db'));
pass(`library has ${lib.exercises.length} valid entries`);

// 2. 화면의 이름 찾기 함수
const start = html.indexOf('const formatExerciseSet = (s) => {');
const end = html.indexOf('// ★ v0.3.8 항목별 근거');
assert.ok(start > 0 && end > start, 'helpers found');
const partsStart = html.indexOf('const EXERCISE_PARTS = [');
const partsEnd = html.indexOf('const RECOMMENDABLE_EXERCISE_PARTS');
const ctx = { fetch: async () => ({ ok: true, json: async () => lib }) };
vm.createContext(ctx);
new vm.Script(html.slice(partsStart, partsEnd) + html.slice(start, end) +
  '\n;Object.assign(globalThis, { normalizeExerciseKey, buildExerciseIndex, exerciseCardLines, exerciseTargetLabels, loadExerciseLibrary });').runInContext(ctx);
const index = ctx.buildExerciseIndex(lib);
for (const [raw, key] of [
  ['밴드 풀 업: 총 25회 수행', 'band-pull-up'], ['밴드 풀 업 26회', 'band-pull-up'], ['바벨 스쿼트: 15~80kg 8세트', 'barbell-squat'],
  ['덤벨 레터럴 레이즈 1세트', 'dumbbell-lateral-raise'], ['캡틴스 체어 레그 레이이즈', 'captains-chair-leg-raise'], ['이지바 바이세일 컬', 'ez-bar-curl'],
  ['라인 레그 컬', 'lying-leg-curl'], ['데드 리프트', 'deadlift'], ['V-bar 랫 풀 다운', 'v-bar-lat-pulldown'], ['런닝머신 2km 15분', 'treadmill-running'],
  ['보행', 'walking'], ['푸쉬업', 'push-up'], ['머신 레그 프레스: 35~65kg 3세트', 'leg-press'], ['덤벨 트라이세스 익스텐션', 'dumbbell-triceps-extension'],
]) assert.equal(index.get(ctx.normalizeExerciseKey(raw))?.key, key, raw);
assert.equal(index.get(ctx.normalizeExerciseKey('근력 운동')), undefined, 'generic names have no entry');
pass('recorded names find their entries');

assert.deepEqual(JSON.parse(JSON.stringify(ctx.exerciseTargetLabels(['chest.upper_chest', 'legs', 'x.y']))), ['가슴 · 윗가슴', '하체']);
pass('target labels');

const lines = JSON.parse(JSON.stringify(ctx.exerciseCardLines({ items: [
  { name: '바벨 플랫 벤치 프레스', kind: 'strength', sets: [{ weight: 60, unit: 'kg', reps: 8 }] },
  { name: '밴드 풀 업', kind: 'strength' },
  { name: '근력 운동', kind: 'strength' },
  { name: '알 수 없는 운동', kind: 'strength', sets: [{ reps: 5 }] },
] }, index)));
assert.deepEqual(lines.map(l => [l.name, l.text, l.info && l.info.key]), [
  ['바벨 플랫 벤치 프레스', '60kg×8', 'barbell-bench-press'],
  ['밴드 풀 업', '', 'band-pull-up'],
  ['알 수 없는 운동', '5회', null],
]);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.exerciseCardLines({ items: [{ name: '밴드 풀 업' }] }, null))), [], 'no library: only numbers');
pass('card lines show numbers or explanations');

(async () => {
  const loaded = await ctx.loadExerciseLibrary();
  assert.equal(loaded.library.version, 1);
  assert.ok(loaded.index.size > lib.exercises.length);
  pass('library loads once from the json file');

  const checks = [
    ['library file name', /const EXERCISE_LIBRARY_URL = 'exercise_library_v1\.json';/],
    ['library load failure keeps page working', /catch\(\(\) => \{ exerciseLibraryPromise = null; return null; \}\)/],
    ['loaded once on mount', /useEffect\(\(\) => \{ loadExerciseLibrary\(\)\.then\(setExerciseLib\); \}, \[\]\);/],
    ['names with entries are buttons', /onClick=\{\(\) => setExerciseInfo\(line\.info\)\} data-exercise-name/],
    ['sheet rendered', /\{exerciseInfo && <ExerciseInfoSheet entry=\{exerciseInfo\} library=\{exerciseLib\?\.library\} onClose=\{\(\) => setExerciseInfo\(null\)\} \/>\}/],
    ['two frames alternate', /setFrame\(f => \(f \+ 1\) % 2\)/],
    ['image credit shown', /\{library\?\.imageCredit\}/],
    ['broken image hidden', /onError=\{\(\) => setImageFailed\(true\)\}/],
    ['youtube search link', /youtube\.com\/results\?search_query=\$\{encodeURIComponent\(entry\.name \+ ' 자세'\)\}/],
    ['review note', /이 설명은 아직 확인 중이에요/],
  ];
  for (const [name, re] of checks) { assert.match(html, re, name); pass(name); }
  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
