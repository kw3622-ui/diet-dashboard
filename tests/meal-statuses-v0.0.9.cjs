const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const html = fs.readFileSync(process.argv[2], 'utf8');
const mutations = [];
const mock = `
window.__mealMutations=[];
window.supabase={createClient(){
 const session={user:{id:'test-user'},access_token:'test-token'};
 const profile={id:'test-user',username:'test',height:173,weight:74.6,age:42,gender:'male',disease:'고혈압, 통풍',ai_mode:'normal',is_approved:true,is_admin:false};
 const rows=[
  {id:'breakfast-1',user_id:'test-user',log_date:'2026-10-16',log_time:'08:10',category:'아침식사',food_name:'삶은 달걀과 사과',ingredients:['삶은 달걀','사과'],analysis:'아침 기록',image_urls:[],raw_input:{},is_alcohol:false},
  {id:'breakfast-2',user_id:'test-user',log_date:'2026-10-16',log_time:'09:20',category:'아침식사',food_name:'두유',ingredients:['두유'],analysis:'추가 아침 기록',image_urls:[],raw_input:{},is_alcohol:false},
  {id:'snack-1',user_id:'test-user',log_date:'2026-10-16',log_time:'10:30',category:'간식',food_name:'견과류',ingredients:['견과류'],analysis:'간식 기록',image_urls:[],raw_input:{},is_alcohol:false},
  {id:'exercise-1',user_id:'test-user',log_date:'2026-10-16',log_time:'12:00',category:'운동',food_name:'걷기 50분',ingredients:['걷기 50분'],analysis:'운동 기록',image_urls:[],raw_input:{},is_alcohol:false},
  {id:'bio-1',user_id:'test-user',log_date:'2026-10-16',log_time:'07:30',category:'생체기록',food_name:'생체 수치',ingredients:['체중 74.6kg'],analysis:'생체 기록',image_urls:[],raw_input:{biometrics:{weight:74.6}},is_alcohol:false}
 ];
 let statuses=[{user_id:'test-user',status_date:'2026-10-16',meal_slot:'lunch',status:'skipped'}];
 return {
  auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  storage:{from(){return {remove:async()=>({error:null})}}},
  from(table){
   const filters=[]; let single=false; let operation='select'; let payload=null;
   const q={
    select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},gte(k,v){filters.push(r=>r[k]>=v);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},
    order(){return q},limit(){return q},range(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},
    upsert(v){operation='upsert';payload=v;return q},delete(){operation='delete';return q},
    then(resolve,reject){
     if(operation==='upsert'){
      const idx=statuses.findIndex(r=>r.user_id===payload.user_id&&r.status_date===payload.status_date&&r.meal_slot===payload.meal_slot);
      if(idx>=0)statuses[idx]={...statuses[idx],...payload};else statuses.push(payload);
      window.__mealMutations.push({type:'upsert',payload});
      return Promise.resolve({data:payload,error:null}).then(resolve,reject);
     }
     if(operation==='delete'){
      const before=statuses.length;statuses=statuses.filter(r=>!filters.every(f=>f(r)));
      window.__mealMutations.push({type:'delete',count:before-statuses.length});
      return Promise.resolve({data:null,error:null}).then(resolve,reject);
     }
     let data=table==='profiles'?[profile]:table==='logs'?rows:table==='meal_statuses'?statuses:[];
     data=data.filter(r=>filters.every(f=>f(r)));
     return Promise.resolve({data:single?(data[0]||null):data,error:null}).then(resolve,reject);
    }
   };return q;
  }
 };
}};`;

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.clock.install({time:new Date('2026-10-16T14:00:00+09:00')});
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message);});
  page.on('console',message=>{if(message.type()==='error')console.error('BROWSER',message.text());});
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url==='https://diet-records.local/')return route.fulfill({contentType:'text/html',body:html});
   if(url.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body:mock});
   if(url.includes('supabase.co'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
   return route.continue();
  });
  await page.goto('https://diet-records.local/');
  const card=page.locator('[data-today-records]');
  await card.getByText(/오늘의 기록표/).waitFor({timeout:45000});
  assert.deepEqual(errors,[]);
  await card.getByText('2회 기록',{exact:true}).waitFor();
  const skippedLabels=card.locator('span').filter({hasText:/^안 먹음$/});
  await skippedLabels.first().waitFor();
  await card.getByText('미기록',{exact:true}).waitFor();
  await card.getByText('견과류',{exact:true}).waitFor();
  await card.getByText('걷기 50분',{exact:true}).waitFor();
  assert.equal(await page.getByText('운동 • 운동 시작 시각 12:00',{exact:false}).count(),1);
  assert.equal(await page.getByText('생체기록 • 측정 시각 07:30',{exact:false}).count(),1);
  assert.equal(await page.getByText('아침식사 • 섭취 시각 08:10',{exact:false}).count(),1);

  const rows=card.locator(':scope > div.space-y-2\\.5 > div');
  const labels=await rows.evaluateAll(nodes=>nodes.map(n=>n.innerText.replace(/\s+/g,' ').trim()));
  assert.ok(labels[0].includes('생체기록'));
  assert.ok(labels[1].includes('아침'));
  assert.ok(labels[2].includes('간식'));
  assert.ok(labels[3].includes('운동'));
  assert.ok(labels[4].includes('점심'));
  assert.ok(labels[5].includes('저녁'));

  await card.getByRole('button',{name:'안 먹음'}).click();
  await skippedLabels.nth(1).waitFor();
  await card.getByRole('button',{name:'미기록으로'}).first().click();
  const mutationLog=await page.evaluate(()=>window.__mealMutations);
  mutations.push(...mutationLog);
  assert.equal(mutations.some(m=>m.type==='upsert'&&m.payload.meal_slot==='dinner'),true);
  assert.equal(mutations.some(m=>m.type==='delete'&&m.count===1),true);

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=0,'390px page must not overflow horizontally');
  await page.screenshot({path:'diet-dashboard/mobile-records-v0.0.9.png',fullPage:true});
  console.log('PASS meal status and today records',JSON.stringify({labels,mutations,overflow}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

