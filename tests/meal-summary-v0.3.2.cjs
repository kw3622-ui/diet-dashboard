const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index_v0.3.2.html'), 'utf8');

const checks = [
  ['actual ingredients preferred', /Array\.isArray\(log\?\.ingredients\)/],
  ['AI title only fallback', /log\?\.foodName \? \[String\(log\.foodName\)\]/],
  ['maximum four food names', /Math\.min\(4,/],
  ['dynamic pixel measurement', /measureText\(makeText\(count\)\)/],
  ['responsive resize observer', /new ResizeObserver\(fit\)/],
  ['remaining count label', /외 \$\{hidden\}개/],
  ['single line layout', /whitespace-nowrap overflow-hidden text-ellipsis/],
  ['meal table uses summary component', /<MealRecordSummary matches=\{matches\} \/>/],
];

for (const [name, pattern] of checks) {
  if (!pattern.test(html)) throw new Error(`FAIL: ${name}`);
}
console.log('PASS meal summary v0.3.2');


