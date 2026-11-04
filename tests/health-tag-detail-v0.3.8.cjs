// v0.3.8 건강 영향 근거 펼치기·건강분석 탭·리포트 근거 전달 검사:
// node tests/health-tag-detail-v0.3.8.cjs [index_v0.3.8.html] [diet-ai_v0.0.13.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const htmlFile = process.argv[2] || path.resolve(__dirname, '..', 'index_v0.3.8.html');
const serverFile = process.argv[3] || path.resolve(__dirname, '..', 'diet-ai_v0.0.13.ts');
const html = fs.readFileSync(htmlFile, 'utf8');
const serverSource = fs.readFileSync(serverFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));

const checks = [
  ['analysis view tabs', /data-analysis-view-tabs/],
  ['last analysis view is remembered', /localStorage\.getItem\('analysisView'\)/],
  ['long-term view hides date and week/month pickers', /\{!isLongTermView && \(\s*<div className="flex justify-between items-center bg-gray-50/],
  ['week/month toggle hidden in long-term view', /activeTab !== 'home' && !isLongTermView/],
  ['swipe disabled in long-term view', /if \(activeTab === 'analysis' && analysisView === 'longterm'\) \{ touchStartRef\.current = null; return; \}/],
  ['condition reports load only in long-term view', /activeTab === 'analysis' && analysisView === 'longterm'\) fetchConditionReports\(\)/],
  ['health impact card only in period view', /activeTab === 'analysis' && analysisView === 'period' && \(\s*<HealthTagSummary/],
  ['AI report only in period view', /activeTab === 'analysis' && analysisView === 'period' && \(\s*<div className="bg-gradient-to-br/],
  ['condition card in long-term view', /\{isLongTermView && \(\s*<>[\s\S]{0,300}data-condition-report/],
  ['group rows are buttons that open entries', /onClick=\{\(\) => setOpenTagGroup\(isOpen \? null : openKey\)\}/],
  ['entries list marker', /data-health-tag-entries/],
  ['entry jumps to that day on home', /onClick=\{\(\) => openLogDate\(entry\.date\)\}/],
  ['more than six groups can be shown', /전체 \$\{summary\.length\}개 항목 보기/],
];
for (const [name, re] of checks) { assert.match(html, re, name); pass(name); }

// 화면의 집계 함수
const start = html.indexOf('const summarizeHealthTags');
const end = html.indexOf('const conditionKeyForLabel');
const ui = {};
vm.createContext(ui);
new vm.Script(html.slice(start, end) + '\n;globalThis.summarizeHealthTags = summarizeHealthTags;').runInContext(ui);
{
  const tag = (diseaseKey, polarity, tagLabel, foodName, evidence) => ({ diseaseKey, polarity, tagLabel, foodName, evidence });
  const logs = [
    { id: 'a', date: '2026-11-01', time: '12:00', category: '점심', foodName: '짬뽕 점심', healthTags: [tag('hypertension', 'caution', '혈압 주의', '짬뽕', '국물까지 다 먹음')] },
    { id: 'b', date: '2026-11-03', time: '19:00', category: '저녁', foodName: '라면', healthTags: [tag('hypertension', 'caution', '혈압 주의', '', '라면 국물'), tag('gout', 'helpful', '통풍에 도움', '물', '물 2L')] },
    { id: 'c', date: '2026-11-03', time: '08:00', category: '아침', foodName: '죽', healthTags: [tag('hypertension', 'neutral', '무시', '죽', 'x')] },
  ];
  const summary = plain(ui.summarizeHealthTags(logs));
  assert.equal(summary.length, 2);
  assert.equal(summary[0].label, '혈압 주의');
  assert.equal(summary[0].count, 2);
  assert.deepEqual(summary[0].entries.map(e => [e.logId, e.foodName, e.evidence]), [['b', '라면', '라면 국물'], ['a', '짬뽕', '국물까지 다 먹음']]);
  assert.equal(summary[0].key, 'hypertension:caution');
  pass('summary groups keep every entry, newest first, with evidence');
}

// 서버: 근거를 묶어 넘기는 형식
const server = { console, Deno: { env: { get: () => 'test-only' }, serve: () => {} }, createClient: () => ({}) };
vm.createContext(server);
new vm.Script(stripTypeScriptTypes(serverSource).replace(/^import .*;$/gm, '') + '\n;globalThis.__f = formatHealthTagContext;').runInContext(server);
{
  const t = (evidence, food_name, polarity = 'caution', disease_key = 'hypertension', tag_label = '혈압 주의') => ({ tag_label, disease_key, polarity, food_name, evidence });
  const out = server.__f([
    t('국물까지 다 먹음', '짬뽕'), t('국물까지  다 먹음 ', '라면'), t('젓갈 반찬', '젓갈'), t(null, '김치'),
    t('물 2L 마심', '물', 'helpful', 'gout', '통풍에 도움'),
  ]);
  assert.match(out, /- 혈압 주의 \(주의\): 4회/);
  assert.match(out, /· 국물까지 다 먹음 \[짬뽕, 라면\] ×2/);
  assert.match(out, /· 젓갈 반찬 \[젓갈\]\n/);
  assert.match(out, /· \(근거 문장 없음\) \[김치\]/);
  assert.match(out, /- 통풍에 도움 \(잘한 점\): 1회\n  · 물 2L 마심 \[물\]/);
  assert.ok(out.indexOf('혈압 주의') < out.indexOf('통풍에 도움'), 'more frequent group first');
  pass('server groups identical evidence and labels good vs caution');

  const many = Array.from({ length: 20 }, (_, i) => t('근거 ' + i + ' ' + 'x'.repeat(100), '음식' + i));
  const capped = server.__f(many);
  assert.equal((capped.match(/  · 근거 /g) || []).length, 15);
  assert.match(capped, /그 밖의 근거 5종/);
  assert.ok(!capped.includes('x'.repeat(90)), 'evidence is truncated');
  pass('server caps evidence lines per group and truncates long text');
}
assert.match(serverSource, /\.select\("tag_label, disease_key, polarity, food_name, evidence"\)/);
assert.match(serverSource, /반복된 잘한 행동과 반복된 주의 행동을 찾아/);
pass('period report reads evidence and asks for repeated behaviors');

console.log(`\n${passed} passed`);
