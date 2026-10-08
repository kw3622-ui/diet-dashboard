const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=fs.readFileSync(process.argv[2]||'diet-dashboard/rpg-dev/index_v0.2.0.html','utf8');
const maleAsset=fs.readFileSync('diet-dashboard/rpg-dev/assets/guardian-male-web_v0.2.0.png');
const femaleAsset=fs.readFileSync('diet-dashboard/rpg-dev/assets/guardian-female-web_v0.2.0.png');
const monsterAsset=fs.readFileSync('diet-dashboard/rpg-dev/assets/health-monsters-web_v0.2.0.png');
const supabaseMock=`window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:null}}),signInWithPassword:async()=>({error:null}),signOut:async()=>({})}}}};`;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await page.clock.install({time:new Date('2026-10-08T14:00:00+09:00')});
    const errors=[]; page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message)});
    page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text())});
    await page.route('**/*',async route=>{
      const url=route.request().url();
      if(url==='https://rpg-layout.local/')return route.fulfill({contentType:'text/html',body:html});
      if(url.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body:supabaseMock});
      if(url.endsWith('/assets/guardian-male-web_v0.2.0.png'))return route.fulfill({contentType:'image/png',body:maleAsset});
      if(url.endsWith('/assets/guardian-female-web_v0.2.0.png'))return route.fulfill({contentType:'image/png',body:femaleAsset});
      if(url.endsWith('/assets/health-monsters-web_v0.2.0.png'))return route.fulfill({contentType:'image/png',body:monsterAsset});
      if(url.includes('supabase.co'))throw new Error('Live Supabase access forbidden');
      return route.abort();
    });
    await page.goto('https://rpg-layout.local/');
    await page.getByRole('button',{name:'체험 데이터로 먼저 보기'}).click();
    await page.locator('#dashboard:not(.hidden)').waitFor();
    assert.deepEqual(errors,[]);
    assert.equal(await page.locator('#dashboard').isVisible(),true);
    assert.equal(await page.locator('#gameCanvas').getAttribute('width'),'320');
    assert.match(await page.locator('#heroSprite').evaluate(el=>getComputedStyle(el).backgroundImage),/guardian-male-web_v0\.2\.0\.png/);
    assert.match(await page.locator('#monsterSprite').evaluate(el=>getComputedStyle(el).backgroundImage),/health-monsters-web_v0\.2\.0\.png/);
    assert.match(await page.locator('#monsterLabel').textContent(),/골렘|슬라임|괴물|안개|유령|덩굴/);
    assert.match(await page.locator('#hpText').textContent(),/^\d+\/100$/);
    assert.equal(await page.locator('#equipment .gear').count(),5);
    assert.match(await page.locator('#maleButton').getAttribute('class'),/active/);
    await page.waitForFunction(()=>document.querySelector('#heroSprite').dataset.action==='attack',null,{timeout:7000});
    await page.screenshot({path:'diet-dashboard/rpg-dev/mobile-male-v0.2.0.png',fullPage:true});
    await page.getByRole('button',{name:'여성'}).click();
    assert.match(await page.locator('#femaleButton').getAttribute('class'),/active/);
    assert.match(await page.locator('#heroSprite').evaluate(el=>getComputedStyle(el).backgroundImage),/guardian-female-web_v0\.2\.0\.png/);
    const metrics=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),
      notice:document.querySelector('.notice').textContent,
      good:Number(document.querySelector('#goodFlow').textContent),
      warn:Number(document.querySelector('#warnFlow').textContent)
    }));
    assert.ok(metrics.overflow<=0,'mobile page must not overflow horizontally');
    assert.ok(metrics.canvas.width<=370&&metrics.canvas.height>=150,'battle stage must fit mobile screen');
    assert.match(metrics.notice,/운영 식단 기록장은 변경하지 않습니다/);
    assert.ok(metrics.good>=0&&metrics.good<=7);
    assert.ok(metrics.warn>=0&&metrics.warn<=7);
    const placement=await page.evaluate(()=>{
      const hero=document.querySelector('#heroSprite').getBoundingClientRect();
      const monster=document.querySelector('#monsterLabel').getBoundingClientRect();
      const player=document.querySelector('#playerLabel').getBoundingClientRect();
      return {heroX:hero.x,playerX:player.x,monsterX:monster.x};
    });
    assert.ok(placement.heroX<placement.monsterX,'character must be left of monster');
    assert.ok(placement.playerX<placement.monsterX,'player label must be left of monster label');
    await page.screenshot({path:'diet-dashboard/rpg-dev/mobile-female-v0.2.0.png',fullPage:true});
    console.log('PASS RPG dev mobile',JSON.stringify(metrics));
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

