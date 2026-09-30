const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.argv[2], 'utf8');
const edge = fs.readFileSync(process.argv[3], 'utf8');
new Function(stripTypeScriptTypes(edge).replace(/^import .*;$/gm, ''));
const oldEdge = fs.readFileSync(path.join(path.dirname(process.argv[3]), 'diet-ai_v0.0.2.ts'), 'utf8');
function builder(source) {
  const body = source.slice(source.indexOf('function buildPrompt('), source.indexOf('async function handleAnalyze('));
  return new Function(stripTypeScriptTypes(body) + '; return buildPrompt;')();
}
const oldBuild = builder(oldEdge), newBuild = builder(edge);
const base = {isBio:false,isExercise:false,naturalText:'테스트 식단',memo:'밥은 반만 먹음',combinedContext:'CONTEXT',jsonFormatReq:'FORMAT',mode:'new'};
for (const opts of [{type:'text'}, {type:'biometrics',isBio:true,biometrics:{weight:70}}, {type:'image',isExercise:true}, {type:'image',mode:'edit'}]) {
  assert.equal(newBuild({...base,...opts}), oldBuild({...base,...opts}));
}
assert.notEqual(newBuild({...base,type:'image'}),oldBuild({...base,type:'image'}));
const mock = `window.supabase = {createClient() {
  const profile = {username:'test',height:170,weight:70,age:30,gender:'male',is_approved:true,is_admin:false,goal_alcohol_free_weekly:4};
  window.savedProfile = null;
  const session = {user:{id:'test-user'},access_token:'test-token'};
  const rows = [{id:'a',log_date:'2026-09-29',log_time:'18:00',category:'저녁식사',food_name:'테스트',ingredients:[],is_alcohol:true}, {id:'b',log_date:'2026-09-29',log_time:'20:00',category:'야식',food_name:'테스트',ingredients:[],is_alcohol:true}];
  return {auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from(table){
      let updates=null; const filters=[];
      const q={select(){return q},eq(k,v){filters.push([k,v]);return q},gte(){return q},lte(){return q},order(){return q},limit(){return q},range(){return q},update(v){updates=v;return q},
        single(){return q},maybeSingle(){return q},then(resolve,reject){
          if(updates){Object.assign(profile,updates);window.savedProfile=updates;}
          let data=table==='profiles'?{...profile}:table==='logs'?rows.filter(r=>filters.every(([k,v])=>r[k]===v)):[];
          if(table==='period_reports'||table==='daily_reports')data=null;
          return Promise.resolve({data,error:null}).then(resolve,reject);
        }};return q;
    }};
}};`;
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:700},isMobile:true,hasTouch:true});
    await page.clock.install({time:new Date('2026-09-30T12:00:00+09:00')});
    const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE:',e.message)});
    page.on('requestfailed',r=>console.error('REQUEST:',r.url(),r.failure()?.errorText));
    await page.route('**/*',async route=>{
      const url=route.request().url();
      if(url==='https://diet-test.local/')return route.fulfill({contentType:'text/html',body:html});
      if(url.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body:mock});
      if(url.includes('supabase.co'))throw new Error('Live Supabase access forbidden during test');
      return route.continue();
    });
    await page.goto('https://diet-test.local/');
    await page.getByRole('button',{name:/통계/}).click({timeout:45000});
    await page.getByText('2 / 4일',{exact:true}).waitFor();
    await page.getByRole('button',{name:'월간',exact:true}).click();
    await page.getByText('29 / 17일 (주 목표 환산)',{exact:true}).waitFor();
    await page.getByText('⚙️ 설정',{exact:true}).click();
    const goal=page.locator('input[name="goalAlcoholFreeWeekly"]');
    await goal.fill('8');
    assert.equal(await goal.evaluate(el=>el.checkValidity()),false);
    await goal.fill('3');
    await page.getByRole('button',{name:'저장하기',exact:true}).click();
    await page.getByText('29 / 13일 (주 목표 환산)',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.savedProfile.goal_alcohol_free_weekly),3);
    await page.getByText('⚙️ 설정',{exact:true}).click();
    await page.locator('input[name="goalAlcoholFreeWeekly"]').fill('');
    await page.getByRole('button',{name:'저장하기',exact:true}).click();
    await page.waitForFunction(()=>window.savedProfile.goal_alcohol_free_weekly===null);
    await page.getByText('✅ 수정했습니다.',{exact:true}).waitFor();
    assert.equal(await page.getByText('🎯 목표 달성 현황',{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: TS syntax, scoped photo prompt, mobile weekly/monthly display, 0-7 validation, goal save and clear, no runtime errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

