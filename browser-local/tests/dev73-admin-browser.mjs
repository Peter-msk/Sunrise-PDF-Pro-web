// Actual Chromium rendering; synthetic API fixtures only. No production access.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ADMIN_HTML,ADMIN_JS,ADMIN_CSS} from '../../src/admin/generated-assets.js';
import {CREDENTIAL_JS} from '../../src/admin/setup.js';
const origin='https://admin.test';
const now=1800000000;
const fixture={
 session:{csrf:'test-csrf'},
 dashboard:{visits_today:4,visits_7d:38,started_today:4,successes_today:2,failures_today:1,active_seconds_today:120,published:1,inquiries:{new:1,in_progress:0,resolved:0},top_errors:[{error_code:'FONT_GLYPH_MISSING',stage:'fonts',n:4}]},
 operations:{rows:[{feature:'hwp',started:4,successes:2,failures:1,cancels:0,unconfirmed:1,avg_terminal_ms:2000}],terminal_without_start:0},
 diagnostics:{by_reason:[{error_code:'FONT_GLYPH_MISSING',stage:'fonts',feature:'hwp',n:4}],records:[],active_sessions:[],outcomes:[],workflows:[]},
 inquiries:{items:[{id:'fixture',email:'test@example.invalid',subject:'검증용 문의',message:'검증 내용',status:'new',created_at:now,admin_note:''}]},
 publications:{items:[{id:'fixture',kind:'announcement',state:'published',title:'검증용 공지',body:'검증 내용',first_published_at:now,expire_at:now+3600}]},
 system:{service:'TEST-SYSTEM',worker_status:'ok',d1_status:'reachable'},
 security:{active_sessions:1,locked_subjects:0,audit:[]}
};
const headers={'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
const browser=await chromium.launch({headless:true});
try{
 for(const [width,height] of [[1440,900],[1024,768],[390,844]]){
  const ctx=await browser.newContext({viewport:{width,height},isMobile:width<650,hasTouch:width<650});
  const page=await ctx.newPage(),errors=[],unexpected=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))errors.push(m.text())});
  await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url()),p=u.pathname;
   if(u.origin!==origin){unexpected.push(u.origin);return route.abort();}
   const send=(body,contentType)=>route.fulfill({status:200,headers,contentType,body});
   if(p==='/admin/static/admin.js')return send(ADMIN_JS,'text/javascript');
   if(p==='/admin/static/admin.css')return send(ADMIN_CSS,'text/css');
   if(p==='/admin/static/credential.js')return send(CREDENTIAL_JS,'text/javascript');
   if(p.startsWith('/api/admin/')){
    if(route.request().method()!=='GET'){writes.push(p);return route.fulfill({status:403,body:'{}'});}
    const key=p.split('/').at(-1);
    const data=key==='visits'?{rows:Array.from({length:Number(u.searchParams.get('days')||14)},(_,i)=>({kst_day:20800-i,visit_sessions:4,active_seconds:120,starts:2,successes:1,failures:1}))}:fixture[key];
    if(!data){unexpected.push(p);return route.fulfill({status:404,body:'{}'});}
    return send(JSON.stringify(data),'application/json');
   }
   if(/^\/admin\/(overview|visits|diagnostics|inquiries|publications|system|security)\/$/.test(p))return send(ADMIN_HTML,'text/html');
   unexpected.push(p);return route.abort();
  });
  try{
   await page.goto(origin+'/admin/overview/');
   await page.locator('#workspace').waitFor({state:'visible'});
   for(const [name,label] of [['overview','작업 ID 기준'],['visits','최근 14일 사용 추이'],['diagnostics','실패 원인별 집계'],['inquiries','검증용 문의'],['publications','검증용 공지'],['system','TEST-SYSTEM'],['security','관리 작업 감사 기록']]){
    if(name!=='overview'){
     if(width<=650)await page.locator('#menu-toggle').click();
     await page.locator('[data-page="'+name+'"]').click();
    }
    await page.locator('#page-root').getByText(label,{exact:false}).first().waitFor({state:'visible'});
    const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(size.scroll<=size.width+2, name+' horizontal document overflow '+JSON.stringify(size));
    if(name==='visits'){
     await page.getByLabel('조회 기간').selectOption('30');
     await page.getByText('최근 30일 사용 추이',{exact:true}).waitFor();
     assert.equal(await page.locator('#page-root tbody tr').count(),30);
    }
    if(name==='inquiries'){
     await page.locator('#page-root input[type=search]').fill('없는 제목');
     await page.getByText('조건에 맞는 문의가 없습니다.').waitFor();
    }
    if(name==='publications'){
     await page.locator('.select-list button').filter({hasText:'검증용 공지'}).click();
     assert.ok(await page.locator('input[type=datetime-local]').inputValue());
    }
   }
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(writes,[]);
   console.log('DEV73_ADMIN_BROWSER_PASS '+JSON.stringify({width,height,pages:7,syntheticApi:true,errors:0,externalRequests:0,mutations:0}));
  }finally{await ctx.close();}
 }
}finally{await browser.close();}
