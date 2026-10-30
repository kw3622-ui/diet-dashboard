// v0.3.6 현황 화면 운동 균형 카드 검사: node tests/exercise-balance-ui-v0.3.6.cjs [index_v0.3.6.html]
// 화면의 computeExerciseBalance가 서버(diet-ai_v0.0.11.ts)와 같은 결과를 내는지도 함께 확인한다.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.3.6.html');
const serverFile = process.argv[3] || path.resolve(__dirname, '..', 'diet-ai_v0.0.11.ts');
const html = fs.readFileSync(htmlFile, 'utf8');

const checks = [
  ['log rows keep exercise_meta', /exerciseMeta: row\.exercise_meta/],
  ['balance card marker', /data-exercise-balance/],
  ['card only on status tab fetch', /if \(activeTab === 'status'\) fetchExerciseBalance\(range\.end\)/],
  ['reference date capped at today', /rangeEnd && rangeEnd < today \? rangeEnd : today/],
  ['classified rows only', /\.not\('exercise_meta', 'is', null\)/],
  ['unclassified count', /\.is\('exercise_meta', null\)/],
  ['backfill uses server action', /callAI\('classifyExercises', \{\}\)/],
  ['backfill loop stops when nothing processed', /if \(!res\.remaining \|\| !res\.processed\) break;/],
  ['backfill is a user button, not automatic', /onClick=\{handleClassifyExercises\}/],
  ['card failure does not trigger page reload', /if \(error\) \{ setExerciseBalance\(null\); return; \}/],
  ['30-day window label', /최근 \{EXERCISE_BALANCE_DAYS\}일/],
  ['recommendation line', /다음 추천 부위:/],
  ['sub-part lacking label', /비중 적음/],
  ['recovery label', /회복 중/],
  ['cardio row', /주 2회 권장/],
];
let passed = 0;
for (const [name, re] of checks) {
  assert.match(html, re, name);
  passed++;
  console.log('PASS ' + name);
}

// 화면 쪽 계산 함수만 떼어내 실행한다.
const start = html.indexOf('const EXERCISE_PARTS = [');
const end = html.indexOf('const summarizeHealthTags');
assert.ok(start > 0 && end > start, 'computeExerciseBalance block found');
const dateHelpers = html.match(/const formatDate = [^\n]*\n/)[0] + html.match(/const parseDate = \(dateStr\) => \{[\s\S]*?\n    \};\n/)[0];
const ui = {};
vm.createContext(ui);
new vm.Script(dateHelpers + html.slice(start, end) + '\n;globalThis.computeExerciseBalance = computeExerciseBalance;').runInContext(ui);

const server = { console, Deno: { env: { get: () => 'test-only' }, serve: () => {} }, createClient: () => ({}) };
vm.createContext(server);
new vm.Script(stripTypeScriptTypes(fs.readFileSync(serverFile, 'utf8')).replace(/^import .*;$/gm, '')).runInContext(server);

const item = (targets, kind = 'strength', minutes = null) => ({ name: 'x', kind, targets, minutes });
const row = (log_date, items) => ({ log_date, exercise_meta: { version: 1, items } });
const scenarios = {
  mixed: [
    row('2026-08-01', [item(['chest.mid_chest']), item(['chest.upper_chest'])]),
    row('2026-08-10', [item(['chest.mid_chest'])]),
    row('2026-09-01', [item(['chest.lower_chest', 'arm.triceps'])]),
    row('2026-10-05', [item(['chest.mid_chest'])]),
    row('2026-10-12', [item(['chest.upper_chest']), item(['legs.quads', 'legs.glutes'])]),
    row('2026-10-20', [item(['chest.mid_chest'])]),
    row('2026-10-25', [item([], 'cardio', 40)]),
    row('2026-10-28', [item(['back.mid_back'])]),
    row('2026-10-29', [item(['shoulder'])]),
  ],
  empty: [],
  unknownOnly: [row('2026-10-01', [item([], 'unknown')])],
};
for (const [name, rows] of Object.entries(scenarios)) {
  const u = JSON.parse(JSON.stringify(ui.computeExerciseBalance(rows, '2026-10-30')));
  const s = JSON.parse(JSON.stringify(server.computeExerciseBalance(rows, '2026-10-30')));
  assert.equal(u.classifiedLogs, s.classifiedLogs, name + ' classifiedLogs');
  assert.deepEqual(u.summary.map(p => [p.key, p.days, p.daysAgo, p.recent, p.sessions]),
    s.partSummary.map(p => [p.part, p.days, p.daysAgo, p.recent, s.subBalance.find(x => x.part === p.part).sessions]), name + ' parts');
  assert.deepEqual(u.summary.map(p => p.lacking?.sub || null), s.subBalance.map(x => x.lacking?.sub || null), name + ' lacking sub-part');
  assert.equal(u.recommended?.key || null, s.recommendOrder[0] || null, name + ' recommended part');
  assert.deepEqual([u.cardioDays, u.cardioMinutes, u.cardioNeeded], [s.cardioDays, s.cardioMinutes, s.cardioNeeded], name + ' cardio');
  passed++;
  console.log('PASS screen and server agree: ' + name);
}
const mixed = ui.computeExerciseBalance(scenarios.mixed, '2026-10-30');
assert.equal(mixed.recommended.key, 'legs');
assert.equal(mixed.summary.find(p => p.key === 'chest').lacking.sub, 'lower_chest');
passed++;
console.log('PASS mixed scenario recommends legs and flags lower chest');
console.log(`\n${passed} passed`);
