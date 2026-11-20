// v0.4.8 복용 창(시간대 묶음·모두 먹음·체크 알림·줄 메뉴) 검사: node tests/intake-sheet-v0.4.8.cjs [index_v0.4.8.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.4.8.html');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

{
  const ctx = {};
  vm.createContext(ctx);
  new vm.Script(grab('    const INTAKE_SLOT_END_HOUR = ', '    // 홈 💊 복용 버튼') + '\n;globalThis.isIntakeSlotPast = isIntakeSlotPast;').runInContext(ctx);
  const at = (h) => new Date(2026, 10, 20, h, 0);
  const past = ctx.isIntakeSlotPast;
  assert.deepEqual(['morning', 'lunch', 'evening', 'bedtime'].map(s => past(s, true, at(10))), [false, false, false, false]);
  assert.deepEqual(['morning', 'lunch', 'evening', 'bedtime'].map(s => past(s, true, at(15))), [true, true, false, false]);
  assert.deepEqual(['morning', 'lunch', 'evening', 'bedtime'].map(s => past(s, true, at(22))), [true, true, true, false]);
  assert.equal(past('bedtime', false, at(10)), true, 'past days always ask');
  pass('late check: slot ends at 11/15/21, bedtime never today, past days always');
}

const sheet = grab('    function IntakeSheet(', '    function emptyIntakeDraft(');
{
  assert.ok(!sheet.includes('sheetTime') && !sheet.includes('aria-label="먹은 시각"'), 'no time field at the top any more');
  assert.ok(sheet.includes('const groups = INTAKE_SLOTS.map(s => ({ ...s, rows: rows.filter(r => r.slot === s.key) })).filter(g => g.rows.length);'), 'grouped by time slot');
  assert.ok(sheet.includes("{left.length > 1 && (") && sheet.includes('onClick={() => check(left, g.key)}') && sheet.includes('>모두 먹음</button>'), '"모두 먹음" checks every unchecked row of the slot');
  assert.ok(sheet.includes("{item.kind === 'medicine' ? '💊 약' : '🌿 건강식품'}"), 'kind tag on each row');
  pass('sheet: no top time field, slot groups, "모두 먹음", kind tags');
}
{
  assert.ok(sheet.includes("onClick={() => { if (checked) { setMenuKey(open ? null : key); setMenuEdit(time); } else check([row], slot); }}"), 'tap: unchecked → check, checked → menu (no accidental uncheck)');
  const menu = grab('            {open && (', '          </div>\n        );\n      };');
  assert.ok(menu.includes('onClick={async () => { await onRetime([row], menuEdit); setMenuKey(null); }}') && menu.includes('>시각 바꾸기</button>'));
  assert.ok(menu.includes('onRetime(groups.find(g => g.key === slot).rows.filter(isChecked), menuEdit)') && menu.includes('체크한 것 모두 {menuEdit || time}으로'), 'all checked rows of the slot at once');
  assert.ok(menu.includes('onUncheck(item, slot)') && menu.includes('>체크 취소</button>'));
  pass('row menu: change time, all of this slot, uncheck');
}
{
  assert.ok(sheet.includes('showToast({ slot, targets, time, late: isIntakeSlotPast(slot, isToday), editing: false, editTime: time });'));
  assert.ok(sheet.includes('if (next && !next.late) toastTimer.current = setTimeout('), 'on-time toast hides by itself, late toast stays');
  assert.ok(sheet.includes('{toast.targets.length}개를 {toast.time}으로 체크했어요') && sheet.includes('실제로 드신 시각이 다르면 바꿔 주세요.'));
  assert.ok(sheet.includes('await onRetime(toast.targets, toast.editTime);'), 'toast retimes exactly what was just checked');
  pass('toast after checking: shows count and time, late checks stay with a prompt, "시각 바꾸기" fixes the batch');
}
{
  const app = grab('      const checkIntakeRows = async (targets) => {', '      const uncheckIntake = ');
  assert.ok(app.includes("const time = isToday ? getCurrentTimeStr() : slotTime(fresh[0].slot);"));
  assert.ok(app.includes(".upsert(rowsToSave, { onConflict: 'item_id,check_date,slot' }).select();"), 'one request for many rows');
  assert.ok(app.includes('keys.forEach(k => delete n[k]);') && app.includes('showNotice(INTAKE_SAVE_FAILED);'), 'rolled back on failure');
  assert.ok(html.includes('onCheck={checkIntakeRows} onUncheck={uncheckIntake} onRetime={retimeIntakeChecks}'));
  assert.ok(!html.includes('toggleIntakeCheck'));
  pass('app: batch check with now (or slot default on past days), uncheck, retime');
}

console.log(`\n${passed} passed`);
