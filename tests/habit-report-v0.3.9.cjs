// v0.3.9 습관 분석 서버 검사: node tests/habit-report-v0.3.9.cjs [diet-ai_v0.0.14.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const filename = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.14.ts');
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
new vm.Script(source + '\n;globalThis.__h = { todayInSeoul, addDaysStr };', { filename }).runInContext(sandbox);

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
const today = sandbox.__h.todayInSeoul();
const addDays = sandbox.__h.addDaysStr;
const meal = (id, date, time, category, ingredients, extra = {}) => ({ id, user_id: user, log_date: date, log_time: time, category, food_name: 'x', ingredients, raw_input: {}, is_alcohol: false, exercise_meta: null, ...extra });
// 오늘부터 거꾸로 n일 동안 하루 2건(점심 + 저녁)씩 만든다. 최근 30일엔 야식이 늘고 운동이 줄도록.
function buildRows(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(today, -i);
    const recent = i < 30;
    out.push(meal('l' + i, d, '12:30', '점심식사', ['김치찌개(김치, 돼지고기)']));
    out.push(meal('d' + i, d, recent && i % 2 === 0 ? '22:10' : '19:00', '저녁식사', [i % 3 === 0 ? '라면(면, 스프)' : '현미밥(현미)'], { is_alcohol: i % 7 === 0 }));
    if (!recent && i % 2 === 0) out.push(meal('e' + i, d, '07:00', '운동', ['러닝(30분)'], { exercise_meta: { version: 1, items: [{ name: '러닝', kind: 'cardio', targets: [], minutes: 30 }] } }));
  }
  return out;
}

let pass_report;
(async () => {
  await test('too few records are refused before any AI call', async () => {
    rows = buildRows(10); tables.habit_reports = []; tables.food_health_tags = []; tables.meal_statuses = [];
    assert.match(await requestError('habitReport', {}), /30건 이상 쌓이면.*현재 20건/);
    assert.equal(prompts.length, 0);
  });

  await test('snapshot counts monthly habits and recent-vs-earlier trends on the server', async () => {
    rows = buildRows(90);
    tables.food_health_tags = [
      { user_id: user, log_id: 'd3', tag_label: '혈압 주의', disease_key: 'hypertension', polarity: 'caution', food_name: '라면', evidence: '라면 국물 다 먹음' },
      { user_id: user, log_id: 'd6', tag_label: '혈압 주의', disease_key: 'hypertension', polarity: 'caution', food_name: '라면', evidence: '라면 국물 다 먹음' },
      { user_id: user, log_id: 'gone', tag_label: '혈압 주의', disease_key: 'hypertension', polarity: 'caution', food_name: '라면', evidence: '범위 밖' },
    ];
    tables.meal_statuses = [{ user_id: user, status_date: addDays(today, -1), meal_slot: 'breakfast', status: 'skipped' }, { user_id: user, status_date: addDays(today, -1), meal_slot: 'lunch', status: 'skipped' }];
    nextAiData = {
      summary: '요약', goodHabits: [{ metric: 'cardioDays', title: '꾸준한 러닝', detail: '이전엔 이틀에 한 번' }, { metric: 'made-up', title: '가짜', detail: 'x' }],
      badHabits: [{ metric: 'lateMealDays', title: '늦은 저녁', detail: '최근 늘었어요' }, { metric: 'lateMealDays', title: '중복', detail: 'x' }, { metric: 'food:라면', title: '라면', detail: '' }],
      advice: ['저녁을 21시 전에', 'b', 'c'],
    };
    const res = await request('habitReport', {});
    const snap = res.snapshot;
    assert.equal(snap.totalRecords, rows.length);
    assert.equal(snap.windowEnd, today);
    assert.equal(snap.windowStart, addDays(today, -89));
    const recentLate = snap.trends.lateMealDays;
    assert.equal(recentLate.direction, 'up');
    assert.equal(recentLate.recentRatePct, 50);
    assert.equal(recentLate.earlierRatePct, 0);
    assert.equal(snap.trends.exerciseDays.direction, 'down');
    assert.equal(snap.trends.cardioDays.earlierRatePct, 50);
    const monthSum = (key) => snap.months.reduce((s, m) => s + (m.values[key] || 0), 0);
    assert.equal(monthSum('lateMealDays'), 15);
    assert.equal(monthSum('skippedBreakfastDays'), 1);
    assert.equal(monthSum('tag:hypertension:caution'), 2);
    assert.ok(snap.metrics['food:라면'] && snap.metrics['food:김치찌개']);
    assert.equal(snap.metrics['tag:hypertension:caution'].good, 'down');
    assert.equal(snap.months.at(-1).partial, true);
    assert.equal(snap.firstTagDate, addDays(today, -6));
    assert.match(prompts[0], /라면 국물 다 먹음 \[라면\] ×2/);
    assert.doesNotMatch(prompts[0], /범위 밖/);
    assert.match(prompts[0], /태그는 .*부터만 기록되었습니다/);
    assert.match(prompts[0], /서버가 센 값이니 다시 세거나 바꾸지 마세요/);
    pass_report = res;
  });

  await test('AI output is limited to known metrics, deduped and trimmed', async () => {
    const r = pass_report.report_data;
    assert.deepEqual(plain(r.goodHabits.map(h => h.metric)), ['cardioDays']);
    assert.deepEqual(plain(r.badHabits.map(h => h.metric)), ['lateMealDays', 'food:라면']);
    assert.equal(r.advice.length, 2);
    const saved = writes.find(w => w.table === 'habit_reports').values;
    assert.equal(saved.report_date, today);
    assert.equal(saved.user_id, user);
    assert.equal(saved.record_count, rows.length);
  });

  await test('second analysis on the same day is refused without an AI call', async () => {
    tables.habit_reports = [{ id: 'h1', user_id: user, report_date: today }];
    assert.match(await requestError('habitReport', {}), /하루 1회/);
    assert.equal(prompts.length, 0);
    tables.habit_reports = [{ id: 'h0', user_id: user, report_date: addDays(today, -1) }, { id: 'other', user_id: 'someone-else', report_date: today }];
    nextAiData = { summary: 's', goodHabits: [], badHabits: [], advice: [] };
    await request('habitReport', {});
    assert.equal(prompts.length, 1);
  });

  await test('other users rows are never counted', async () => {
    tables.habit_reports = [];
    rows = [...buildRows(40), ...buildRows(40).map(r => ({ ...r, id: 'x' + r.id, user_id: 'someone-else', is_alcohol: true }))];
    nextAiData = { summary: 's', goodHabits: [], badHabits: [], advice: [] };
    const res = await request('habitReport', {});
    assert.equal(res.snapshot.totalRecords, buildRows(40).length);
  });

  await test("screen: habit card in long-term tab, once a day, expected errors do not reload", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "..", "index_v0.3.9.html"), "utf8");
    const literal = [
      'data-habit-report', '<HabitReportCard />', "callAI('habitReport', {}",
      'disabled={isGeneratingHabit || analyzedToday || notEnough}', 'habitReport?.report_date === today',
      "if (/하루 1회|건 이상 쌓이면/.test(err.message || '')) showNotice(err.message)",
      "activeTab === 'analysis' && analysisView === 'longterm') fetchHabitReport()",
      "from('habit_reports').select('*').order('created_at', { ascending: false }).limit(1)",
      "isGeneratingHabit ? '🌱 전체 기록에서 습관을 찾는 중입니다...'",
    ];
    for (const text of literal) assert.ok(html.includes(text), text);
  });

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
