// v0.3.7 본인 섭취량 확인 서버 검사: node tests/portion-check-v0.3.7.cjs [diet-ai_v0.0.12.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const filename = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.12.ts');
const source = stripTypeScriptTypes(fs.readFileSync(filename, 'utf8')).replace(/^import .*;$/gm, '');

let handler, prompts = [], writes = [], rows = [], nextAiData = null;
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
        let result = (table === 'profiles' ? [profile] : table === 'logs' ? rows : []).filter(r => filters.every(f => f(r)));
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
new vm.Script(source + '\n;globalThis.__consts = { PORTION_SHARES, buildPortionCheck };', { filename }).runInContext(sandbox);
const { PORTION_SHARES, buildPortionCheck } = sandbox.__consts;

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
  const response = await handler(new Request('https://example.invalid/diet-ai', {
    method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ action, payload }),
  }));
  const body = await response.json();
  assert.notEqual(response.status, 200);
  return body.error;
}
const shared = (extra = {}) => ({ foodName: '청국장·제육 외식', analysis: '분석', ingredients: ['청국장(콩)', '제육볶음(돼지고기)'], isAlcohol: false, healthTags: [], ...extra });
const textInput = { type: 'text', naturalText: '전주초가집에서 청국장3인분과 제육볶음2인분을 시켜서 먹었어요', memo: '', date: '2026-11-02', time: '12:30', category: '점심' };
const lastWrite = () => writes.filter(w => w.table === 'logs').at(-1).values;

(async () => {
  await test('AI shared-order output is checked before saving', () => {
    assert.deepEqual(plain(buildPortionCheck({ isShared: true, dishes: ['청국장 3인분', ' ', 7, 'x'.repeat(60)], ownAmountStated: false }, true)),
      { version: 1, dishes: ['청국장 3인분', 'x'.repeat(40)], share: null });
    assert.equal(buildPortionCheck({ isShared: true, dishes: ['청국장 3인분'], ownAmountStated: true }, true), null);
    assert.equal(buildPortionCheck({ isShared: false, dishes: ['청국장 3인분'] }, true), null);
    assert.equal(buildPortionCheck({ isShared: true, dishes: [] }, true), null);
    assert.equal(buildPortionCheck({ isShared: 'true', dishes: ['a'] }, true), null);
    assert.equal(buildPortionCheck({ isShared: true, dishes: ['a'] }, false), null);
    assert.equal(buildPortionCheck(undefined, true), null);
    assert.equal(buildPortionCheck({ isShared: true, dishes: Array.from({ length: 8 }, (_, i) => 'd' + i) }, true).dishes.length, 5);
  });

  await test('analyze asks for sharedOrder and stores a pending check', async () => {
    rows = [];
    nextAiData = shared({ sharedOrder: { isShared: true, dishes: ['청국장 3인분', '제육볶음 2인분'], ownAmountStated: false } });
    const res = await request('analyze', textInput);
    assert.match(prompts[0], /sharedOrder/);
    assert.match(prompts[0], /혼자 먹었다고 단정하지 말고/);
    assert.deepEqual(plain(res.portionCheck), { version: 1, dishes: ['청국장 3인분', '제육볶음 2인분'], share: null });
    assert.deepEqual(plain(lastWrite().portion_check), plain(res.portionCheck));
  });

  await test('analyze stores null for ordinary, stated-amount, exercise and biometric records', async () => {
    nextAiData = shared();
    assert.equal((await request('analyze', textInput)).portionCheck, null);
    nextAiData = shared({ sharedOrder: { isShared: true, dishes: ['청국장 3인분'], ownAmountStated: true } });
    assert.equal((await request('analyze', textInput)).portionCheck, null);
    nextAiData = shared({ sharedOrder: { isShared: true, dishes: ['단체 운동'], ownAmountStated: false } });
    assert.equal((await request('analyze', { ...textInput, category: '운동' })).portionCheck, null);
    assert.doesNotMatch(prompts[0], /sharedOrder/);
    nextAiData = shared({ sharedOrder: { isShared: true, dishes: ['x'], ownAmountStated: false } });
    assert.equal((await request('analyze', { type: 'biometrics', date: '2026-11-02', time: '08:00', category: '생체기록', biometrics: { weight: 70 } })).portionCheck, null);
  });

  const storedLog = (extra = {}) => ({
    id: 'log-1', user_id: user, log_date: '2026-11-02', log_time: '12:30:00', category: '점심',
    food_name: '청국장·제육 외식', ingredients: ['청국장(콩)', '제육볶음(돼지고기)'], analysis: '옛 분석',
    raw_input: { type: 'text', naturalText: textInput.naturalText, memo: '' },
    followup_question: '나트륨은?', followup_answer: '많아요',
    portion_check: { version: 1, dishes: ['청국장 3인분', '제육볶음 2인분'], share: null }, ...extra,
  });

  await test('answerPortion re-analyzes from stored data and keeps the followup', async () => {
    rows = [storedLog()];
    nextAiData = shared({ analysis: '1.5인분 기준 분석', sharedOrder: { isShared: true, dishes: ['딴거'], ownAmountStated: true } });
    const res = await request('answerPortion', { id: 'log-1', share: 1.5, naturalText: '클라이언트가 보낸 다른 글' });
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /전주초가집에서 청국장3인분/);
    assert.doesNotMatch(prompts[0], /클라이언트가 보낸 다른 글/);
    assert.match(prompts[0], /본인은 대략 1\.5인분 정도/);
    assert.match(prompts[0], /청국장 3인분, 제육볶음 2인분/);
    const saved = lastWrite();
    assert.deepEqual(plain(saved.portion_check), { version: 1, dishes: ['청국장 3인분', '제육볶음 2인분'], share: 1.5 });
    assert.equal('followup_question' in saved, false);
    assert.equal(rows[0].followup_answer, '많아요');
    assert.equal(rows[0].log_time, '12:30');
    assert.equal(res.analysis, '1.5인분 기준 분석');
    assert.equal('followupQuestion' in res, false);
  });

  await test('answerPortion labels half and 2+ servings', async () => {
    rows = [storedLog()];
    await request('answerPortion', { id: 'log-1', share: 0.5 });
    assert.match(prompts[0], /대략 반 인분 정도/);
    rows = [storedLog()];
    await request('answerPortion', { id: 'log-1', share: 2 });
    assert.match(prompts[0], /대략 2인분 이상 정도/);
  });

  await test('answerPortion with the same answer skips the AI call', async () => {
    rows = [storedLog({ portion_check: { version: 1, dishes: ['청국장 3인분'], share: 1 } })];
    const res = await request('answerPortion', { id: 'log-1', share: 1 });
    assert.equal(prompts.length, 0);
    assert.equal(res.portionCheck.share, 1);
  });

  await test('answerPortion rejects bad values, other users and records without a check', async () => {
    rows = [storedLog()];
    for (const share of [0, 3, 0.75, null, 'abc']) {
      assert.match(await requestError('answerPortion', { id: 'log-1', share }), /섭취량 값이 올바르지/);
    }
    rows = [storedLog({ user_id: 'someone-else' })];
    assert.match(await requestError('answerPortion', { id: 'log-1', share: 1 }), /기록을 찾을 수 없습니다/);
    rows = [storedLog({ portion_check: null })];
    assert.match(await requestError('answerPortion', { id: 'log-1', share: 1 }), /확인할 기록이 아닙니다/);
    rows = [storedLog({ portion_check: { dishes: [{ evil: true }], share: null } })];
    assert.match(await requestError('answerPortion', { id: 'log-1', share: 1 }), /확인할 기록이 아닙니다/);
  });

  await test('editing a record re-detects the check and clears answers', async () => {
    rows = [storedLog({ portion_check: { version: 1, dishes: ['청국장 3인분'], share: 1.5 } })];
    nextAiData = shared({ sharedOrder: { isShared: true, dishes: ['청국장 3인분'], ownAmountStated: false } });
    const res = await request('reanalyze', { id: 'log-1', ...textInput });
    assert.doesNotMatch(prompts[0], /앱 버튼으로 직접 답변/);
    assert.deepEqual(plain(res.portionCheck), { version: 1, dishes: ['청국장 3인분'], share: null });
    assert.equal(res.followupQuestion, null);
    assert.equal(rows[0].followup_question, null);
    nextAiData = shared({ sharedOrder: { isShared: true, dishes: ['청국장 3인분'], ownAmountStated: true } });
    assert.equal((await request('reanalyze', { id: 'log-1', ...textInput, naturalText: '청국장 3인분 시켜서 나는 1인분 먹음' })).portionCheck, null);
  });

  await test('screen and server use the same share buttons', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index_v0.3.7.html'), 'utf8');
    const m = html.match(/const PORTION_SHARES = (\[[^\]]*\]);/);
    assert.ok(m);
    assert.deepEqual(JSON.parse(m[1]), plain(PORTION_SHARES));
  });

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
