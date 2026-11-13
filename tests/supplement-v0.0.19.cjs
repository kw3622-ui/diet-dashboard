// diet-ai v0.0.19 건강식품 검사: node tests/supplement-v0.0.19.cjs [diet-ai_v0.0.19.ts]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const serverFile = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.19.ts');
const src = fs.readFileSync(serverFile, 'utf8');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));

// 어떤 체인이든 받아 주는 가짜 Supabase. insert/update 내용을 기록한다.
function fakeSupabase(store) {
  const make = (table) => {
    const q = { table, op: 'select', payload: null };
    const result = () => {
      if (q.op === 'insert') { store.inserts.push({ table, payload: q.payload }); return { data: { id: 101, ...q.payload }, error: null }; }
      if (q.op === 'update') { store.updates.push({ table, payload: q.payload }); return { data: null, error: null }; }
      if (table === 'logs' && store.previous && q.selected === 'supplement_info') return { data: { supplement_info: store.previous }, error: null };
      if (table === 'intake_items') return { data: store.item || null, error: null };
      return { data: [], error: null };
    };
    const proxy = new Proxy(q, {
      get(target, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej);
        if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result());
        if (prop === 'insert' || prop === 'update' || prop === 'upsert') return (payload) => { q.op = prop === 'upsert' ? 'insert' : prop; q.payload = payload; return proxy; };
        if (prop === 'select') return (cols) => { if (q.op === 'select') q.selected = cols; return proxy; };
        return () => proxy;
      },
    });
    return proxy;
  };
  return { from: make, storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://x/img.jpg' } }) }) } };
}

(async () => {
  let reply = {};
  const prompts = [];
  const server = {
    console, Response, setTimeout: (fn) => fn(), atob: (s) => Buffer.from(s, 'base64').toString('binary'), Uint8Array,
    Deno: { env: { get: () => 'test-key' }, serve: () => {} }, createClient: () => ({}),
    fetch: async (url, init) => {
      prompts.push(JSON.parse(init.body).contents[0].parts.map(p => p.text).filter(Boolean).join('\n'));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 });
    },
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(src).replace(/^import .*;$/gm, '') +
    '\n;Object.assign(globalThis, { sanitizeSupplementInfo, getJsonFormatReq, isMealRow, handleAnalyze, reanalyzeLog, NON_MEAL_CATEGORIES, handleIntakeInfo });').runInContext(server);

  // 정리 함수
  const S = server.sanitizeSupplementInfo;
  assert.deepEqual(plain(S({ labelClaim: '장 건강에 도움을 줄 수 있음', aiNote: '유산균은 장 건강에 쓰입니다.' }, '유산균 1캡슐', true)),
    { version: 1, labelClaim: '장 건강에 도움을 줄 수 있음', fromImage: true, aiNote: '유산균은 장 건강에 쓰입니다.' });
  assert.equal(S({ labelClaim: '면역력 증진에 도움', aiNote: '' }, '발효효소 1포', false), null, 'text input: claim not in the text is dropped');
  assert.equal(S({ labelClaim: '장 건강에 도움을 줄 수 있음', aiNote: '' }, '유산균 먹음, 포장에 장 건강에 도움을 줄 수 있음 이라고 적혀있음', false).labelClaim, '장 건강에 도움을 줄 수 있음');
  assert.equal(S({ aiNote: '중성지방 개선에 쓰입니다(Kris-Etherton, 2002, Circulation). 출혈 주의(Bender 1998).' }, 'x', false).aiNote, '중성지방 개선에 쓰입니다. 출혈 주의.');
  assert.equal(S({ aiNote: 'a'.repeat(500) }, 'x', false).aiNote.length, 400);
  assert.equal(S({ labelClaim: '', aiNote: '' }, 'x', false), null);
  const prev = { version: 1, labelClaim: '혈행 개선에 도움을 줄 수 있음', fromImage: true, aiNote: 'old' };
  assert.deepEqual(plain(S({ labelClaim: '', aiNote: 'new' }, '오메가3 3알로 수정', false, prev)),
    { version: 1, labelClaim: '혈행 개선에 도움을 줄 수 있음', fromImage: true, aiNote: 'new' }, 'reanalyze keeps the claim read from the photo');
  pass('supplement info: verbatim claim only, text claims must be in the text, photo claim kept on edit, citations removed, length limits');

  const fmt = server.getJsonFormatReq(false, false, true);
  for (const t of ['labelClaim', 'aiNote', '글자 그대로', '절대 추측해서 쓰지 마세요', '의학 교과서나 임상 연구로 확인된 내용만', '논문 제목·저자·학술지·연도는 쓰지 마세요', '약사와 확인하세요', '식사·간식으로 평가하지 마세요', '"healthTags": [] 고정'])
    assert.ok(fmt.includes(t), t);
  assert.ok(!server.getJsonFormatReq(false, false).includes('labelClaim'), 'meals unchanged');
  pass('supplement prompt rules (verbatim label, evidence-only note, no citations, pharmacist line)');

  assert.deepEqual(plain(server.NON_MEAL_CATEGORIES), ['운동', '생체기록', '건강식품']);
  assert.equal(server.isMealRow({ category: '건강식품' }), false);
  assert.equal(server.isMealRow({ category: '간식' }), true);
  assert.ok(src.includes('const meals = inWindow.filter((row) => !NON_MEAL_CATEGORIES.includes(row.category));'));
  assert.ok(src.includes("'건강식품' 기록은 식사·간식 횟수로 세지 말고"));
  pass('supplements are not meals (habit, condition, late meals) and daily report is told so');

  // 새 기록 저장
  const store = { inserts: [], updates: [] };
  reply = { foodName: '유산균', ingredients: ['유산균(1캡슐)'], analysis: '유산균 1캡슐을 드셨어요.', isAlcohol: false,
    healthTags: [{ foodIndex: 0, sourceQuote: '유산균', diseaseKey: 'gout', polarity: 'helpful', confidence: 0.9 }],
    sharedOrder: { isShared: true, dishes: ['유산균 3인분'] }, labelClaim: '장 건강에 도움', aiNote: '장 건강 보조에 쓰입니다.' };
  const res = await server.handleAnalyze(fakeSupabase(store), 'u1', { type: 'text', naturalText: '유산균 1캡슐', memo: '', date: '2026-11-13', time: '08:10', category: '건강식품' });
  const logInsert = store.inserts.find(i => i.table === 'logs').payload;
  assert.equal(logInsert.category, '건강식품');
  assert.equal(logInsert.portion_check, null);
  assert.deepEqual(plain(logInsert.supplement_info), { version: 1, labelClaim: '', fromImage: false, aiNote: '장 건강 보조에 쓰입니다.' });
  assert.equal(store.inserts.filter(i => i.table === 'food_health_tags').length, 0);
  assert.deepEqual(plain(res.supplementInfo), plain(logInsert.supplement_info));
  assert.ok(prompts[0].includes('[건강식품]') && prompts[0].includes('labelClaim'));
  pass('analyze: supplement saved with info, no health tags, no portion check');

  // 식사는 그대로
  const store2 = { inserts: [], updates: [] };
  reply = { foodName: '비빔밥', ingredients: ['비빔밥(밥)'], analysis: 'ok', isAlcohol: false, healthTags: [], labelClaim: 'x', aiNote: 'y' };
  await server.handleAnalyze(fakeSupabase(store2), 'u1', { type: 'text', naturalText: '비빔밥', date: '2026-11-13', time: '12:10', category: '점심식사' });
  assert.equal(store2.inserts.find(i => i.table === 'logs').payload.supplement_info, null);
  pass('meals never store supplement info');

  // 재분석: 사진에서 읽은 포장 문구 유지, 종류가 바뀌면 비움
  const store3 = { inserts: [], updates: [], previous: prev };
  reply = { foodName: '오메가3', ingredients: ['오메가3(3알)'], analysis: 'ok', isAlcohol: false, healthTags: [], labelClaim: '', aiNote: '중성지방 관리에 쓰입니다.' };
  await server.reanalyzeLog(fakeSupabase(store3), 'u1', { id: 7, type: 'image', naturalText: '', memo: '3알', date: '2026-11-13', time: '08:00', category: '건강식품' }, null);
  const up = store3.updates.find(u => u.table === 'logs').payload;
  assert.equal(up.supplement_info.labelClaim, '혈행 개선에 도움을 줄 수 있음');
  assert.equal(up.portion_check, null);
  assert.equal(up.followup_question, null);
  const store4 = { inserts: [], updates: [], previous: prev };
  await server.reanalyzeLog(fakeSupabase(store4), 'u1', { id: 7, type: 'text', naturalText: '사과', memo: '', date: '2026-11-13', time: '15:00', category: '간식' }, null);
  assert.equal(store4.updates.find(u => u.table === 'logs').payload.supplement_info, null);
  pass('reanalyze: keeps the photo label claim, clears info when changed to a meal');

  // 복용 관리: 등록한 건강식품 AI 설명
  {
    prompts.length = 0;
    const st = { inserts: [], updates: [], item: { id: 'i1', kind: 'supplement', name: '오메가3', dose: '2알', label_claim: '', ai_note: '' } };
    reply = { labelClaim: '혈행 개선에 도움', aiNote: '중성지방 관리에 쓰여요(Kris-Etherton, 2002).' };
    const r = await server.handleIntakeInfo(fakeSupabase(st), 'u1', { itemId: 'i1' });
    assert.deepEqual(plain(r), { labelClaim: '', aiNote: '중성지방 관리에 쓰여요.' }, 'no photo: claim not in the name is dropped, citation removed');
    assert.equal(st.updates[0].table, 'intake_items');
    assert.equal(st.updates[0].payload.ai_note, '중성지방 관리에 쓰여요.');
    assert.ok(prompts[0].includes('[오메가3 2알]'));

    const st2 = { inserts: [], updates: [], item: { id: 'i1', kind: 'supplement', name: '오메가3', dose: '', label_claim: '', ai_note: 'old' } };
    const n = prompts.length;
    assert.deepEqual(plain(await server.handleIntakeInfo(fakeSupabase(st2), 'u1', { itemId: 'i1' })), { labelClaim: '', aiNote: 'old' });
    assert.equal(prompts.length, n, 'already explained: no AI call without a new photo');
    reply = { labelClaim: '혈행 개선에 도움을 줄 수 있음', aiNote: 'new' };
    const r3 = await server.handleIntakeInfo(fakeSupabase(st2), 'u1', { itemId: 'i1', base64Images: ['data:image/jpeg;base64,AAAA'] });
    assert.equal(r3.labelClaim, '혈행 개선에 도움을 줄 수 있음', 'package photo: claim read');

    const st3 = { inserts: [], updates: [], item: { id: 'm1', kind: 'medicine', name: '혈압약', dose: '', label_claim: '', ai_note: '' } };
    await assert.rejects(server.handleIntakeInfo(fakeSupabase(st3), 'u1', { itemId: 'm1' }), /약은 AI 설명을 만들지 않아요/);
    await assert.rejects(server.handleIntakeInfo(fakeSupabase({ inserts: [], updates: [] }), 'u1', { itemId: 'x' }), /찾을 수 없습니다/);
    assert.ok(src.includes('case "intakeInfo": result = await handleIntakeInfo(supabase, userId, payload); break;'));
    pass('intakeInfo: supplements only, once unless a new package photo, claims verified, medicines refused');
  }

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
