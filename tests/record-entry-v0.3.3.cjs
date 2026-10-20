const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index_v0.3.3.html'), 'utf8');

const checks = [
  ['versioned meal ranges', /minTime: '05:00'.*maxTime: '11:30'/s],
  ['lunch broad range', /minTime: '10:30'.*maxTime: '16:30'/s],
  ['dinner range', /minTime: '16:00'.*maxTime: '23:30'/s],
  ['table entry source', /entrySource: 'todayTable'/],
  ['header action source', /entrySource: 'headerAction'/],
  ['table anchor fallback', /const suggestedTime = useCurrentTime \? nowTime : slot\.anchorTime/],
  ['general entry keeps current time', /openTextDraft[\s\S]*?editTime: getCurrentTimeStr\(\)/],
  ['camera preserves selected category', /if \(preserveDraft\)[\s\S]*?\.\.\.prev[\s\S]*?type: 'image'/],
  ['camera and album methods', /data-record-methods[\s\S]*?📷 촬영[\s\S]*?🖼️ 앨범/],
  ['snack quick action', /openQuickDraft\('간식'\)/],
  ['exercise quick action', /openQuickDraft\('운동'\)/],
  ['time warning guard', /mealTimeWarning && !draft\.timeConfirmed/],
  ['time warning controls', /data-meal-time-warning[\s\S]*?anchorTime[\s\S]*?시간 사용|data-meal-time-warning[\s\S]*?사용/],
];

for (const [name, pattern] of checks) {
  if (!pattern.test(html)) throw new Error(`FAIL: ${name}`);
}

console.log(`PASS record entry v0.3.3 (${checks.length} checks)`);

