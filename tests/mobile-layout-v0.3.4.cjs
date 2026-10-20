const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.argv[2], 'utf8');
const mock = `
window.supabase={createClient(){
 const session={user:{id:'test-user'},access_token:'test-token'};
 const profile={id:'test-user',username:'test',height:173,weight:74.6,age:42,gender:'male',disease:'고혈압, 통풍',is_approved:true,is_admin:true,
  goal_exercise_weekly:4,goal_alcohol_free_weekly:3,goal_weight_kg:72,
  goal_bp_sys_max:120,goal_bp_dia_max:80,goal_sugar_max:100};
 const conditionRows=[{id:'condition-1',user_id:'test-user',condition_key:'hypertension',condition_label:'고혈압',window_start:'2026-08-02',window_end:'2026-09-30',status:'improving',created_at:'2026-09-30T10:00:00Z',snapshot:{},report_data:{conditionLabel:'고혈압',status:'improving',headline:'국물 조절 습관이 좋아지고 있습니다',summary:'최근 30일의 기록에서 긍정적인 변화가 확인됩니다.',comparison:'이전 30일보다 국물 섭취 조절 기록이 늘었습니다.',frequentFoods:[{name:'현미밥',count:8,impact:'helpful',reason:'반복 기록이 확인됨'}],positiveHabits:['국물 양을 적게 기록함'],cautionHabits:['수면 시간이 짧은 날이 있음'],nextActions:['국물 섭취량을 계속 기록하기']}}];
 const periodGoals=[{id:'goal-1',user_id:'test-user',period_type:'week',period_start:'2026-09-28',period_end:'2026-10-04',status:'active',exercise_target:4,alcohol_free_target:3,weight_target:72,bp_sys_target:120,bp_dia_target:80,sugar_target:100,updated_at:'2026-09-28T00:00:00Z'}];
 const rows=[
  {id:'meal0',user_id:'test-user',log_date:'2026-09-30',log_time:'12:00',category:'점심식사',food_name:'샐러드와 소주',ingredients:['샐러드(채소)','소주(1병)'],analysis:'식단 기록',image_urls:[],raw_input:{},is_alcohol:true,food_health_tags:[
    {food_index:0,food_name:'샐러드',tag_key:'hypertension_helpful',tag_label:'혈압에 도움',disease_key:'hypertension',polarity:'helpful',confidence:0.88,evidence:'채소 섭취'},
    {food_index:1,food_name:'소주',tag_key:'gout_caution',tag_label:'통풍 주의',disease_key:'gout',polarity:'caution',confidence:0.95,evidence:'소주 1병'}]},
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
     let data=table==='profiles'?[profile]:table==='logs'?rows:table==='condition_reports'?conditionRows:table==='period_goals'?periodGoals:[];
     data=data.filter(r=>filters.every(f=>f(r)));
     return Promise.resolve({data:one?(data[0]||null):data,error:null}).then(resolve,reject);
    }}; return q;
  }
 };
}};`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
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
  await page.getByText('혈압에 도움 · 샐러드',{exact:false}).waitFor({timeout:45000});
  await page.getByText('통풍 주의 · 소주',{exact:false}).waitFor();
  await page.getByRole('heading',{name:/오늘의 건강 영향/}).waitFor();
  const todayTable=page.locator('[data-today-records]');
  await todayTable.getByText(/12:00 샐러드 · 소주/).waitFor();
  assert.equal((await todayTable.textContent()).includes('샐러드와 소주'),false,'meal table must not show the AI title');
  assert.equal(await page.locator('[data-health-tags] span').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);

  const quickActions=todayTable.locator('[data-today-quick-actions]');
  assert.equal(await quickActions.getByRole('button').count(),2);
  const headerMetrics=await todayTable.evaluate(card=>{
   const heading=card.querySelector('h2').getBoundingClientRect();
   const actions=card.querySelector('[data-today-quick-actions]').getBoundingClientRect();
   return {headingHeight:heading.height,actionsHeight:actions.height,cardRight:card.getBoundingClientRect().right,actionsRight:actions.right,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  assert.ok(headerMetrics.headingHeight<30,'today title must stay on one line');
  assert.ok(headerMetrics.actionsHeight<42,'quick actions must stay on one line');
  assert.ok(headerMetrics.actionsRight<=headerMetrics.cardRight+1,'quick actions must stay inside card');
  assert.equal(headerMetrics.overflow,0);

  await todayTable.getByRole('button',{name:'아침 기록하기'}).click();
  const draft=page.locator('form').filter({has:page.locator('[data-record-methods]')});
  await draft.locator('[data-record-methods]').waitFor();
  assert.equal(await draft.locator('[data-record-methods] input[type=file]').count(),2,'meal quick record must offer camera and album');
  assert.equal(await draft.locator('[data-record-methods]').getByRole('button').count(),3,'all three record methods must be exposed as buttons');
  const methodCards=await draft.locator('[data-record-methods]').getByRole('button').evaluateAll(items=>items.map(el=>({height:el.getBoundingClientRect().height,whiteSpace:[...el.querySelectorAll('span')].slice(1).map(span=>getComputedStyle(span).whiteSpace)})));
  assert.ok(methodCards.every(card=>card.height>=68),'record method cards must be visually prominent');
  assert.ok(methodCards.every(card=>card.whiteSpace.every(value=>value==='nowrap')),'record method labels must not wrap');
  await draft.getByRole('heading',{name:'🌅 아침 기록'}).waitFor();
  await page.screenshot({path:'diet-dashboard/mobile-record-methods-v0.3.4.png',fullPage:false});
  assert.equal(await draft.locator('input[type=time]').inputValue(),'08:00','out-of-range breakfast quick record must use breakfast anchor');
  await draft.locator('[data-time-auto-message]').waitFor();
  await draft.locator('input[type=time]').fill('17:00');
  await draft.locator('[data-meal-time-warning]').waitFor();
  await draft.getByRole('button',{name:'17:00 사용'}).click();
  assert.equal(await draft.locator('[data-meal-time-warning]').count(),0);
  await draft.getByRole('button',{name:'취소'}).click();

  await quickActions.getByRole('button',{name:'간식 기록하기'}).click();
  const snackDraft=page.locator('form').filter({has:page.locator('[data-record-methods]')});
  assert.equal(await snackDraft.locator('input[type=time]').inputValue(),'13:56','snack quick record must keep current time');
  assert.match(await snackDraft.getByRole('button',{name:'간식',exact:true}).getAttribute('class'),/bg-blue-600/);
  await snackDraft.getByRole('button',{name:'취소'}).click();

  await quickActions.getByRole('button',{name:'운동 기록하기'}).click();
  const exerciseDraft=page.locator('form').filter({has:page.locator('[data-record-methods]')});
  assert.equal(await exerciseDraft.locator('input[type=time]').inputValue(),'13:56','exercise quick record must keep current time');
  assert.match(await exerciseDraft.getByRole('button',{name:/운동/}).last().getAttribute('class'),/bg-green-500/);
  await exerciseDraft.getByRole('button',{name:'취소'}).click();

  await page.getByRole('button',{name:/통계/}).click({timeout:45000});
  await page.getByText('🩸 목표 공복혈당',{exact:true}).waitFor();
  await page.getByRole('heading',{name:/주간 건강 영향/}).waitFor();
  await page.getByRole('heading',{name:/기저질환별 2개월 분석/}).waitFor();
  await page.getByText('국물 조절 습관이 좋아지고 있습니다',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-condition-selector] button').count(),2);
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
  await page.getByRole('button',{name:'월간',exact:true}).click();
  const goalModal=page.locator('[data-period-goal-modal]');
  await goalModal.waitFor();
  await goalModal.getByRole('heading',{name:'2026년 9월'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  await goalModal.getByRole('button',{name:'목표 설정 닫기'}).click();
  await page.screenshot({path:'diet-dashboard/mobile-layout-v0.3.4.png',fullPage:true});
  console.log('PASS mobile layout',JSON.stringify(metrics));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});





