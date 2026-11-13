// v0.4.4 건강식품·복용 관리 화면 검사: node tests/supplement-v0.4.4.cjs [index_v0.4.4.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.4.4.html');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

// 궁합·복용 계산 함수 실행
const ctx = {};
vm.createContext(ctx);
new vm.Script(
  "const SUPPLEMENT_CATEGORY = '건강식품';\nconst isSupplementLog = (log) => log?.category === SUPPLEMENT_CATEGORY;\n" +
  html.match(/const formatDate = [^\n]*\n/)[0] +
  grab('    const SUPPLEMENT_NUTRIENTS = {', '    // 건강식품 기록 아래:') +
  // v0.4.5부터는 계산 함수 뒤에 홈 복용 줄(JSX)이 먼저 나오므로 둘 중 앞의 표시까지만 자른다.
  (() => {
    const i = html.indexOf('    // ★ v0.4.4 복용 관리: 오래 먹는');
    const ends = ['    // 홈: 루틴 칸 아래 한 줄.', '    // 홈 💊 복용 버튼'].map(m => html.indexOf(m, i)).filter(j => j > i);
    assert.ok(i > 0 && ends.length);
    return html.slice(i, Math.min(...ends));
  })() +
  '\n;Object.assign(globalThis, { supplementNutrientsOf, supplementPairNotes, isIntakeDue, intakeDueRows, intakeSupplementLogs, intakeTipsFor, intakeCheckKey });'
).runInContext(ctx);
const L = (id, time, names, category = '건강식품') => ({ id, date: '2026-11-13', time, category, foodName: names[0], ingredients: names.map(n => n + '(1알)') });

{
  assert.deepEqual(plain(ctx.supplementNutrientsOf(L(1, '08:00', ['칼슘 마그네슘', '비타민 C']))), ['calcium', 'vitaminC']);
  assert.deepEqual(plain(ctx.supplementNutrientsOf(L(2, '08:00', ['Iron 헴철']))), ['iron']);
  assert.deepEqual(plain(ctx.supplementNutrientsOf(L(3, '08:00', ['발효효소']))), []);
  pass('nutrients found by name (Korean/English, spaces ignored)');

  const ca = L(1, '08:00', ['칼슘']), fe = L(2, '08:30', ['철분']);
  const n1 = ctx.supplementPairNotes(ca, [ca, fe]);
  assert.equal(n1.length, 1);
  assert.equal(n1[0].kind, 'caution');
  assert.ok(n1[0].text.includes('2시간쯤 간격'));
  assert.equal(ctx.supplementPairNotes(fe, [ca, fe])[0].kind, 'caution', 'shown on both records');
  const feLate = L(2, '11:00', ['철분']);
  assert.equal(ctx.supplementPairNotes(ca, [ca, feLate])[0].kind, 'ok');
  assert.ok(ctx.supplementPairNotes(ca, [ca, feLate])[0].text.includes('칼슘과 철분을 2시간 넘게'));
  pass('calcium + iron: caution within 2 hours, praise when spaced');

  const both = L(4, '08:00', ['칼슘', '철분']);
  assert.equal(ctx.supplementPairNotes(both, [both])[0].kind, 'caution', 'same record counts as together');
  const c = L(5, '09:00', ['비타민C']);
  const good = ctx.supplementPairNotes(fe, [fe, c]);
  assert.equal(good[0].kind, 'good');
  assert.ok(good[0].text.includes('비타민 C와 함께'));
  const zn = L(6, '08:10', ['아연']);
  assert.equal(ctx.supplementPairNotes(zn, [zn, fe])[0].kind, 'caution');
  pass('same-record pair, iron + vitamin C is good, zinc + iron caution');

  assert.deepEqual(plain(ctx.supplementPairNotes(L(7, '08:00', ['오메가3']), [L(7, '08:00', ['오메가3']), ca])), [], 'unknown combos say nothing');
  const mealIron = L(8, '08:00', ['철분'], '아침식사');
  assert.deepEqual(plain(ctx.supplementPairNotes(ca, [ca, mealIron])), [], 'meals are not supplements');
  const otherDay = { ...fe, date: '2026-11-12' };
  assert.deepEqual(plain(ctx.supplementPairNotes(ca, [ca, otherDay])), [], 'other days are ignored');
  assert.deepEqual(plain(ctx.supplementPairNotes(mealIron, [mealIron, ca])), []);
  pass('nothing for unknown combos, meals or other days');
}

// 복용 관리 계산
{
  const I = (id, kind, name, times, extra = {}) => ({ id, kind, name, times, start_date: '2026-11-01', end_date: null, stopped_at: null, sort_order: 0, ...extra });
  const bp = I('m1', 'medicine', '혈압약', ['morning']);
  const gout = I('m2', 'medicine', '통풍약', ['evening', 'morning']);
  const omega = I('s1', 'supplement', '오메가3', ['morning', 'evening']);
  const old = I('s2', 'supplement', '칼슘', ['morning'], { end_date: '2026-11-05' });
  const stopped = I('s3', 'supplement', '철분', ['morning'], { stopped_at: '2026-11-08T03:00:00Z' });
  const future = I('s4', 'supplement', '아연', ['morning'], { start_date: '2026-11-20' });
  const due = ctx.isIntakeDue;
  assert.deepEqual([due(old, '2026-11-05'), due(old, '2026-11-06'), due(stopped, '2026-11-08'), due(stopped, '2026-11-09'), due(future, '2026-11-13')], [true, false, true, false, false]);
  const rows = ctx.intakeDueRows([omega, gout, bp, old, stopped, future], '2026-11-13').map(r => r.item.name + ':' + r.slot);
  // 같은 시간대·같은 순서값이면 이름 가나다순(통 < 혈)
  assert.deepEqual(plain(rows), ['통풍약:morning', '혈압약:morning', '통풍약:evening', '오메가3:morning', '오메가3:evening']);
  pass('intake: due by start/end/stop date, medicines first, then by time slot');

  const checks = {
    [ctx.intakeCheckKey('s1', '2026-11-13', 'morning')]: { item_id: 's1', check_date: '2026-11-13', slot: 'morning', taken_time: '08:05:00' },
    [ctx.intakeCheckKey('m1', '2026-11-13', 'morning')]: { item_id: 'm1', check_date: '2026-11-13', slot: 'morning', taken_time: '08:00:00' },
  };
  const pseudo = plain(ctx.intakeSupplementLogs([omega, bp], checks, '2026-11-13'));
  assert.equal(pseudo.length, 1, 'medicines are never turned into supplement records');
  assert.equal(pseudo[0].foodName, '오메가3');
  assert.equal(pseudo[0].time, '08:05');
  const ca = I('s5', 'supplement', '칼슘', ['morning']);
  const caCheck = { [ctx.intakeCheckKey('s5', '2026-11-13', 'morning')]: { item_id: 's5', check_date: '2026-11-13', slot: 'morning', taken_time: '08:00' } };
  const caLog = ctx.intakeSupplementLogs([ca], caCheck, '2026-11-13')[0];
  const ironLog = { id: 'x', date: '2026-11-13', time: '08:30', category: '건강식품', foodName: '철분', ingredients: ['철분(1알)'] };
  assert.equal(ctx.supplementPairNotes(ironLog, [ironLog, caLog])[0].kind, 'caution', 'checked registered calcium counts for combos');
  pass('intake: checked supplements join combo checks, medicines never do');

  assert.deepEqual(plain(ctx.intakeTipsFor(omega)), ['식후에 (기름과 함께 먹으면 흡수가 잘돼요)']);
  assert.deepEqual(plain(ctx.intakeTipsFor(I('a', 'supplement', '철분', ['morning']))), ['공복에 흡수가 잘되지만, 속이 불편하면 식후에']);
  assert.deepEqual(plain(ctx.intakeTipsFor(I('b', 'supplement', '비타민D 1000IU', ['morning']))), ['식후에 (기름과 함께 먹으면 흡수가 잘돼요)']);
  assert.deepEqual(plain(ctx.intakeTipsFor(I('c', 'supplement', '유산균', ['morning']))), [], 'no tip for unknown or mixed-evidence items');
  assert.deepEqual(plain(ctx.intakeTipsFor(I('d', 'medicine', '철분제', ['morning']))), [], 'never for medicines');
  pass('intake tips: fixed list only, nothing for unknown items or medicines');
}

// 화면 연결
for (const [name, text] of [
  ['category list', "const defaultCategories = ['아침식사', '점심식사', '저녁식사', '간식', '야식', '건강식품', '운동'];"],
  ['title', "'건강식품': '💊 건강식품 기록',"],
  ['quick button opens the intake sheet', 'aria-label="복용 체크하기">💊 복용</button>'],
  ['sheet can still record other supplements', 'onRecordOther={() => { setIsIntakeSheetOpen(false); openQuickDraft(SUPPLEMENT_CATEGORY); }}'],
  ['settings opens intake manager', 'data-setting-intake'],
  ['popup offers registration', '📌 매일 드시는 건가요?'],
  ['registration from a log copies the AI info', "label_claim: log.supplementInfo?.labelClaim || '', ai_note: log.supplementInfo?.aiNote || ''"],
  ['AI only for supplements without a note or with new photos', "if (data.kind === 'supplement' && (!data.ai_note || (draft.photos || []).length)) {"],
  ['medicine form says no AI', '약은 AI 설명을 만들지 않고, AI 리포트에도 보내지 않아요.'],
  ['daily report gets supplement checks only', "if (item?.kind === 'supplement') summaryLines.push("],
  ['pharmacist notice', '등록하신 약과 건강식품을 같이 드셔도 되는지 약사에게 한 번 확인해 보세요.'],
  ['checks saved one per item, day and slot', ".upsert(row, { onConflict: 'item_id,check_date,slot' })"],
  ['record table intake row', 'data-intake-record-row'],
  ['card combos include checked supplements', 'dayLogs={[...logs, ...intakeSupplementDayLogs]}'],
  ['today table row style', "(isSupp ? '💊' : (row.log.category === '야식' ? '🌃' : '🍪'))"],
  ['row mapping', 'supplementInfo: row.supplement_info || row.supplementInfo || null,'],
  ['package claim label', '📦 <b>포장 표시 기능성</b>'],
  ['AI note is folded and labeled', '🤖 AI 참고 · 확인 안 된 정보'],
  ['pharmacist line', '드시는 약이 있으면 약사와 확인하세요.'],
  ['frequent foods skip supplements', 'row.category === SUPPLEMENT_CATEGORY) return;'],
  ["monthly report lists supplements apart", "- 해당 기간 건강식품(식사 아님): ${supplements || '없음'}"],
  ['supplement placeholder', '예: 발효효소 1포, 유산균 1캡슐'],
]) { assert.ok(html.includes(text), name); }
const box = grab('    function SupplementInfoBox(', '    // ★ v0.4.4 복용 관리: 오래 먹는');
assert.ok(box.indexOf('const [open, setOpen] = useState(false);') < box.indexOf('if (!isSupplementLog(log)) return null;'), 'hook before early return');
assert.ok(box.includes('{open && ('), 'AI note hidden until tapped');
const report = grab('        intakeDayChecks.forEach(c => {', "const summaryData = `기록 내역 (시간순)");
assert.ok(!report.includes("'medicine'"), 'medicines are never written into the daily report');
pass('screen: intake sheet and manager wiring, medicines kept out of AI, supplement records, reports');

console.log(`\n${passed} passed`);
