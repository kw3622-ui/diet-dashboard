const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const filename = process.argv[2] || 'diet-dashboard/diet-ai_v0.0.5.ts';
const source = stripTypeScriptTypes(fs.readFileSync(filename, 'utf8')).replace(/^import .*;$/gm, '');
let handler, prompts = [], writes = [], reads = [], rows = [], failHistory = false, approved = true;
const user = 'test-user';
const profile = {id:user, is_approved:true, is_admin:false, age:42, height:173, gender:'male'};
function query(table) {
  const filters = [], orders = [];
  let start = 0, end = Infinity, single = false, operation, values, columns = '*';
  const q = {
    select(v = '*') { columns = v; return q; },
    eq(k,v) { filters.push(r => r[k] === v); return q; },
    neq(k,v) { filters.push(r => r[k] !== v); return q; },
    lt(k,v) { filters.push(r => r[k] < v); return q; },
    lte(k,v) { filters.push(r => r[k] <= v); return q; },
    gte(k,v) { filters.push(r => r[k] >= v); return q; },
    order(k,o) { orders.push([k,o.ascending]); return q; },
    range(a,b) { start = a; end = b; return q; },
    limit(n) { end = n - 1; return q; },
    single() { single = true; return q; },
    insert(v) { operation = 'insert'; values = v; return q; },
    update(v) { operation = 'update'; values = v; return q; },
    upsert(v) { operation = 'upsert'; values = v; return q; },
    then(resolve,reject) {
      try {
        if (operation) {
          writes.push({table,operation,values});
          return Promise.resolve({data: single ? {id:'saved'} : [], error:null}).then(resolve,reject);
        }
        reads.push({table,start,columns});
        if (failHistory && columns === 'id, log_date, log_time, raw_input') {
          return Promise.resolve({data:null,error:{message:'simulated outage'}}).then(resolve,reject);
        }
        let result = (table === 'profiles' ? [{...profile,is_approved:approved}] : table === 'logs' ? rows : [])
          .filter(r => filters.every(f => f(r)));
        result.sort((a,b) => {
          for (const [key,asc] of orders) {
            const delta = String(a[key]).localeCompare(String(b[key]));
            if (delta) return asc ? delta : -delta;
          }
          return 0;
        });
        result = result.slice(start,end + 1);
        return Promise.resolve({data:single ? result[0] : result,error:null}).then(resolve,reject);
      } catch(e) { return Promise.reject(e).then(resolve,reject); }
    }
  };
  return q;
}
const client = {
  from:query,
  auth:{getUser:async()=>({data:{user:{id:user}},error:null})},
  storage:{from:()=>({
    upload:async()=>({error:null}),
    getPublicUrl:path=>({data:{publicUrl:'https://example.invalid/'+path}})
  })}
};
const sandbox = {
  console, Request, Response, Uint8Array, atob,
  Deno:{env:{get:()=> 'test-only'},serve:fn=>{handler=fn;}},
  createClient:()=>client,
  fetch:async(url,options)=>{
    const body = JSON.parse(options.body);
    prompts.push(body.contents[0].parts[0].text);
    const answer = body.generationConfig.responseMimeType === 'text/plain' ? 'test report' :
      JSON.stringify({foodName:'test',analysis:'test',ingredients:[],isAlcohol:false,grade:'A',comment:'test'});
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:answer}]}}]}));
  }
};
vm.createContext(sandbox);
new vm.Script(source, {filename}).runInContext(sandbox);
const bio = (id,date,time,values,who=user) => ({
  id,user_id:who,log_date:date,log_time:time,category:'생체기록',raw_input:{biometrics:values}
});
async function request(action, payload) {
  prompts = []; writes = []; reads = [];
  const response = await handler(new Request('https://example.invalid/diet-ai',{
    method:'POST', headers:{Authorization:'Bearer test'},
    body:JSON.stringify({action,payload})
  }));
  const body = await response.json();
  assert.equal(response.status,200,JSON.stringify(body));
  assert.equal(prompts.length,1,'exactly one AI call per feedback request');
  return {body,prompt:prompts[0]};
}
let passed=0;
async function test(name,fn) { await fn(); passed++; console.log('PASS '+name); }
(async()=>{
  await test('all biometric deltas, sparse fields, dates, future/current/same-minute excluded',()=>{
    const data = [
      bio('future','2026-10-01','09:00',{weight:999}),
      bio('edit','2026-09-28','09:00',{weight:888}),
      bio('same','2026-09-30','10:00:00',{weight:777}),
      bio('a','2026-09-29','09:00',{weight:70,bp_sys:130,bp_dia:80,sugar:100,pulse:65,sleep_hours:6}),
      bio('b','2026-09-20','09:00',{weight:72,sugar:110}),
    ];
    const s = sandbox.buildBiometricContext(data,'2026-09-30','10:00',
      {weight:68,bp_sys:120,bp_dia:85,sugar:100,pulse:70,sleep_hours:0},'edit');
    assert.match(s,/이번-직전 -2kg \(하락\)/);
    assert.match(s,/이번-직전 -10mmHg \(하락\)/);
    assert.match(s,/이번-직전 \+5mmHg \(상승\)/);
    assert.match(s,/이번-직전 0mg\/dL \(동일\)/);
    assert.match(s,/이번-직전 \+5bpm \(상승\)/);
    assert.match(s,/이번-직전 -6시간 \(하락\)/);
    assert.match(s,/평균 71kg/);
    assert.match(s,/2026-09-29 09:00 70kg/);
    assert.doesNotMatch(s,/999|888|777/);
  });
  await test('missing/invalid readings never become fabricated zero values',()=>{
    const s=sandbox.buildBiometricContext([
      bio('a','2026-09-29','09:00',{weight:'',sugar:false,bp_sys:-1}),
      bio('b','2026-09-28','09:00',{weight:'70.5'}),
    ],'2026-09-30','10:00',{weight:70.5,sugar:95,bp_sys:null});
    assert.match(s,/직전 2026-09-28 09:00 70.5kg/);
    assert.match(s,/직전 비교 기록 없음/);
    assert.doesNotMatch(s,/수축기 혈압/);
    assert.match(s,/추세 판단 자료 부족/);
    assert.equal(sandbox.bioNumber('  ','weight'),null);
  });
  await test('new biometric request, server profile overrides forged client, saves once',async()=>{
    rows=[bio('past','2026-09-29','09:00',{weight:70}),
      bio('other','2026-09-29','20:00',{weight:999},'different-user')];
    const {prompt,body}=await request('analyze',{
      type:'biometrics',category:'생체기록',date:'2026-09-30',time:'10:00',
      biometrics:{weight:68},healthProfile:{age:99}
    });
    assert.match(prompt,/이번-직전 -2kg \(하락\)/);
    assert.match(prompt,/나이 42세/); assert.match(prompt,/키 173cm/);
    assert.doesNotMatch(prompt,/999|나이 99세/);
    assert.equal(body.id,'saved');
    assert.equal(writes.length,1);
    assert.equal(writes[0].values.raw_input.biometrics.weight,68);
  });
  await test('editing excludes old self and old AI title while preserving update/reset',async()=>{
    rows=[bio('edit','2026-09-15','08:00',{weight:888}),
      bio('past','2026-09-10','09:00',{weight:70}),
      bio('future','2026-09-25','09:00',{weight:999})];
    const {prompt}=await request('reanalyze',{id:'edit',type:'biometrics',category:'생체기록',
      date:'2026-09-20',time:'10:00',biometrics:{weight:68},existingFoodName:'OLD_BIO_TITLE'});
    assert.match(prompt,/이번-직전 -2kg \(하락\)/);
    assert.doesNotMatch(prompt,/888|999|OLD_BIO_TITLE/);
    assert.equal(writes[0].operation,'update');
    assert.equal(writes[0].values.followup_question,null);
    assert.equal(writes[0].values.followup_answer,null);
  });
  await test('history pagination and old per-field predecessor with strict 28-day window',async()=>{
    rows=Array.from({length:1100},(_,i)=>bio('r'+i,'2026-09-20','08:00',{sugar:100}));
    rows.push(bio('oldweight','2026-08-01','08:00',{weight:70}));
    const s=await sandbox.getBiometricContext(client,user,'2026-09-30','10:00',{weight:68,sugar:95});
    assert.match(s,/직전 2026-08-01 08:00 70kg/);
    assert.match(s,/이번 측정 제외 최근 28일 0회/);
    assert.match(s,/최근 28일 1100회/);
    assert.ok(reads.some(r=>r.start===1000));
  });
  await test('food memo survives context; future and edited meals excluded; photo coaching kept',async()=>{
    rows=[
      {id:'prior',user_id:user,log_date:'2026-09-30',log_time:'08:00',category:'아침식사',food_name:'식사',raw_input:{memo:'밥 반 공기만 먹음',naturalText:'사과 반 개'}},
      {id:'later',user_id:user,log_date:'2026-09-30',log_time:'20:00',category:'저녁식사',food_name:'LATER_MEAL'},
      {id:'self',user_id:user,log_date:'2026-09-30',log_time:'07:00',category:'아침식사',food_name:'OLD_SELF'},
    ];
    let out=await request('reanalyze',{id:'self',type:'image',category:'점심식사',date:'2026-09-30',time:'12:00',memo:'두 입',existingFoodName:'보존할 음식'});
    assert.match(out.prompt,/밥 반 공기만 먹음/);
    assert.match(out.prompt,/사과 반 개/);
    assert.match(out.prompt,/보존할 음식/);
    assert.doesNotMatch(out.prompt,/LATER_MEAL|OLD_SELF/);
    out=await request('analyze',{type:'image',category:'점심식사',date:'2026-09-30',time:'12:00',memo:'두 입',base64Images:['data:image/jpeg;base64,YQ==']});
    assert.match(out.prompt,/사진 속 분량과 구성 코칭/);
    assert.ok(out.body.imageUrl);
  });
  await test('text, daily, weekly, monthly and followup use stored demographics',async()=>{
    rows=[{id:'food',user_id:user,food_name:'식사',ingredients:[],analysis:'test',followup_question:null}];
    for(const [action,payload] of [
      ['analyze',{type:'text',category:'점심식사',date:'2026-09-30',time:'12:00',naturalText:'계란 두 개'}],
      ['dailyReport',{date:'2026-09-30',summaryData:'오늘 요약'}],
      ['periodReport',{periodStart:'2026-09-01',summaryData:'월간 요약',isMonth:true}],
      ['periodReport',{periodStart:'2026-09-28',summaryData:'주간 요약',isMonth:false}],
      ['followupQuestion',{id:'food',question:'양이 어떤가요?'}]
    ]) {
      const {prompt}=await request(action,payload);
      assert.match(prompt,/나이 42세/);
      assert.equal(writes.length,1);
    }
  });
  await test('history query failure degrades explicitly without stopping record save',async()=>{
    failHistory=true;
    try {
      const {prompt}=await request('analyze',{type:'biometrics',category:'생체기록',date:'2026-09-30',time:'10:00',biometrics:{weight:68}});
      assert.match(prompt,/과거 생체 기록 조회 실패/);
      assert.equal(writes.length,1);
    } finally {failHistory=false;}
  });
  await test('profile approval guard still rejects unauthorized AI calls',async()=>{
    approved=false; prompts=[];
    try {
      const response=await handler(new Request('https://example.invalid/',{method:'POST',body:'{}'}));
      assert.equal(response.status,403);
      assert.equal(prompts.length,0);
    } finally {approved=true;}
  });
  console.log(passed+' scenario groups passed; external AI and database writes were mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;});

