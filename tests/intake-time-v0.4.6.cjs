// v0.4.6 복용 창 "먹은 시각" 칸 검사: node tests/intake-time-v0.4.6.cjs [index_v0.4.6.html]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.4.6.html');
const html = fs.readFileSync(htmlFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i > 0 && j > i, a); return html.slice(i, j); };

const sheet = grab('    function IntakeSheet(', '    function emptyIntakeDraft(');
assert.ok(sheet.includes("const [sheetTime, setSheetTime] = useState(isToday ? getCurrentTimeStr() : '');"), 'today: now, past day: empty');
assert.ok(sheet.includes('<input type="time" value={sheetTime} onChange={e => setSheetTime(e.target.value)} aria-label="먹은 시각"'), 'one time field at the top');
assert.ok(sheet.indexOf('data-intake-sheet-time') < sheet.indexOf('data-intake-ack'), 'time field above the list');
assert.ok(sheet.includes('onClick={() => onToggle(item, slot, sheetTime)}'), 'checks use the field time');
assert.ok(sheet.includes('data-intake-row-time>{time}</span>'), 'checked rows show their saved time');
assert.equal((sheet.match(/type="time"/g) || []).length, 1, 'no per-row time box any more');
assert.ok(!html.includes('setIntakeCheckTime') && !html.includes('onTimeChange'), 'old per-row editing removed');
pass('sheet: one "먹은 시각" field (now / empty for past days), rows checked with it, saved time shown on rows');

const toggle = grab('      const toggleIntakeCheck = async (item, slot, time) => {', '      // 등록·수정.');
assert.ok(toggle.includes("taken_time: /^\\d{2}:\\d{2}$/.test(time || '') ? time"), 'field time used when complete');
assert.ok(toggle.includes("(isToday ? getCurrentTimeStr() : (INTAKE_SLOTS.find(x => x.key === slot)?.time || '08:00'))"), 'fallback: now today, slot time for past days');
assert.ok(toggle.indexOf('if (prev) {') < toggle.indexOf('taken_time:'), 'unchecking ignores the time');
assert.ok(/onAck=\{ackIntakePharmacist\} onToggle=\{toggleIntakeCheck\}\s/.test(html));
pass('save: field time when filled, otherwise now (today) or slot default (past days)');

console.log(`\n${passed} passed`);
