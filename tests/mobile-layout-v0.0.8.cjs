const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.argv[2], 'utf8');
const mock = `
window.supabase={createClient(){
 const session={user:{id:'test-user'},access_token:'test-token'};
 const profile={id:'test-user',username:'test',height:173,weight:74.6,age:42,gender:'male',is_approved:true,is_admin:true,
  goal_exercise_weekly:4,goal_alcohol_free_weekly:3,goal_weight_kg:72,
  goal_bp_sys_max:120,goal_bp_dia_max:80,goal_sugar_max:100};
 const rows=[
  {id:'bio0a',user_id:'test-user',log_date:'2026-09-28',log_time:'08:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:74.6,bp_sys:128,bp_dia:84,sugar:101,sleep_hours:6.5}}},
  {id:'bio0b',user_id:'test-user',log_date:'2026-09-28',log_time:'09:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:74.6,bp_sys:128,bp_dia:84,sugar:101,sleep_hours:6.5}}},
  {id:'bio1a',user_id:'test-user',log_date:'2026-09-29',log_time:'08:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:74.7,bp_sys:129,bp_dia:85,sugar:102,sleep_hours:6.7}}},
  {id:'bio1b',user_id:'test-user',log_date:'2026-09-29',log_time:'09:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:74.7,bp_sys:129,bp_dia:85,sugar:102,sleep_hours:6.7}}},
  {id:'bio2a',user_id:'test-user',log_date:'2026-09-30',log_time:'08:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:74.8,bp_sys:128,bp_dia:84,sugar:101,sleep_hours:6.5}}},
  {id:'bio2b',user_id:'test-user',log_date:'2026-09-30',log_time:'09:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:74.8,bp_sys:128,bp_dia:84,sugar:101,sleep_hours:6.5}}},
  {id:'bio3a',user_id:'test-user',log_date:'2026-10-01',log_time:'08:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:74.9,bp_sys:129,bp_dia:85,sugar:102,sleep_hours:6.7}}},
  {id:'bio3b',user_id:'test-user',log_date:'2026-10-01',log_time:'09:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:74.9,bp_sys:129,bp_dia:85,sugar:102,sleep_hours:6.7}}},
  {id:'bio4a',user_id:'test-user',log_date:'2026-10-02',log_time:'08:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:75.0,bp_sys:128,bp_dia:84,sugar:101,sleep_hours:6.5}}},
  {id:'bio4b',user_id:'test-user',log_date:'2026-10-02',log_time:'09:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:75.0,bp_sys:128,bp_dia:84,sugar:101,sleep_hours:6.5}}},
  {id:'bio5a',user_id:'test-user',log_date:'2026-10-03',log_time:'08:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:75.1,bp_sys:129,bp_dia:85,sugar:102,sleep_hours:6.7}}},
  {id:'bio5b',user_id:'test-user',log_date:'2026-10-03',log_time:'09:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:75.1,bp_sys:129,bp_dia:85,sugar:102,sleep_hours:6.7}}},
  {id:'bio6a',user_id:'test-user',log_date:'2026-10-04',log_time:'08:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:75.2,bp_sys:128,bp_dia:84,sugar:101,sleep_hours:6.5}}},
  {id:'bio6b',user_id:'test-user',log_date:'2026-10-04',log_time:'09:00',category:'생체기록',food_name:'생체 수치',ingredients:[],raw_input:{biometrics:{weight:75.2,bp_sys:128,bp_dia:84,sugar:101,sleep_hours:6.5}}}
 ];
 return {
  auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from(table){
   const filters=[]; let one=false;
   const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},gte(k,v){filters.push(r=>r[k]>=v);return q},
    lte(k,v){filters.push(r=>r[k]<=v);return q},order(){return q},limit(){return q},range(){return q},single(){one=true;return q},
    maybeSingle(){one=true;return q},then(resolve,reject){
     let data=table==='profiles'?[profile]:table==='logs'?rows:[];
     data=data.filter(r=>filters.every(f=>f(r)));
     return Promise.resolve({data:one?(data[0]||null):data,error:null}).then(resolve,reject);
    }}; return q;
  }
 };
}};`;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.clock.install({time:new Date('2026-09-30T13:56:00+09:00')});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url==='https://diet-layout.local/')return route.fulfill({contentType:'text/html',body:html});
   if(url.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body:mock});
   if(url.includes('supabase.co'))throw new Error('Live Supabase access forbidden');
   return route.continue();
  });
  await page.goto('https://diet-layout.local/');
  await page.getByRole('button',{name:/통계/}).click({timeout:45000});
  await page.getByText('🩸 목표 공복혈당',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  for (const [title, value] of [['🩺 혈압 트렌드','128/84 (2회)'],['🩸 공복 혈당 트렌드','101'],['⚖️ 체중 트렌드','74.6kg'],['😴 수면 시간 트렌드','6.5시간']]) {
   const card=page.getByRole('heading',{name:title}).locator('..');
   const label=card.getByText(value,{exact:true}).first();
   await label.waitFor();
   assert.equal(await label.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
  }
  assert.equal(await page.locator('h1').first().textContent(),'📊 통계');
  const metrics=await page.evaluate(()=>{
   const title=[...document.querySelectorAll('h1')].find(e=>e.textContent.includes('📊 통계'));
   const member=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('회원관리'));
   const settings=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('설정'));
   const labels=['⚖️ 목표 체중','🩺 목표 혈압','🩸 목표 공복혈당'].map(text=>{
    const el=[...document.querySelectorAll('span')].find(e=>e.textContent.trim()===text);
    return {text,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width};
   });
   return {
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    headerY:[title,member,settings].map(e=>Math.round(e.getBoundingClientRect().y)),
    labels,
    chartHeights:[...document.querySelectorAll('.h-36')].map(el=>Math.round(el.getBoundingClientRect().height))
   };
  });
  assert.ok(metrics.overflow<=0,'page must not overflow horizontally');
  assert.ok(Math.max(...metrics.headerY)-Math.min(...metrics.headerY)<8,'header items should share one row');
  for(const item of metrics.labels)assert.ok(item.height<24,item.text+' should stay on one line');
  assert.ok(metrics.chartHeights.length>=8,'four charts should use compact foreground/background layers');
  assert.ok(metrics.chartHeights.every(height=>height===144),'trend charts should use compact 144px height');
  const badgeCheck=await page.evaluate(()=>{
   const badges=[...document.querySelectorAll('[data-trend-label]')];
   const overlaps=[];
   for(let i=0;i<badges.length;i++)for(let j=i+1;j<badges.length;j++){
    if(badges[i].dataset.trendLabel!==badges[j].dataset.trendLabel)continue;
    const a=badges[i].getBoundingClientRect(),b=badges[j].getBoundingClientRect();
    if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)overlaps.push([badges[i].textContent,badges[j].textContent]);
   }
   return {count:badges.length,overlaps,styles:badges.map(el=>{
    const css=getComputedStyle(el),rect=el.getBoundingClientRect(),plot=el.closest('.h-36').getBoundingClientRect();
    return {whiteSpace:css.whiteSpace,background:css.backgroundColor,border:css.borderTopWidth,inside:rect.top>=plot.top-1&&rect.bottom<=plot.bottom+1};
   })};
  });
  assert.equal(badgeCheck.count,28);
  assert.deepEqual(badgeCheck.overlaps,[]);
  for(const style of badgeCheck.styles){
   assert.equal(style.whiteSpace,'nowrap');
   assert.notEqual(style.background,'rgba(0, 0, 0, 0)');
   assert.equal(style.border,'1px');
   assert.equal(style.inside,true);
  }
  await page.screenshot({path:'diet-dashboard/mobile-layout-v0.0.8.png',fullPage:true});
  console.log('PASS mobile layout',JSON.stringify(metrics));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});


