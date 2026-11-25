// diet-ai v0.0.22 운동 코치(workoutCoach) 검사: node tests/workout-coach-v0.0.22.cjs [diet-ai_v0.0.22.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const serverFile = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.22.ts');
const src = fs.readFileSync(serverFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = (v) => JSON.parse(JSON.stringify(v));

(async () => {
  const prompts = [];
  let reply = '';
  let replyIsJson = true;
  const server = {
    console, Response, setTimeout: (fn) => fn(), btoa,
    Deno: { env: { get: () => 'test-key' }, serve: () => {} }, createClient: () => ({}),
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      prompts.push({ text: body.contents[0].parts[0].text, mime: body.generationConfig.responseMimeType });
      const text = replyIsJson ? JSON.stringify(reply) : reply;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
    },
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(src).replace(/^import .*;$/gm, '') +
    '\n;Object.assign(globalThis, { handleWorkoutCoach, sanitizeCoachParse });').runInContext(server);
  const s = server;

  // 1. 정해진 값만 통과
  assert.deepEqual(plain(s.sanitizeCoachParse({ minutes: 33, condition: 'sleepy', groups: ['legs', 'arms', 'shoulder'], avoid: ['shoulder'], place: 'gym' })),
    { minutes: 30, avoid: ['shoulder'], groups: ['legs'] });
  assert.deepEqual(plain(s.sanitizeCoachParse({ minutes: 500, condition: 'tired', place: 'apartment' })), { condition: 'tired', place: 'apartment' });
  assert.deepEqual(plain(s.sanitizeCoachParse(null)), {});
  pass('parse result keeps only allowed values (20~120 minutes, conditions, 7 groups, place, avoid wins over groups)');

  // 2. parse: 짧은 입력만, JSON 요청
  reply = { minutes: null, condition: 'tired', groups: [], avoid: [], place: null };
  const parsed = plain(await s.handleWorkoutCoach({ mode: 'parse', text: '어제 회식해서 몸이 무거워' + 'ㅋ'.repeat(200) }));
  assert.deepEqual(parsed, { parsed: { condition: 'tired' } });
  assert.equal(prompts[0].mime, 'application/json');
  assert.ok(prompts[0].text.includes('어제 회식해서 몸이 무거워'));
  assert.ok(!prompts[0].text.includes('ㅋ'.repeat(101)), 'text is cut at 100 characters');
  await assert.rejects(() => s.handleWorkoutCoach({ mode: 'parse', text: '   ' }));
  pass('parse mode: one JSON call, input capped at 100 chars, empty text refused');

  // 3. comment: 계획만 풀어 주는 지시, 개인정보 없음, 결과 다듬기
  replyIsJson = false;
  reply = '**하체를 8일** 쉬었으니\n오늘은 레그 프레스부터 천천히 올려 봐요. ' + '가'.repeat(400);
  const out = plain(await s.handleWorkoutCoach({ mode: 'comment', plan: {
    place: 'company', minutes: 40, condition: 'tired', groups: ['legs', 'hack'], auto: true, avoid: ['shoulder'], alcohol: true, lateNight: false,
    cardio: { minutes: 57, goal: 90 }, text: '피곤해서 30분만, 어깨 좀 아파',
    items: [{ name: '레그 프레스', sets: '80kg×15, 80kg×15', reason: '어제 음주 · 무게 유지, 세트 1개 줄임' }],
    status: [{ label: '하체', days: 8, ready: true }, { label: '가슴', days: 1, ready: false }],
    username: 'should-not-appear', disease: 'should-not-appear',
  } }));
  const p = prompts[prompts.length - 1];
  assert.equal(p.mime, 'text/plain');
  assert.match(p.text, /장소: 회사/);
  assert.match(p.text, /오늘 부위: 하체 \(가장 오래 쉰 부위로 자동 선택\)/);
  assert.match(p.text, /아프다고 해서 뺀 부위: 어깨/);
  assert.match(p.text, /어제 음주 기록 있음/);
  assert.match(p.text, /이번 주 유산소: 57\/90분/);
  assert.match(p.text, /- 레그 프레스: 80kg×15, 80kg×15 \(어제 음주/);
  assert.match(p.text, /하체 8일 전, 가슴 1일 전\(회복 중\)/);
  assert.match(p.text, /계획에 없는 종목, 무게, 횟수를 새로 제안하지 마세요/);
  assert.match(p.text, /진단이나 치료·재활 조언은 하지 마세요/);
  assert.match(p.text, /칼로리/);
  assert.ok(!p.text.includes('should-not-appear'), 'no extra profile fields in prompt');
  assert.ok(!out.comment.includes('*') && !out.comment.includes('\n'));
  assert.ok(out.comment.startsWith('하체를 8일 쉬었으니 오늘은 레그 프레스부터'));
  assert.equal(out.comment.length, 300);
  pass('comment mode: plan-only instructions, no extra personal data, cleaned and capped at 300 chars');

  reply = '';
  await assert.rejects(() => s.handleWorkoutCoach({ mode: 'comment', plan: {} }));
  await assert.rejects(() => s.handleWorkoutCoach({ mode: 'other' }));
  pass('empty comment and unknown mode fail (screen then goes on without a comment)');

  // 4. 연결
  assert.match(src, /case "workoutCoach": result = await handleWorkoutCoach\(inputPayload \|\| \{\}\); break;/);
  assert.match(src, /\/\/ v0\.0\.22: workoutCoach action/);
  pass('action wired with the raw client payload (no profile fields added)');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
