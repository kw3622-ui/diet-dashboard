const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const html = fs.readFileSync(process.argv[2], 'utf8');
const mock = `
window.supabase={createClient(){
 const session={user:{id:'test-user'},access_token:'test-token'};
 const profile={id:'test-user',username:'test',height:173,weight:74.6,age:42,gender:'male',disease:'고혈압, 통풍, 경계성 혈당',ai_mode:'normal',is_approved:true,is_admin:false};
 const rows=Array.from({length:7},(_,i)=>({id:'old-'+i,user_id:'test-user',log_date:'2026-10-19',log_time:String(7+i).padStart(2,'0')+':00',category:i%2?'간식':'아침식사',food_name:'기존 기록 '+(i+1),ingredients:['기존 음식'],analysis:'기존 피드백',image_urls:[],raw_input:{type:'text',naturalText:'기존 음식'},is_alcohol:false,food_health_tags:[]}));
 return {
  auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  storage:{from(){return {remove:async()=>({error:null})}}},
  from(table){
   const filters=[]; let one=false;
   const q={
    select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},gte(k,v){filters.push(r=>r[k]>=v);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},
    order(){return q},limit(){return q},range(){return q},single(){one=true;return q},maybeSingle(){one=true;return q},delete(){return q},upsert(){return q},update(){return q},
    then(resolve,reject){
     let data=table==='profiles'?[profile]:table==='logs'?rows:[];
     data=data.filter(r=>filters.every(f=>f(r)));
     return Promise.resolve({data:one?(data[0]||null):data,error:null}).then(resolve,reject);
    }
   }; return q;
  }
 };
}};`;

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.clock.install({time:new Date('2026-10-19T13:56:00+09:00')});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url==='https://diet-feedback.local/')return route.fulfill({contentType:'text/html',body:html});
   if(url.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body:mock});
   if(url.includes('/functions/v1/diet-ai'))return route.fulfill({contentType:'application/json',body:JSON.stringify({
    id:'new-log',date:'2026-10-19',time:'13:56',category:'점심식사',foodName:'정담순대국 장터순대',
    ingredients:['장터순대','쌀밥 반공기'],analysis:'밥과 국물의 양을 조절한 점이 좋습니다. 다음 식사도 지금처럼 양을 구체적으로 기록해보세요.',
    imageUrl:'',rawInput:'{}',isAlcohol:false,healthTags:[
     {foodIndex:1,foodName:'밥은 반공기만',tagKey:'diabetes_helpful',tagLabel:'혈당에 도움',diseaseKey:'diabetes',polarity:'helpful',confidence:0.85,evidence:'밥 양 조절'},
     {foodIndex:0,foodName:'국물은 조금만 먹고',tagKey:'hypertension_helpful',tagLabel:'혈압에 도움',diseaseKey:'hypertension',polarity:'helpful',confidence:0.8,evidence:'국물 양 조절'}
    ]})});
   if(url.includes('supabase.co'))throw new Error('Live Supabase access forbidden');
   return route.continue();
  });

  await page.goto('https://diet-feedback.local/');
  const visualAnchor=page.getByText('기존 기록 7',{exact:true});
  await visualAnchor.waitFor({timeout:45000});
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const scrollBefore=await page.evaluate(()=>window.scrollY);
  const anchorTopBefore=(await visualAnchor.boundingBox()).y;

  await page.getByRole('button',{name:'+'}).click();
  await page.getByRole('button',{name:/식단\/운동 한 줄 기록/}).click();
  await page.getByPlaceholder('예: 아침으로 사과 반 개 먹었어').fill('정담순대국에서 국물은 조금만 먹고 밥은 반공기만');
  await page.getByRole('button',{name:/기록 및 코칭받기/}).click();

  const popup=page.locator('[data-feedback-popup]');
  await popup.getByText('방금 기록한 내용의 AI 피드백',{exact:false}).waitFor({timeout:45000});
  await popup.getByText('혈당에 도움 · 밥은 반공기만',{exact:false}).waitFor();
  await popup.getByText('혈압에 도움 · 국물은 조금만 먹고',{exact:false}).waitFor();
  await popup.getByText('밥과 국물의 양을 조절한 점이 좋습니다.',{exact:false}).waitFor();

  const metrics=await popup.evaluate(el=>({
   left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,
   viewport:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
   tagWidths:[...el.querySelectorAll('[data-feedback-health-tags] > div')].map(x=>Math.round(x.getBoundingClientRect().width))
  }));
  assert.ok(metrics.left>=0 && metrics.right<=metrics.viewport,'popup must fit mobile viewport');
  assert.equal(metrics.overflow,0);
  assert.equal(metrics.tagWidths.length,2);
  assert.ok(metrics.tagWidths.every(width=>width>300),'health tags should use separate full-width rows');

  await popup.getByRole('button',{name:'확인'}).click();
  await popup.waitFor({state:'detached'});
  const scrollAfter=await page.evaluate(()=>window.scrollY);
  const anchorTopAfter=(await visualAnchor.boundingBox()).y;
  assert.ok(Math.abs(anchorTopAfter-anchorTopBefore)<=2,`visible content moved: ${anchorTopBefore} -> ${anchorTopAfter}`);
  assert.deepEqual(errors,[]);
  console.log('PASS feedback popup',JSON.stringify({scrollBefore,scrollAfter,anchorTopBefore,anchorTopAfter,...metrics}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

