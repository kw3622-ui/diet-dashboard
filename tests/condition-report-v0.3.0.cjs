const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.argv[2], 'utf8');

const mock = `
window.supabase={createClient(){
 const session={user:{id:'test-user'},access_token:'test-token'};
 const profile={id:'test-user',username:'test',height:173,weight:74.6,age:42,gender:'male',disease:'고혈압, 통풍',ai_mode:'normal',is_approved:true,is_admin:false};
 const rows=[{id:'meal-1',user_id:'test-user',log_date:'2026-10-20',log_time:'12:00',category:'점심식사',food_name:'점심',ingredients:['현미밥'],analysis:'기록',image_urls:[],raw_input:{naturalText:'현미밥 반공기'},is_alcohol:false,food_health_tags:[]}];
 return {
  auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from(table){const filters=[];let one=false;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},gte(k,v){filters.push(r=>r[k]>=v);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},order(){return q},limit(){return q},range(){return q},single(){one=true;return q},maybeSingle(){one=true;return q},delete(){return q},upsert(){return q},then(resolve,reject){let data=table==='profiles'?[profile]:table==='logs'?rows:[];data=data.filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:one?(data[0]||null):data,error:null}).then(resolve,reject)}};return q;}
 };
}};`;

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.clock.install({time:new Date('2026-10-20T13:00:00+09:00')});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url==='https://condition-report.local/')return route.fulfill({contentType:'text/html',body:html});
   if(url.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body:mock});
   if(url.includes('/functions/v1/diet-ai')){
    const requestBody=JSON.parse(route.request().postData());
    assert.equal(requestBody.action,'conditionReport');
    assert.equal(requestBody.payload.conditionLabel,'고혈압');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({
      id:'report-1',condition_key:'hypertension',condition_label:'고혈압',window_start:'2026-08-22',window_end:'2026-10-20',status:'improving',created_at:'2026-10-20T04:00:00Z',snapshot:{},
      report_data:{conditionLabel:'고혈압',status:'improving',headline:'식사량 조절이 좋아지고 있습니다',summary:'최근 기록에서 긍정적인 흐름이 확인됩니다.',comparison:'이전 30일보다 운동 기록이 늘었습니다.',frequentFoods:[{name:'현미밥',count:5,impact:'helpful',reason:'양을 조절한 기록이 반복됨'}],positiveHabits:['걷기 기록이 늘어남'],cautionHabits:['수면이 짧은 날이 있음'],nextActions:['다음 30일에도 양을 기록하기']}
    })});
   }
   if(url.includes('supabase.co'))throw new Error('Live Supabase access forbidden');
   return route.continue();
  });

  await page.goto('https://condition-report.local/');
  await page.getByRole('button',{name:/통계/}).click({timeout:45000});
  const goalModal=page.locator('[data-period-goal-modal]');
  if(await goalModal.count()) await goalModal.getByRole('button',{name:'목표 설정 닫기'}).click();
  const card=page.locator('[data-condition-report]');
  await card.getByRole('heading',{name:/기저질환별 2개월 분석/}).waitFor();
  assert.equal(await card.locator('[data-condition-selector] button').count(),2);
  await card.getByRole('button',{name:/최근 2개월 분석받기/}).click();
  await card.getByText('식사량 조절이 좋아지고 있습니다',{exact:true}).waitFor({timeout:45000});
  await card.getByText('현미밥',{exact:true}).waitFor();
  await card.getByText('이전 30일보다 운동 기록이 늘었습니다.',{exact:true}).waitFor();
  await card.getByRole('button',{name:'통풍'}).click();
  await card.getByText('아직 저장된 통풍 분석이 없습니다.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  assert.deepEqual(errors,[]);
  console.log('PASS condition report UI');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

