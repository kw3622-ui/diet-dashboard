const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

const html=fs.readFileSync(process.argv[2]||'diet-dashboard/rpg-dev/index_v0.7.0.html','utf8');
assert.match(html,/rules_version:'rpg-v0\.7\.0'/);
assert.match(html,/const WEAPON_NAMES=\[/);
assert.match(html,/const GOLEM_NAMES=\[/);
assert.doesNotMatch(html,/<canvas/);
assert.doesNotMatch(html,/startCanvas\(\);/);
assert.doesNotMatch(html,/id="maleButton"|id="femaleButton"|성별 선택/);
for(const tier of ['basic','legend'])for(const kind of ['guardian','golem'])assert.ok(fs.existsSync(`diet-dashboard/rpg-dev/assets/${kind}-${tier}_v0.7.0.png`));

const supabaseMock=`window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:null}}),signInWithPassword:async()=>({error:null}),signOut:async()=>({})}}}};`;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await page.clock.install({time:new Date('2026-10-08T14:00:00+09:00')});
    const errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message)});
    page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text())});
    await page.route('**/*',async route=>{
      const url=route.request().url();
      if(url==='https://rpg-layout.local/')return route.fulfill({contentType:'text/html',body:html});
      if(url.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body:supabaseMock});
      if(url.includes('/assets/')){
        const file=path.join('diet-dashboard/rpg-dev/assets',decodeURIComponent(new URL(url).pathname.split('/').pop()));
        if(fs.existsSync(file))return route.fulfill({contentType:file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'image/png',body:fs.readFileSync(file)});
      }
      if(url.includes('supabase.co'))throw new Error('Live Supabase access forbidden');
      return route.abort();
    });
    await page.goto('https://rpg-layout.local/');
    await page.getByRole('button',{name:'체험 데이터로 먼저 보기'}).click();
    await page.locator('#dashboard:not(.hidden)').waitFor();
    await page.locator('#heroSprite').waitFor({state:'visible'});
    assert.deepEqual(errors,[]);
    assert.match(await page.locator('#heroSprite').getAttribute('src'),/guardian-basic_v0\.7\.0\.png/);
    assert.match(await page.locator('#monsterSprite').getAttribute('src'),/golem-basic_v0\.7\.0\.png/);
    assert.equal(await page.locator('#weaponLevelBadge').textContent(),'초급 장비');
    assert.equal(await page.locator('#monsterLevelBadge').textContent(),'작은 돌멩이');
    assert.equal(await page.locator('#equipment .gear').count(),6);
    assert.equal(await page.locator('#equipment .gear.weapon').count(),1);
    assert.match(await page.locator('#equipment .gear.weapon').innerText(),/강철 장검[\s\S]*Lv\.5 \/ 10/);

    const motion=await page.evaluate(()=>({
      hero:getComputedStyle(document.querySelector('#heroSprite')).animationName,
      monster:getComputedStyle(document.querySelector('#monsterSprite')).animationName
    }));
    assert.deepEqual(motion,{hero:'none',monster:'none'});

    await page.getByRole('button',{name:'최상급 세트'}).click();
    assert.equal(await page.locator('#previewTitle').textContent(),'최상급 세트 미리보기');
    assert.match(await page.locator('#heroSprite').getAttribute('src'),/guardian-legend_v0\.7\.0\.png/);
    assert.match(await page.locator('#monsterSprite').getAttribute('src'),/golem-legend_v0\.7\.0\.png/);
    await page.getByRole('button',{name:'실제 기록 단계로 돌아가기'}).click();
    assert.equal(await page.locator('#previewTitle').textContent(),'실제 기록 단계');

    await page.getByRole('button',{name:'최상급 세트'}).click();
    const level10Inside=await page.evaluate(()=>{const s=document.querySelector('#battleStage').getBoundingClientRect();return ['#heroSprite','#monsterSprite'].every(id=>{const r=document.querySelector(id).getBoundingClientRect();return r.left>=s.left-1&&r.right<=s.right+1&&r.top>=s.top-1&&r.bottom<=s.bottom+1})});
    assert.ok(level10Inside,'level 10 art must stay inside the stage');
    await page.screenshot({path:'diet-dashboard/rpg-dev/mobile-v0.7.0-legend.png',fullPage:false});
    await page.getByRole('button',{name:'실제 기록 단계로 돌아가기'}).click();

    const metrics=await page.evaluate(()=>(()=>{
      const stage=document.querySelector('#battleStage').getBoundingClientRect();
      const hero=document.querySelector('#heroSprite').getBoundingClientRect();
      const monster=document.querySelector('#monsterSprite').getBoundingClientRect();
      const center=Math.abs((hero.left+hero.width/2)-(stage.left+stage.width/2));
      return {
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        stage:{width:stage.width,height:stage.height},
        inside:[hero,monster].every(r=>r.left>=stage.left-1&&r.right<=stage.right+1&&r.top>=stage.top-1&&r.bottom<=stage.bottom+1),
        center,
        monsterBehind:Number(getComputedStyle(document.querySelector('#monsterSprite')).zIndex)<Number(getComputedStyle(document.querySelector('#heroSprite')).zIndex)
      };
    })());
    assert.ok(metrics.overflow<=0,'mobile page must not overflow horizontally');
    assert.ok(metrics.stage.width<=370&&metrics.stage.height>=175,'static growth stage must fit mobile screen');
    assert.ok(metrics.inside,'all scene art must stay inside the stage');
    assert.ok(metrics.center<2,'hero must be centered in the stage');
    assert.ok(metrics.monsterBehind,'monster must render behind the hero');
    await page.screenshot({path:'diet-dashboard/rpg-dev/mobile-v0.7.0.png',fullPage:true});
    console.log('PASS RPG low-resolution guardian mobile',JSON.stringify(metrics));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

