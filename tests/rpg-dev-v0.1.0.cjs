const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=fs.readFileSync(process.argv[2]||'diet-dashboard/rpg-dev/index_v0.1.0.html','utf8');
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
      if(url.includes('supabase.co'))throw new Error('Live Supabase access forbidden');
      return route.abort();
    });
    await page.goto('https://rpg-layout.local/');
    await page.getByRole('button',{name:'체험 데이터로 먼저 보기'}).click();
    await page.locator('#dashboard:not(.hidden)').waitFor();
    assert.deepEqual(errors,[]);
    assert.equal(await page.locator('#dashboard').isVisible(),true);
    assert.equal(await page.locator('#gameCanvas').getAttribute('width'),'320');
    assert.match(await page.locator('#monsterLabel').textContent(),/골렘|슬라임|괴물|안개|유령|덩굴/);
    assert.match(await page.locator('#hpText').textContent(),/^\d+\/100$/);
    assert.equal(await page.locator('#equipment .gear').count(),5);
    assert.match(await page.locator('#maleButton').getAttribute('class'),/active/);
    await page.getByRole('button',{name:'여성'}).click();
    assert.match(await page.locator('#femaleButton').getAttribute('class'),/active/);
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
    await page.screenshot({path:'diet-dashboard/rpg-dev/mobile-v0.1.0.png',fullPage:true});
    console.log('PASS RPG dev mobile',JSON.stringify(metrics));
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

