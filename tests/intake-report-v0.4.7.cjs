// v0.4.7 검사(총평에 약 복용 체크·시각 칸 따라가기): node tests/intake-report-v0.4.7.cjs [index_v0.4.7.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.4.7.html');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

const ctx = {};
vm.createContext(ctx);
new vm.Script(
  "const SUPPLEMENT_CATEGORY = '건강식품';\nconst isSupplementLog = (log) => log?.category === SUPPLEMENT_CATEGORY;\n" +
  html.match(/const formatDate = [^\n]*\n/)[0] +
  html.match(/const parseDate = \(dateStr\) => \{[\s\S]*?\n    \};\n/)[0] +
  grab('    const SUPPLEMENT_NUTRIENTS = {', '    // 건강식품 기록 아래:') +
  grab('    // ★ v0.4.4 복용 관리: 오래 먹는', '    // 홈: 루틴 칸 아래 한 줄.') +
  '\n;Object.assign(globalThis, { intakeRangeCounts, intakeCheckKey });'
).runInContext(ctx);

{
  const I = (id, kind, times, extra = {}) => ({ id, kind, name: id, times, start_date: '2026-11-01', end_date: null, stopped_at: null, created_at: '2026-11-01T00:00:00Z', ...extra });
  const K = ctx.intakeCheckKey;
  const bp = I('bp', 'medicine', ['morning']);
  const gout = I('gout', 'medicine', ['evening'], { start_date: '2026-11-18', created_at: '2026-11-18T00:00:00Z' });
  const omega = I('om', 'supplement', ['morning']);
  const checks = {};
  ['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-20'].forEach(d => { checks[K('bp', d, 'morning')] = { taken_time: '08:00' }; });
  ['2026-11-18', '2026-11-19'].forEach(d => { checks[K('gout', d, 'evening')] = { taken_time: '19:00' }; });
  // 주간 11/16(월)~11/22(일), 오늘 11/20: 혈압약 16~20 중 18 빠짐(4/5), 통풍약 18~19(2/2), 20일 저녁은 아직 → 제외, 21~22 미래 제외
  assert.deepEqual(plain(ctx.intakeRangeCounts([bp, gout, omega], checks, '2026-11-16', '2026-11-22', '2026-11-20', 'medicine')), { due: 7, done: 6, rate: 86 });
  assert.deepEqual(plain(ctx.intakeRangeCounts([bp, gout, omega], checks, '2026-11-16', '2026-11-22', '2026-11-20', 'supplement')), { due: 4, done: 0, rate: 0 }, 'omega: 16~19, today unchecked excluded');
  assert.deepEqual(plain(ctx.intakeRangeCounts([], {}, '2026-11-16', '2026-11-22', '2026-11-20', 'medicine')), { due: 0, done: 0, rate: null });
  pass('period counts: no future days, today only when checked, per kind');
}

{
  const daily = grab('        // ★ v0.4.7 약은 이름 없이 그날 먹을 횟수 중', "const summaryData = `기록 내역 (시간순)");
  assert.ok(daily.includes('[등록한 약 복용] 이날 먹을 ${medRows.length}회 중 ${medDone}회 체크'));
  assert.ok(!/item\.name|\.name\b/.test(daily), 'medicine names never written into the daily report');
  const period = grab('        // ★ v0.4.7 약은 이름 없이 이 기간 복용 체크 수만', "        if (statsMode === 'month') {");
  assert.ok(period.includes("intakeRangeCounts(intakeItems, intakeChecks, activeRange.start, activeRange.end, formatDate(new Date()), 'medicine')"));
  assert.ok(period.includes('[등록한 약 복용] 이 기간 복용 체크 ${periodMed.done}/${periodMed.due}회 (${periodMed.rate}%)'));
  assert.ok(!/\.name\b/.test(period), 'medicine names never written into period reports');
  assert.ok(!html.includes('효능을 평가하거나 평가의 근거로 삼지 마세요.'), 'old client rule removed (server v0.0.20 adds the rule)');
  pass('reports: medicines only as counts without names, period range counts');
}

// v0.4.8부터 시각 칸 따라가기는 체크 알림·줄 메뉴로 바뀌었다(tests/intake-sheet-v0.4.8.cjs에서 검사).
if (html.includes('data-intake-toast')) console.log('SKIP sheet part: replaced in v0.4.8');
else {
  const sheet = grab('    function IntakeSheet(', '    function emptyIntakeDraft(');
  assert.ok(sheet.includes('const [sessionKeys, setSessionKeys] = useState([]);'));
  assert.ok(sheet.includes("const targets = rows.filter(({ item, slot }) => sessionKeys.includes(item.id + '|' + slot) && checks[intakeCheckKey(item.id, date, slot)]);"), 'only rows checked in this window follow the field');
  assert.ok(sheet.includes('if (targets.length) onRetime(targets, value);'));
  assert.ok(sheet.includes('onChange={e => changeSheetTime(e.target.value)}'));
  assert.ok(sheet.includes("setSessionKeys(k => checked ? k.filter(x => x !== key) : [...k.filter(x => x !== key), key]);"), 'unchecking leaves the follow list');
  assert.ok(sheet.includes("const canRetime = !follows && validTime(sheetTime) && sheetTime !== time;"), 'older checks: tap the time to retime');
  assert.ok(sheet.includes('onClick={() => { setConfirmKey(null); onRetime([{ item, slot }], sheetTime); }}') && sheet.includes('>바꾸기</button>'), 'asks before changing an older check');
  const app = grab('      const retimeIntakeChecks = async (targets, time) => {', '      // 등록·수정.');
  assert.ok(app.includes(".update({ taken_time: time })") && app.includes('setIntakeChecks(p => ({ ...p, ...prev })); showNotice(INTAKE_SAVE_FAILED);'));
  assert.ok(html.includes('onToggle={toggleIntakeCheck} onRetime={retimeIntakeChecks}'));
  pass('sheet: field change moves rows checked in this window; older rows change after a confirm');
}

console.log(`\n${passed} passed`);
