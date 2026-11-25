// diet-ai v0.0.21 운동 세트·유산소 숫자 검사: node tests/exercise-details-v0.0.21.cjs [diet-ai_v0.0.21.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const serverFile = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.21.ts');
const src = fs.readFileSync(serverFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };

const ENV = 'https://proj.supabase.co';
const OWN = `${ENV}/storage/v1/object/public/diet-images/u/`;

(async () => {
  const geminiPrompts = [];
  const fetched = [];
  let geminiReply = { items: [] };
  const server = {
    console, Response, setTimeout: (fn) => fn(), btoa,
    Deno: { env: { get: (k) => (k === 'SUPABASE_URL' ? ENV : 'test-key') }, serve: () => {} }, createClient: () => ({}),
    fetch: async (url, init) => {
      if (String(url).startsWith(OWN)) {
        fetched.push(url);
        if (url.includes('missing')) return new Response('', { status: 404 });
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      const body = JSON.parse(init.body);
      geminiPrompts.push({ text: body.contents[0].parts[0].text, images: body.contents[0].parts.length - 1 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiReply) }] } }] }), { status: 200 });
    },
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(src).replace(/^import .*;$/gm, '') +
    '\n;Object.assign(globalThis, { exerciseItemMinutes, sanitizeExerciseSets, parseCardioText, buildExerciseMeta, rebuildExerciseMeta, isOwnImageUrl, handleReadExerciseDetails, computeExerciseBalance, getJsonFormatReq, EXERCISE_DETAIL_VERSION });').runInContext(server);
  const s = server;
  const plain = (v) => JSON.parse(JSON.stringify(v));

  // 1. 시간 읽기: 시간+분을 더하고 페이스·시각은 세지 않는다
  assert.equal(s.exerciseItemMinutes('보행(4.38km, 1시간 2분 3초 소요)'), 62);
  assert.equal(s.exerciseItemMinutes('무분할 운동(1시간)'), 60);
  assert.equal(s.exerciseItemMinutes('운동 시간: 30분 4초'), 30);
  assert.equal(s.exerciseItemMinutes('평균 페이스 6분 06초/km'), null);
  assert.equal(s.exerciseItemMinutes('평균 페이스 7:24/km'), null);
  assert.equal(s.exerciseItemMinutes('가장 활발한 시간대 오후 1시 30분 ~ 2시'), null);
  pass('minutes add hours and skip pace and clock times');

  // 2. 세트 정리: 범위 밖 숫자는 버리고 빈 세트는 뺀다
  const sets = plain(s.sanitizeExerciseSets([{ weight: '60', reps: 8 }, { weight: null, reps: 7 }, { weight: 9999, reps: 5 }, {}, { weight: 20, unit: 'lb', seconds: 30 }]));
  assert.deepEqual(sets, [
    { weight: 60, unit: 'kg', reps: 8, seconds: null },
    { weight: null, unit: null, reps: 7, seconds: null },
    { weight: null, unit: null, reps: 5, seconds: null },
    { weight: 20, unit: 'lb', reps: null, seconds: 30 },
  ]);
  assert.deepEqual(plain(s.sanitizeExerciseSets('x')), []);
  assert.equal(s.sanitizeExerciseSets(Array.from({ length: 30 }, () => ({ reps: 1 }))).length, 20);
  pass('sets are sanitized and capped');

  // 3. 새 기록: 근력은 세트, 유산소는 측정값(AI 값 우선, 없으면 글에서)
  const meta = plain(s.buildExerciseMeta(['바벨 벤치 프레스(4세트)', '트레드밀 러닝(5.3km, 40분)'], [
    { index: 0, kind: 'strength', targets: ['chest.mid_chest'], sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }] },
    { index: 1, kind: 'cardio', targets: [], paceSecPerKm: 462, avgHeartRate: 130, sets: [{ reps: 3 }] },
  ], '무분할'));
  assert.equal(meta.version, 2);
  assert.equal(meta.items[0].targets[0], 'chest.mid_chest');
  assert.equal(meta.items[0].sets.length, 2);
  assert.equal(meta.items[1].kind, 'cardio');
  assert.equal(meta.items[1].sets, undefined, 'cardio has no sets');
  assert.deepEqual([meta.items[1].distanceKm, meta.items[1].minutes, meta.items[1].paceSecPerKm, meta.items[1].avgHeartRate], [5.3, 40, 462, 130]);
  pass('new records keep sets and cardio numbers');

  // 4. 측정값만 쪼개진 예전 기록은 하나로 합친다
  const merged = plain(s.buildExerciseMeta(['거리 4.01km', '평균 심박수 164bpm', '평균 페이스 6분 06초/km', '총 운동 시간 24분 27초'], [], '러닝'));
  assert.equal(merged.items.length, 1);
  assert.deepEqual(merged.items[0], { name: '러닝', kind: 'cardio', targets: [], source: 'merged', minutes: 24, distanceKm: 4.01, paceSecPerKm: 366, avgHeartRate: 164 });
  const walk = plain(s.buildExerciseMeta(['총 걸음 수 9,804보', '총 이동 거리 7.62km', '가장 활발한 시간대 오후 1시 30분 ~ 2시'], [], '걷기 운동'));
  assert.equal(walk.items.length, 1);
  assert.equal(walk.items[0].distanceKm, 7.62);
  assert.equal(walk.items[0].minutes, null);
  const two = plain(s.buildExerciseMeta(['천국의 계단 15분', '런닝머신 2km 15분'], [], '운동'));
  assert.equal(two.items.length, 2, 'real exercises stay separate');
  assert.equal(two.items[1].distanceKm, 2);
  pass('metric-only records merge into one cardio item');

  // 5. 다시 읽기: 이름·종류·부위·출처는 그대로, 숫자만 더한다
  const row = {
    food_name: '등 운동', ingredients: ['밴드 풀 업(2세트)', '랫 풀 다운(4세트)', '내용 없음'],
    exercise_meta: { version: 1, items: [
      { name: '밴드 풀 업', kind: 'strength', targets: ['back.lat'], source: 'ai', minutes: null },
      { name: '랫 풀 다운', kind: 'strength', targets: ['back.lat'], source: 'dict', minutes: null },
    ] },
  };
  const rebuilt = plain(s.rebuildExerciseMeta(row, [{ index: 0, sets: [{ reps: 7 }, { reps: 6 }] }, { index: 1, sets: [{ weight: 40, reps: 12 }] }, { index: 5, sets: [{ reps: 1 }] }], 'image'));
  assert.equal(rebuilt.detailVersion, 2);
  assert.equal(rebuilt.detailSource, 'image');
  assert.deepEqual(rebuilt.items.map(i => [i.name, i.kind, i.targets.join(), i.source]), [['밴드 풀 업', 'strength', 'back.lat', 'ai'], ['랫 풀 다운', 'strength', 'back.lat', 'dict']]);
  assert.deepEqual(rebuilt.items[0].sets.map(x => x.reps), [7, 6]);
  assert.equal(rebuilt.items[1].sets[0].weight, 40);
  const textOnly = plain(s.rebuildExerciseMeta({ food_name: '보행', ingredients: ['보행(4.38km, 1시간 2분 3초 소요)'], exercise_meta: { version: 1, items: [{ name: '보행', kind: 'cardio', targets: [], source: 'dict', minutes: 60 }] } }, null, 'text'));
  assert.deepEqual([textOnly.items[0].minutes, textOnly.items[0].distanceKm], [62, 4.38]);
  pass('re-reading keeps classification and adds numbers');

  // 6. 사진 주소는 이 사용자 폴더만
  assert.equal(s.isOwnImageUrl(OWN + '2026-11-20_1200_0_1.jpg', 'u'), true);
  assert.equal(s.isOwnImageUrl(`${ENV}/storage/v1/object/public/diet-images/other/a.jpg`, 'u'), false);
  assert.equal(s.isOwnImageUrl('https://evil.example/a.jpg', 'u'), false);
  assert.equal(s.isOwnImageUrl(OWN + '../other/a.jpg', 'u'), false);
  pass('only own image urls are fetched');

  // 7. readExerciseDetails: 사진 있는 기록은 2건만 AI로, 사진 없는 기록은 AI 없이
  const strengthMeta = { version: 1, items: [{ name: '바벨 벤치 프레스', kind: 'strength', targets: ['chest.mid_chest'], source: 'dict', minutes: null }] };
  const rows = [
    { id: 1, log_date: '2026-09-01', food_name: '가슴', ingredients: ['바벨 벤치 프레스(4세트)'], image_urls: [OWN + 'a.jpg'], exercise_meta: strengthMeta },
    { id: 2, log_date: '2026-09-02', food_name: '가슴', ingredients: ['바벨 벤치 프레스(4세트)'], image_urls: [OWN + 'missing.jpg'], exercise_meta: strengthMeta },
    { id: 3, log_date: '2026-09-03', food_name: '가슴', ingredients: ['바벨 벤치 프레스(4세트)'], image_urls: [OWN + 'c.jpg'], exercise_meta: strengthMeta },
    { id: 4, log_date: '2026-09-04', food_name: '보행', ingredients: ['보행(2.33km, 42분 23초)'], image_urls: [], exercise_meta: { version: 1, items: [{ name: '보행', kind: 'cardio', targets: [], source: 'dict', minutes: 42 }] } },
    { id: 5, log_date: '2026-09-05', food_name: '가슴', ingredients: ['바벨 벤치 프레스(4세트)'], image_urls: ['https://evil.example/x.jpg'], exercise_meta: strengthMeta },
  ];
  const saved = [];
  const filters = [];
  const sb = {
    from: () => {
      const q = { op: 'select', head: false, f: [] };
      const b = {
        select: (cols, opts) => { q.head = !!opts?.head; return b; },
        update: (v) => { q.op = 'update'; q.value = v; return b; },
        eq: (c, v) => { q.f.push(['eq', c, v]); return b; },
        not: (c, o, v) => { q.f.push(['not', c, o, v]); return b; },
        is: (c, v) => { q.f.push(['is', c, v]); return b; },
        order: () => b,
        limit: (n) => { q.limit = n; return b; },
        then: (res) => {
          filters.push(q.f);
          if (q.op === 'update') { saved.push({ id: q.f.find(f => f[1] === 'id')[2], meta: q.value.exercise_meta }); return res({ error: null }); }
          if (q.head) return res({ count: 7, error: null });
          return res({ data: rows, error: null });
        },
      };
      return b;
    },
  };
  geminiReply = { items: [{ index: 0, sets: [{ weight: 60, unit: 'kg', reps: 8 }] }] };
  const result = plain(await s.handleReadExerciseDetails(sb, 'u'));
  assert.deepEqual(result, { processed: 4, remaining: 7, usedAi: true });
  assert.deepEqual(saved.map(x => x.id), [1, 2, 4, 5], 'third image record waits for the next call');
  assert.equal(geminiPrompts.length, 1, 'missing image does not call AI');
  assert.equal(geminiPrompts[0].images, 1);
  assert.ok(geminiPrompts[0].text.includes('0. 바벨 벤치 프레스 (근력)'));
  assert.equal(saved[0].meta.items[0].sets[0].weight, 60);
  assert.equal(saved[1].meta.detailSource, 'image-missing');
  assert.equal(saved[2].meta.detailSource, 'text');
  assert.equal(saved[2].meta.items[0].distanceKm, 2.33);
  assert.equal(saved[3].meta.detailSource, 'text', 'foreign url is never fetched');
  assert.ok(!fetched.some(u => u.includes('evil')));
  assert.ok(saved.every(x => x.meta.detailVersion === 2));
  assert.ok(filters[0].some(f => f[0] === 'is' && f[1] === 'exercise_meta->>detailVersion'), 'only unread records');
  assert.ok(filters[0].some(f => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'u'), 'own records only');
  pass('readExerciseDetails reads two photo records per call and the rest without AI');

  // 8. 새 기록 프롬프트에 세트·유산소 규칙이 있다
  const req = s.getJsonFormatReq(false, true, false);
  for (const t of ['"sets": [{"weight": 60', 'paceSecPerKm', '측정값은 따로 항목으로 나누지 말고', '"최고 무게", "1RM", "총 횟수", "볼륨"은 세트가 아닙니다', '추측하거나 계산해서 만들지 마세요']) assert.ok(req.includes(t), t);
  assert.ok(/exerciseMeta\.detailVersion = EXERCISE_DETAIL_VERSION/.test(src), 'new analyses are marked as read');
  assert.ok(/case "readExerciseDetails": result = await handleReadExerciseDetails\(supabase, userId\)/.test(src));
  pass('analysis prompt asks for sets and cardio numbers');

  // 9. 띄어쓰기만 다른 이름은 하나로 센다
  const bal = s.computeExerciseBalance([
    { log_date: '2026-11-01', exercise_meta: { items: [{ name: '밴드 풀업', kind: 'strength', targets: ['back.lat'] }] } },
    { log_date: '2026-11-03', exercise_meta: { items: [{ name: '밴드 풀 업', kind: 'strength', targets: ['back.lat'] }] } },
  ], '2026-11-05');
  const lat = bal.subBalance.find(p => p.part === 'back').subs.find(x => x.sub === 'lat');
  assert.deepEqual(plain(lat.ownNames), ['밴드 풀업']);
  pass('exercise names differing only by spaces count as one');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
