// v0.3.11 장기 분석 질문 서버 검사: node tests/long-term-question-v0.3.11.cjs [diet-ai_v0.0.16.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const filename = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.16.ts');
const source = stripTypeScriptTypes(fs.readFileSync(filename, 'utf8')).replace(/^import .*;$/gm, '');

let handler, prompts = [], writes = [], rows = [], nextAiData = null;
const tables = {};
const user = 'test-user';
const profile = { id: user, is_approved: true, is_admin: false, age: 42, height: 173, gender: 'male', disease: '고혈압', ai_mode: 'normal' };

function query(table) {
  const filters = [], orders = [];
  let start = 0, end = Infinity, single = false, operation, values, countMode = false;
  const q = {
    select(v = '*', opts) { if (opts?.count) countMode = true; return q; },
    eq(k, v) { filters.push(r => r[k] === v); return q; },
    neq(k, v) { filters.push(r => r[k] !== v); return q; },
    lt(k, v) { filters.push(r => r[k] < v); return q; },
    lte(k, v) { filters.push(r => r[k] <= v); return q; },
    gte(k, v) { filters.push(r => r[k] >= v); return q; },
    in(k, v) { filters.push(r => v.includes(r[k])); return q; },
    is(k, v) { filters.push(r => (r[k] ?? null) === v); return q; },
    not(k, op, v) { filters.push(r => (r[k] ?? null) !== v); return q; },
    order(k, o) { orders.push([k, o.ascending]); return q; },
    range(a, b) { start = a; end = b; return q; },
    limit(n) { end = n - 1; return q; },
    single() { single = true; return q; },
    maybeSingle() { single = true; return q; },
    insert(v) { operation = 'insert'; values = v; return q; },
    delete() { operation = 'delete'; return q; },
    update(v) { operation = 'update'; values = v; return q; },
    then(resolve, reject) {
      try {
        if (operation) {
          writes.push({ table, operation, values });
          if (table === 'logs' && operation === 'update') {
            rows.filter(r => filters.every(f => f(r))).forEach(r => Object.assign(r, values));
          }
          const saved = { ...values, id: 'saved' };
          return Promise.resolve({ data: single ? saved : [saved], error: null }).then(resolve, reject);
        }
        let result = (table === 'profiles' ? [profile] : table === 'logs' ? rows : (tables[table] || [])).filter(r => filters.every(f => f(r)));
        if (countMode) return Promise.resolve({ data: null, count: result.length, error: null }).then(resolve, reject);
        result.sort((a, b) => {
          for (const [key, asc] of orders) {
            const delta = String(a[key]).localeCompare(String(b[key]));
            if (delta) return asc ? delta : -delta;
          }
          return 0;
        });
        result = result.slice(start, end + 1);
        return Promise.resolve({ data: single ? result[0] : result, error: null }).then(resolve, reject);
      } catch (e) { return Promise.reject(e).then(resolve, reject); }
    },
  };
  return q;
}
const client = {
  from: query,
  auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) },
  storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: p => ({ data: { publicUrl: 'https://example.invalid/' + p } }) }) },
};
const sandbox = {
  console, Request, Response, Uint8Array, atob,
  Deno: { env: { get: () => 'test-only' }, serve: fn => { handler = fn; } },
  createClient: () => client,
  fetch: async (url, options) => {
    const body = JSON.parse(options.body);
    prompts.push(body.contents[0].parts[0].text);
    const answer = JSON.stringify(nextAiData || { foodName: 'test', analysis: 'test', ingredients: [], isAlcohol: false, healthTags: [] });
    nextAiData = null;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }] }));
  },
};
vm.createContext(sandbox);
new vm.Script(source + '\n;globalThis.__consts = {};', { filename }).runInContext(sandbox);

const ex = (id, date, items, extra = {}) => ({
  id, user_id: user, log_date: date, log_time: '19:00', category: '운동', raw_input: {},
  ingredients: items.map(i => i.name), exercise_meta: { version: 1, items }, ...extra,
});
const item = (name, targets, kind = 'strength') => ({ name, kind, targets, source: 'dict', minutes: null });

async function request(action, payload) {
  prompts = []; writes = [];
  const response = await handler(new Request('https://example.invalid/diet-ai', {
    method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ action, payload }),
  }));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

const plain = v => JSON.parse(JSON.stringify(v));
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

async function requestError(action, payload) {
  prompts = []; writes = [];
  const response = await handler(new Request('https://example.invalid/diet-ai', {
    method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ action, payload }),
  }));
  const body = await response.json();
  assert.notEqual(response.status, 200);
  return body.error;
}
const habit = { id: 'h1', user_id: user, report_date: '2026-11-04', window_start: '2026-07-01', window_end: '2026-11-04', record_count: 533,
  snapshot: { months: [{ month: '2026-10', values: { lateMealDays: 12 } }] }, report_data: { summary: '야식이 늘었어요', badHabits: [{ metric: 'lateMealDays', title: '늦은 저녁' }] } };
const condition = { id: 'c1', user_id: user, condition_label: '고혈압', window_start: '2026-09-06', window_end: '2026-11-04',
  snapshot: { full: { alcoholDays: 5 } }, report_data: { headline: '혈압 관리', summary: '음주가 줄었어요' } };
const strangers = { id: 'h-other', user_id: 'someone-else', window_start: 'x', window_end: 'y', record_count: 1, snapshot: {}, report_data: { summary: '남의 분석' } };

(async () => {
  await test('first habit question uses the stored report and saves seq 1', async () => {
    tables.habit_reports = [habit, strangers]; tables.condition_reports = [condition]; tables.long_term_followups = [];
    nextAiData = null;
    const res = await request('longTermQuestion', { kind: 'habit', reportId: 'h1', question: '  야식을 줄이려면?  ' });
    assert.match(prompts[0], /전체 기간 습관 분석 \(2026-07-01 ~ 2026-11-04, 기록 533건\)/);
    assert.match(prompts[0], /야식이 늘었어요/);
    assert.match(prompts[0], /"lateMealDays":12/);
    assert.match(prompts[0], /\[사용자의 질문\]\n야식을 줄이려면\?/);
    assert.match(prompts[0], /숫자는 집계에 있는 값만/);
    assert.doesNotMatch(prompts[0], /\[이 분석에 대한 이전 질문과 답변\]/);
    const saved = writes.find(w => w.table === 'long_term_followups').values;
    assert.deepEqual(plain(saved), { user_id: user, report_kind: 'habit', report_id: 'h1', seq: 1, question: '야식을 줄이려면?', answer: res.answer });
  });

  await test('second question sees the first one and saves seq 2', async () => {
    tables.long_term_followups = [{ user_id: user, report_kind: 'habit', report_id: 'h1', seq: 1, question: '야식을 줄이려면?', answer: '저녁을 일찍' }];
    await request('longTermQuestion', { kind: 'habit', reportId: 'h1', question: '그럼 몇 시까지?' });
    assert.match(prompts[0], /질문 1: 야식을 줄이려면\?\n답변 1: 저녁을 일찍/);
    assert.equal(writes.find(w => w.table === 'long_term_followups').values.seq, 2);
  });

  await test('third question is refused before any AI call', async () => {
    tables.long_term_followups.push({ user_id: user, report_kind: 'habit', report_id: 'h1', seq: 2, question: 'q', answer: 'a' });
    assert.match(await requestError('longTermQuestion', { kind: 'habit', reportId: 'h1', question: '세 번째' }), /2회까지/);
    assert.equal(prompts.length, 0);
  });

  await test('condition reports have their own two questions', async () => {
    tables.long_term_followups.push({ user_id: user, report_kind: 'habit', report_id: 'c1', seq: 1, question: 'q', answer: 'a' });
    await request('longTermQuestion', { kind: 'condition', reportId: 'c1', question: '술은?' });
    assert.match(prompts[0], /고혈압 기저질환별 2개월 분석 \(2026-09-06 ~ 2026-11-04\)/);
    assert.doesNotMatch(prompts[0], /\[이 분석에 대한 이전 질문과 답변\]/);
    assert.equal(writes.find(w => w.table === 'long_term_followups').values.seq, 1);
  });

  await test('bad input, unknown kinds and other users reports are refused', async () => {
    tables.long_term_followups = [];
    assert.match(await requestError('longTermQuestion', { kind: 'daily', reportId: 'h1', question: 'q' }), /질문할 수 있는 분석이 아닙니다/);
    assert.match(await requestError('longTermQuestion', { kind: 'habit', question: 'q' }), /분석 id가 없습니다/);
    assert.match(await requestError('longTermQuestion', { kind: 'habit', reportId: 'h1', question: '   ' }), /질문을 입력해주세요/);
    assert.match(await requestError('longTermQuestion', { kind: 'habit', reportId: 'h1', question: 'x'.repeat(301) }), /300자/);
    assert.match(await requestError('longTermQuestion', { kind: 'habit', reportId: 'h-other', question: 'q' }), /찾을 수 없습니다/);
    assert.match(await requestError('longTermQuestion', { kind: 'condition', reportId: 'h1', question: 'q' }), /찾을 수 없습니다/);
    assert.equal(prompts.length, 0);
  });

  await test('screen: questions on both long-term cards, habit card drawn as a function', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index_v0.3.11.html'), 'utf8');
    for (const text of [
      '{HabitReportCard()}',
      "renderLongTermQuestions('habit', habitReport.id",
      "renderLongTermQuestions('condition', latestConditionReport.id",
      "callAI('longTermQuestion', { kind, reportId, question })",
      'const LONG_TERM_QUESTION_LIMIT = 2;',
      "if (/회까지 할 수 있어요/.test(err.message || '')) showNotice(err.message);",
      "sb.from('long_term_followups')",
      'maxLength={300}',
    ]) assert.ok(html.includes(text), text);
    assert.ok(!html.includes('<HabitReportCard />'));
  });

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
