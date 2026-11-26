// diet-ai v0.0.26 습관 주간 한마디 검사: node tests/habit-note-v0.0.26.cjs [diet-ai_v0.0.26.ts] [index_v0.6.1.html]
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const serverFile = process.argv[2] || path.resolve(__dirname, '..', 'diet-ai_v0.0.26.ts');
const htmlFile = process.argv[3] || path.resolve(__dirname, '..', 'index_v0.6.1.html');
const src = fs.readFileSync(serverFile, 'utf8');
const html = fs.readFileSync(htmlFile, 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const pass = (name) => { passed++; console.log('PASS ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));

function fakeSupabase(store) {
  return {
    from(table) {
      const q = { table, op: 'select', filters: {} };
      const proxy = new Proxy(q, {
        get(t, prop) {
          if (prop === 'maybeSingle') return async () => ({ data: store.existing || null, error: null });
          if (prop === 'upsert') return (payload, opts) => { store.upserts.push({ table, payload, opts }); return Promise.resolve({ error: null }); };
          if (prop === 'eq') return (k, v) => { q.filters[k] = v; store.filters = q.filters; return proxy; };
          return () => proxy;
        },
      });
      return proxy;
    },
  };
}

(async () => {
  const prompts = [];
  let reply = '이번 주 **독서**를 꾸준히 지키셨어요.\n아침운동은 다음 주에 스트레칭 5분부터 해 보세요.';
  const server = {
    console, Response, setTimeout: (fn) => fn(),
    Deno: { env: { get: () => 'test-key' }, serve: () => {} }, createClient: () => ({}),
    fetch: async (url, init) => {
      prompts.push(JSON.parse(init.body).contents[0].parts[0].text);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] } }] }), { status: 200 });
    },
  };
  vm.createContext(server);
  new vm.Script(stripTypeScriptTypes(src).replace(/^import .*;$/gm, '') + '\n;Object.assign(globalThis, { handleHabitWeeklyNote, sanitizeHabitItems });').runInContext(server);
  const H = (extra) => ({ name: '독서', bad: '웹툰 보기', min: '1쪽만', cls: 'good', trend: 'up', counted: 14, recorded: 12, done: 9, mini: 1, slipped: 3, ...extra });

  // 새로 만들기
  const store = { upserts: [] };
  const res = await server.handleHabitWeeklyNote(fakeSupabase(store), 'u1', { weekStart: '2026-11-16', habits: [H(), H({ name: '아침운동', bad: '알람 끄고 다시 눕기', min: '스트레칭 5분', cls: 'shaky', trend: 'down', done: 0, mini: 0, slipped: 8, recorded: 8 })] });
  assert.equal(res.note, '이번 주 독서를 꾸준히 지키셨어요. 아침운동은 다음 주에 스트레칭 5분부터 해 보세요.', 'markdown removed, one line');
  assert.equal(prompts.length, 1);
  const p = prompts[0];
  assert.ok(p.includes('- 독서 (버릴 습관: 웹툰 보기, 힘든 날 최소 버전: 1쪽만): 잘 지켜가는 것 · 기록 12번 중 지킴 9번(그중 조금만 1번), 버릴 습관 3번, 전 2주보다 좋아짐'));
  assert.ok(p.includes('아침운동') && p.includes('흔들리는 것') && p.includes('나무라거나 죄책감을 주지 마세요') && p.includes('약 이야기는 하지 마세요'));
  assert.ok(!/고혈압|통풍|disease|질환:/.test(p), 'no disease data in the prompt');
  assert.deepEqual(plain(store.upserts[0]), { table: 'habit_weekly_reviews', payload: { user_id: 'u1', week_start: '2026-11-16', ai_note: res.note, updated_at: store.upserts[0].payload.updated_at }, opts: { onConflict: 'user_id,week_start' } });
  assert.equal(store.filters.user_id, 'u1', 'reads only this user’s row');
  pass('new note: counts only, gentle rules, markdown removed, saved once per user and week');

  // 이미 있으면 AI를 다시 부르지 않음
  const store2 = { upserts: [], existing: { ai_note: '지난번 한마디' } };
  assert.deepEqual(plain(await server.handleHabitWeeklyNote(fakeSupabase(store2), 'u1', { weekStart: '2026-11-16', habits: [H()] })), { note: '지난번 한마디', cached: true });
  assert.equal(prompts.length, 1);
  assert.equal(store2.upserts.length, 0);
  pass('one note per week: existing note returned without calling AI');

  await assert.rejects(server.handleHabitWeeklyNote(fakeSupabase({ upserts: [] }), 'u1', { weekStart: '2026-11-17', habits: [H()] }), /점검할 주가 올바르지 않습니다/, 'not a Monday');
  await assert.rejects(server.handleHabitWeeklyNote(fakeSupabase({ upserts: [] }), 'u1', { weekStart: 'x', habits: [H()] }), /점검할 주/);
  await assert.rejects(server.handleHabitWeeklyNote(fakeSupabase({ upserts: [] }), 'u1', { weekStart: '2026-11-16', habits: [] }), /점검할 습관이 없습니다/);
  const clean = plain(server.sanitizeHabitItems([H({ name: 'x'.repeat(80), cls: 'hack', trend: 'sideways', done: 999, slipped: -3 }), { name: '' }]));
  assert.equal(clean.length, 1);
  assert.deepEqual([clean[0].name.length, clean[0].cls, clean[0].trend, clean[0].done, clean[0].slipped], [40, 'ok', '', 31, 0]);
  assert.ok(src.includes('case "habitWeeklyNote": result = await handleHabitWeeklyNote(supabase, userId, inputPayload || {}); break;'));
  pass('input checks: Monday week, non-empty, names cut, unknown classes and counts clamped');

  // 화면 연결
  for (const [name, text] of [
    ['asks once when the sheet opens', "if (aiNote || askedRef.current || !onAskNote) return;"],
    ['sends names and counts only', "name: x.r.name, bad: x.r.bad_habit || '', min: x.r.min_version || '', cls: x.cls, trend: x.trend,"],
    ['calls the server action', "callAI('habitWeeklyNote', { weekStart: habitReviewTarget.start, habits })"],
    ['note shown above the groups', '🤖 이번 주 한마디'],
    ['failure keeps the review usable', '지금은 한마디를 만들지 못했어요. 아래 점검은 그대로 쓸 수 있어요.'],
    ['saved note reused', "aiNote={habitReviews[habitReviewTarget.start]?.ai_note || ''} onAskNote={askHabitNote}"],
  ]) assert.ok(html.includes(text), name);
  pass('screen: one request per week when opened, names and counts only, failure-safe');

  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
