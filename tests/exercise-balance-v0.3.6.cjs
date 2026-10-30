// v0.3.6 운동 부위 분류·균형 서버 검사: node tests/exercise-balance-v0.3.6.cjs [diet-ai_v0.0.11.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const filename = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.11.ts');
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
new vm.Script(source + '\n;globalThis.__consts = { EXERCISE_PARTS, SUB_PART_DEFAULT_EXAMPLES };', { filename }).runInContext(sandbox);
const { EXERCISE_PARTS, SUB_PART_DEFAULT_EXAMPLES } = sandbox.__consts;

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

(async () => {
  await test('dictionary classifies common barbell/dumbbell exercises', () => {
    const cases = [
      ['인클라인 덤벨 프레스(3세트)', ['chest.upper_chest']],
      ['벤치프레스(5x5)', ['chest.mid_chest']],
      ['바벨 벤치 프레스 60kg', ['chest.mid_chest']],
      ['딥스(3세트)', ['chest.lower_chest', 'arm.triceps']],
      ['벤치 딥스', ['arm.triceps']],
      ['인클라인 푸시업', ['chest.lower_chest']],
      ['브릿지 덤벨 플로어 프레스', ['chest.lower_chest']],
      ['레그 컬', ['legs.hamstrings']],
      ['바벨 컬', ['arm.biceps']],
      ['스컬 크러셔', ['arm.triceps']],
      ['데드버그', ['core.abs']],
      ['데드리프트(100kg)', ['back.lower_back', 'legs.hamstrings', 'legs.glutes']],
      ['업라이트 로우', ['shoulder.side_delt']],
      ['원암 덤벨 로우', ['back.mid_back']],
      ['사이드 플랭크', ['core.obliques']],
      ['가슴 운동(1시간)', ['chest']],
      ['하체운동', ['legs']],
    ];
    for (const [text, targets] of cases) {
      const got = sandbox.classifyExerciseByDictionary(text);
      assert.ok(got, text);
      assert.deepEqual([...got.targets], targets, text);
    }
    assert.equal(sandbox.classifyExerciseByDictionary('러닝머신 인클라인 걷기(30분)').kind, 'cardio');
    assert.equal(sandbox.classifyExerciseByDictionary('등산 2시간').kind, 'cardio');
    assert.equal(sandbox.classifyExerciseByDictionary('스트레칭').kind, 'flexibility');
    assert.equal(sandbox.classifyExerciseByDictionary('케이블 크로스오버'), null);
    assert.equal(sandbox.classifyExerciseByDictionary('내용 없음'), null);
  });

  await test('every default example is classified back into its own sub-part (no decline bench)', () => {
    for (const [part, def] of Object.entries(EXERCISE_PARTS)) {
      for (const sub of Object.keys(def.subs)) {
        const examples = SUB_PART_DEFAULT_EXAMPLES[sub];
        assert.ok(examples?.length >= 1, sub);
        for (const name of examples) {
          assert.doesNotMatch(name, /디클라인/, name);
          const got = sandbox.classifyExerciseByDictionary(name);
          assert.ok(got && got.targets.includes(`${part}.${sub}`), `${name} -> ${part}.${sub}`);
        }
      }
    }
  });

  await test('meta uses dictionary first, validated AI fallback second', () => {
    const meta = sandbox.buildExerciseMeta(
      ['벤치프레스(5세트)', '케이블 크로스오버(3세트)', '알 수 없는 운동', '러닝머신(30분)'],
      [
        { index: 0, kind: 'strength', targets: ['back.lat'] },
        { index: 1, kind: 'strength', targets: ['chest.lower_chest', 'bogus.part', 'chest.nope'] },
        { index: 2, kind: 'weird', targets: ['chest'] },
      ],
    );
    assert.deepEqual(meta.items.map(i => [i.source, i.kind, [...i.targets]]), [
      ['dict', 'strength', ['chest.mid_chest']],
      ['ai', 'strength', ['chest.lower_chest']],
      ['ai', 'unknown', []],
      ['dict', 'cardio', []],
    ]);
    assert.equal(meta.items[3].minutes, 30);
  });

  await test('30-day part balance, recovery exclusion, and all-history sub-part gap', () => {
    const data = [
      // 오래된 가슴 기록(30일 밖) — 세부 비중에는 포함, 30일 횟수에는 제외
      ex('c1', '2026-08-01', [item('바벨 벤치프레스', ['chest.mid_chest']), item('인클라인 덤벨 프레스', ['chest.upper_chest'])]),
      ex('c2', '2026-08-10', [item('바벨 벤치프레스', ['chest.mid_chest'])]),
      ex('c3', '2026-09-01', [item('딥스', ['chest.lower_chest', 'arm.triceps'])]),
      ex('c4', '2026-10-05', [item('바벨 벤치프레스', ['chest.mid_chest'])]),
      ex('c5', '2026-10-12', [item('인클라인 덤벨 프레스', ['chest.upper_chest'])]),
      ex('c6', '2026-10-20', [item('바벨 벤치프레스', ['chest.mid_chest']), item('인클라인 덤벨 프레스', ['chest.upper_chest'])]),
      ex('l1', '2026-10-12', [item('바벨 스쿼트', ['legs.quads', 'legs.glutes'])]),
      ex('b1', '2026-10-28', [item('바벨 로우', ['back.mid_back'])]),
      ex('r1', '2026-10-25', [item('러닝머신', [], 'cardio')]),
    ];
    data[8].exercise_meta.items[0].minutes = 40;
    const b = sandbox.computeExerciseBalance(data, '2026-10-30');
    const byPart = Object.fromEntries(b.partSummary.map(p => [p.part, p]));
    assert.equal(byPart.chest.days, 3);
    assert.equal(byPart.legs.days, 1);
    assert.equal(byPart.legs.daysAgo, 18);
    assert.equal(byPart.back.recent, true);
    assert.equal(byPart.shoulder.lastDate, null);
    assert.deepEqual([...b.recommendOrder], ['shoulder', 'legs', 'chest']);
    assert.equal(b.cardioDays, 1);
    assert.equal(b.cardioMinutes, 40);
    assert.equal(b.cardioNeeded, true);
    const chest = b.subBalance.find(s => s.part === 'chest');
    assert.equal(chest.sessions, 6);
    assert.equal(chest.lacking.sub, 'lower_chest');
    assert.deepEqual([...chest.lacking.examples], ['딥스']);
    assert.equal(chest.lacking.fromHistory, true);
    const legs = b.subBalance.find(s => s.part === 'legs');
    assert.equal(legs.sessions, 1);
    assert.equal(legs.lacking, null);
  });

  await test('sub-part gap falls back to default examples when never done', () => {
    const data = [1, 2, 3, 4].map(n => ex('c' + n, `2026-10-0${n}`, [item('바벨 벤치프레스', ['chest.mid_chest'])]));
    const chest = sandbox.computeExerciseBalance(data, '2026-10-30').subBalance.find(s => s.part === 'chest');
    assert.equal(chest.lacking.fromHistory, false);
    assert.equal(chest.lacking.sub, 'upper_chest');
    assert.deepEqual([...chest.lacking.examples], [...SUB_PART_DEFAULT_EXAMPLES.upper_chest]);
  });

  await test('even distribution and too few sessions produce no sub-part gap', () => {
    const even = ['upper_chest', 'mid_chest', 'lower_chest', 'upper_chest', 'mid_chest', 'lower_chest']
      .map((sub, i) => ex('e' + i, `2026-10-1${i}`, [item('x', ['chest.' + sub])]));
    assert.equal(sandbox.computeExerciseBalance(even, '2026-10-30').subBalance.find(s => s.part === 'chest').lacking, null);
    const few = [ex('f1', '2026-10-01', [item('x', ['chest.mid_chest'])]), ex('f2', '2026-10-02', [item('x', ['chest.mid_chest'])])];
    assert.equal(sandbox.computeExerciseBalance(few, '2026-10-30').subBalance.find(s => s.part === 'chest').lacking, null);
  });

  await test('analyze exercise: balance context in prompt, meta saved, current record excluded', async () => {
    rows = [
      ex('c1', '2026-10-01', [item('바벨 벤치프레스', ['chest.mid_chest'])]),
      ex('c2', '2026-10-08', [item('바벨 벤치프레스', ['chest.mid_chest'])]),
      ex('c3', '2026-10-15', [item('인클라인 덤벨 프레스', ['chest.upper_chest'])]),
      ex('l1', '2026-10-12', [item('바벨 스쿼트', ['legs.quads', 'legs.glutes'])]),
      ex('other', '2026-10-20', [item('딥스', ['chest.lower_chest'])], { user_id: 'someone-else' }),
      ex('future', '2026-11-05', [item('딥스', ['chest.lower_chest'])]),
    ];
    nextAiData = {
      foodName: '가슴 운동', ingredients: ['벤치프레스(5세트)', '케이블 크로스오버(3세트)'], analysis: 'ok', isAlcohol: false, healthTags: [],
      exerciseItems: [{ index: 0, kind: 'strength', targets: ['back.lat'] }, { index: 1, kind: 'strength', targets: ['chest.lower_chest'] }],
    };
    const body = await request('analyze', { type: 'text', naturalText: '벤치프레스 5세트, 케이블 크로스오버 3세트', date: '2026-10-30', time: '19:00', category: '운동' });
    const prompt = prompts[0];
    assert.match(prompt, /운동 부위 균형/);
    assert.match(prompt, /가슴 3일/);
    assert.match(prompt, /하체 1일\(마지막 18일 전\)/);
    assert.match(prompt, /비중이 적은 세부 부위: 밑가슴 \/ 예시 운동: 딥스, 인클라인 푸시업/);
    assert.doesNotMatch(prompt, /사용자가 전에 기록한 운동/, 'other users and future rows must not count');
    assert.match(prompt, /exerciseItems/);
    assert.match(prompt, /chest\.lower_chest\(밑가슴\)/);
    const insert = writes.find(w => w.table === 'logs' && w.operation === 'insert');
    assert.deepEqual(plain(insert.values.exercise_meta.items.map(i => [i.source, i.targets])), [
      ['dict', ['chest.mid_chest']],
      ['ai', ['chest.lower_chest']],
    ]);
    assert.equal(body.exerciseMeta.items.length, 2);
  });

  await test('analyze meal: no exercise context, meta null', async () => {
    rows = [];
    nextAiData = { foodName: '점심', ingredients: ['김밥(밥, 김)'], analysis: 'ok', isAlcohol: false, healthTags: [] };
    await request('analyze', { type: 'text', naturalText: '김밥', date: '2026-10-30', time: '12:00', category: '점심식사' });
    assert.doesNotMatch(prompts[0], /운동 부위 균형/);
    assert.equal(writes.find(w => w.operation === 'insert').values.exercise_meta, null);
  });

  await test('analyze exercise with no classified history tells AI not to judge balance', async () => {
    rows = [];
    nextAiData = { foodName: '스쿼트', ingredients: ['바벨 스쿼트(5세트)'], analysis: 'ok', isAlcohol: false, healthTags: [] };
    await request('analyze', { type: 'text', naturalText: '스쿼트 5세트', date: '2026-10-30', time: '19:00', category: '운동' });
    assert.match(prompts[0], /분류된 기록이 아직 없습니다/);
  });

  await test('balance query failure still saves the exercise record', async () => {
    rows = [];
    const original = client.from;
    client.from = (table) => {
      const q = original(table);
      const orig = q.not;
      q.not = (...args) => { orig(...args); q.then = (resolve, reject) => Promise.resolve({ data: null, error: { message: 'simulated outage' } }).then(resolve, reject); return q; };
      return q;
    };
    try {
      nextAiData = { foodName: '스쿼트', ingredients: ['바벨 스쿼트(5세트)'], analysis: 'ok', isAlcohol: false, healthTags: [] };
      await request('analyze', { type: 'text', naturalText: '스쿼트 5세트', date: '2026-10-30', time: '19:00', category: '운동' });
      assert.match(prompts[0], /불러오지 못했습니다/);
      assert.ok(writes.find(w => w.table === 'logs' && w.operation === 'insert'));
    } finally { client.from = original; }
  });

  await test('reanalyze excludes the edited record and clears meta when category changes', async () => {
    rows = [ex('edit', '2026-10-29', [item('딥스', ['chest.lower_chest'])])];
    nextAiData = { foodName: '스쿼트', ingredients: ['바벨 스쿼트'], analysis: 'ok', isAlcohol: false, healthTags: [] };
    await request('reanalyze', { id: 'edit', type: 'text', naturalText: '스쿼트', date: '2026-10-29', time: '19:00', category: '운동' });
    assert.match(prompts[0], /분류된 기록이 아직 없습니다/);
    let update = writes.find(w => w.table === 'logs' && w.operation === 'update');
    assert.deepEqual([...update.values.exercise_meta.items[0].targets], ['legs.quads', 'legs.glutes']);
    assert.equal(update.values.followup_question, null);

    rows = [ex('edit', '2026-10-29', [item('딥스', ['chest.lower_chest'])])];
    nextAiData = { foodName: '간식', ingredients: ['사과'], analysis: 'ok', isAlcohol: false, healthTags: [] };
    await request('reanalyze', { id: 'edit', type: 'text', naturalText: '사과', date: '2026-10-29', time: '15:00', category: '간식' });
    update = writes.find(w => w.table === 'logs' && w.operation === 'update');
    assert.equal(update.values.exercise_meta, null);
  });

  await test('classifyExercises: dictionary only needs no AI call', async () => {
    rows = [
      { id: 'o1', user_id: user, log_date: '2026-09-01', category: '운동', ingredients: ['바벨 스쿼트(5세트)'], exercise_meta: null },
      { id: 'o2', user_id: user, log_date: '2026-09-02', category: '운동', ingredients: ['내용 없음'], exercise_meta: null },
      { id: 'o3', user_id: 'someone-else', log_date: '2026-09-02', category: '운동', ingredients: ['딥스'], exercise_meta: null },
    ];
    const body = await request('classifyExercises', {});
    assert.equal(prompts.length, 0);
    assert.equal(body.processed, 2);
    assert.equal(body.remaining, 0);
    assert.deepEqual([...rows[0].exercise_meta.items[0].targets], ['legs.quads', 'legs.glutes']);
    assert.deepEqual([...rows[1].exercise_meta.items], []);
    assert.equal(rows[2].exercise_meta, null, 'other users untouched');
  });

  await test('classifyExercises: unknown names go to one AI call and are validated', async () => {
    rows = [
      { id: 'o1', user_id: user, log_date: '2026-09-01', category: '운동', ingredients: ['케이블 크로스오버(3세트)', '벤치프레스'], exercise_meta: null },
      { id: 'o2', user_id: user, log_date: '2026-09-02', category: '운동', ingredients: ['펙 플라이 머신 대신 이상한 운동'], exercise_meta: null },
    ];
    nextAiData = { items: [{ index: 0, kind: 'strength', targets: ['chest.lower_chest', 'nope'] }, { index: 1, kind: 'unknown', targets: [] }] };
    const body = await request('classifyExercises', {});
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /0\. 케이블 크로스오버/);
    assert.doesNotMatch(prompts[0], /벤치프레스/, 'dictionary items are not sent to AI');
    assert.equal(body.usedAi, true);
    assert.deepEqual(plain(rows[0].exercise_meta.items.map(i => [i.source, i.targets])), [['ai', ['chest.lower_chest']], ['dict', ['chest.mid_chest']]]);
  });

  console.log(`\n${passed} passed`);
})().catch(err => { console.error(err); process.exit(1); });
