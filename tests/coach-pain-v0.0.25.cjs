// diet-ai v0.0.25 코치 한마디의 통증 문장 검사: node tests/coach-pain-v0.0.25.cjs [diet-ai_v0.0.25.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const serverFile = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.25.ts');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };

(async () => {
  const prompts = [];
  const server = {
    console, Response, setTimeout: (fn) => fn(),
    Deno: { env: { get: () => 'test-key' }, serve: () => {} }, createClient: () => ({}),
    fetch: async (url, init) => {
      prompts.push(JSON.parse(init.body).contents[0].parts[0].text);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '오늘은 등이에요.' }] }, finishReason: 'STOP' }] }), { status: 200 });
    },
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(fs.readFileSync(serverFile, 'utf8')).replace(/^import .*;$/gm, '') + '\n;globalThis.__coach = handleWorkoutCoach;').runInContext(server);
  const plan = { place: 'company', minutes: 40, groups: ['back'], items: [{ name: '랫 풀다운', sets: '50kg×10', reason: '지난번 다 성공 · +5kg' }], status: [] };

  await server.__coach({ mode: 'comment', plan });
  assert.match(prompts[0], /4\. 통증·부상·전문가 상담 이야기는 쓰지 마세요/);
  assert.ok(!/전문가와 상담하라는 한 문장/.test(prompts[0]));
  pass('no avoided part: the note must not talk about pain or professionals');

  await server.__coach({ mode: 'comment', plan: { ...plan, avoid: ['shoulder', 'legs'] } });
  assert.match(prompts[1], /4\. 사용자가 아프다고 한 부위\(어깨, 하체\)가 있으니, 무리하지 말고 통증이 계속되면 전문가와 상담하라는 한 문장만 쓰세요\. 진단이나 치료·재활 조언은 하지 마세요\./);
  pass('avoided parts: one caution sentence naming those parts, no diagnosis or treatment advice');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
