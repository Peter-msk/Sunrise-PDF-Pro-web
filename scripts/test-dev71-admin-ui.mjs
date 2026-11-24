import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ADMIN_JS,ADMIN_CSS} from '../src/admin/generated-assets.js';
class N{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.value='';this.textContent='';this.classList={toggle(){return true},remove(){},add(){},contains(){return false}};}
 append(...a){this.children.push(...a)}
 replaceChildren(...a){this.children=a}
 setAttribute(k,v){this.attrs[k]=String(v)}
 removeAttribute(k){delete this.attrs[k]}
 addEventListener(k,v){this.events[k]=v}
 focus(){}
}
const walk=n=>[n,...(n.children||[]).flatMap(walk)];
const content=n=>walk(n).map(x=>x.textContent).join(' ');
test('actual admin script renders charts and rejects stale navigation responses',async()=>{
 const nodes=new Map(),getNode=id=>{if(!nodes.has(id))nodes.set(id,new N(id));return nodes.get(id)};
 const navs=['overview','visits','diagnostics','inquiries','publications','system','security'].map(page=>Object.assign(new N('a'),{dataset:{page}}));
 const document={createElement:t=>new N(t),createElementNS:(_,t)=>new N(t),getElementById:getNode,querySelectorAll:()=>navs,addEventListener(){}};
 const requests=[],pending=[];
 const fetch=async path=>{requests.push(path);if(path==='/api/admin/session')return {ok:true,json:async()=>({csrf:'test'})};return new Promise(resolve=>pending.push({path,resolve:d=>resolve({ok:true,json:async()=>d})}));};
 const location={pathname:'/admin/overview/'},history={pushState(){}},window={location:{replace(){throw Error('unexpected redirect')}},addEventListener(){}};
 const flush=async()=>{for(let i=0;i<18;i++)await Promise.resolve()};
 const resolve=(path,d)=>{const i=pending.findIndex(x=>x.path===path);assert.ok(i>=0,path);pending.splice(i,1)[0].resolve(d)};
 const nav=async page=>{navs.find(n=>n.dataset.page===page).events.click({preventDefault(){}});await flush()};
 vm.runInNewContext(ADMIN_JS,{document,window,location,history,fetch});
 await flush();
 resolve('/api/admin/dashboard',{inquiries:{},failures_today:2,visits_today:4,visits_7d:38,active_seconds_today:0,started_today:3,successes_today:1,published:0,top_errors:[{error_code:'A',stage:'a',n:3},{error_code:'A',stage:'b',n:2},{error_code:'B',stage:'a',n:1}]});
 await flush();
 resolve('/api/admin/operations',{rows:[{feature:'hwp',started:4,successes:1,failures:1,cancels:1,unconfirmed:1,avg_terminal_ms:2000}],terminal_without_start:0});
 await flush();
 const root=getNode('page-root');
 assert.ok(content(root).includes('오늘 방문 세션')&&content(root).includes('작업 ID 기준'));
 assert.ok(walk(root).some(x=>x.tag==='text'&&x.textContent==='5건'));
 const opSvg=walk(root).find(x=>x.tag==='svg'&&x.attrs['aria-label'].startsWith('형식별'));
 assert.equal(walk(opSvg).filter(x=>x.tag==='rect'&&['series-success','series-failure','series-cancel','series-unknown'].includes(x.attrs.class)).length,4);
 assert.ok(walk(root).some(x=>x.attrs.role==='region')&&walk(root).some(x=>x.scope==='col'));
 assert.ok(walk(root).filter(x=>x.tag==='svg').every(x=>!x.attrs.style&&x.attrs.role==='img'));
 await nav('visits');
 resolve('/api/admin/visits?days=14',{rows:[{kst_day:20780,visit_sessions:2,starts:1,successes:1,failures:0},{kst_day:20781,visit_sessions:4,starts:0,successes:0,failures:0}]});
 await flush();
 assert.ok(content(root).includes('최근 14일 사용 추이')&&walk(root).some(x=>x.tag==='svg'));
 const picker=walk(root).find(x=>x.tag==='select'&&x.attrs['aria-label']==='조회 기간');
 assert.equal(picker.children.map(x=>x.value).join(','),'7,14,30');
 picker.value='30';picker.events.change();await flush();
 assert.equal(requests.at(-1),'/api/admin/visits?days=30');
 await nav('system');resolve('/api/admin/system',{service:'TEST-SYSTEM',worker_status:'ok',d1_status:'reachable'});await flush();
 resolve('/api/admin/visits?days=30',{rows:[]});await flush();
 assert.ok(content(root).includes('TEST-SYSTEM')&&!content(root).includes('최근 30일'));
 await nav('visits');resolve('/api/admin/visits?days=30',{rows:[]});await flush();
 assert.ok(content(root).includes('표시할 데이터가 없습니다.'));
});
test('compact CSS is scoped and includes bounded mobile navigation and table scrolling',()=>{
 assert.ok(ADMIN_CSS.includes('#workspace .metric')&&ADMIN_CSS.includes('#workspace .details-grid'));
 assert.ok(ADMIN_CSS.includes('table.wide-table{min-width:650px}')&&ADMIN_CSS.includes('#workspace .table-scroll{max-width:100%'));
 assert.ok(ADMIN_CSS.includes('width:min(250px,85vw)'));
 assert.ok(ADMIN_CSS.includes('prefers-reduced-motion'));
});
