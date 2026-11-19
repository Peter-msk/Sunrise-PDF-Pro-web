// Same-origin published content only. No document metadata or write API.
export const updatesMarkup="<aside class=\"pro-updates-rail\" aria-label=\"공지사항 및 업데이트\"><details class=\"pro-updates-panel\" id=\"pro-notice-details\"><summary>공지사항</summary><div class=\"pro-updates-items\" id=\"pro-notice-items\" aria-live=\"polite\"><p>공지사항을 불러오는 중입니다.</p></div><a class=\"pro-updates-more\" href=\"/news/\">전체 공지 보기</a></details><details class=\"pro-updates-panel\" id=\"pro-release-details\"><summary>업데이트</summary><div class=\"pro-updates-items\" id=\"pro-release-items\" aria-live=\"polite\"><p>업데이트를 불러오는 중입니다.</p></div><a class=\"pro-updates-more\" href=\"/news/\">전체 업데이트 보기</a></details></aside>";
export const updatesCSS=` .pro-updates-rail{display:flex;gap:8px;align-items:flex-start;max-width:100%;margin:0 0 14px;font-size:12px;line-height:1.5;color:#294a65}.pro-updates-home .pro-updates-rail{width:min(1140px,calc(100% - 36px));margin:12px auto 0}.pro-updates-panel{flex:1;min-width:0;background:#fff;border:1px solid #d7e3ee;border-radius:9px;box-shadow:0 4px 14px #183c6010;overflow:hidden}.pro-updates-panel summary{cursor:pointer;padding:9px 12px;font-weight:800;color:#123e66;background:#f4f8fc}.pro-updates-panel summary:focus-visible,.pro-updates-more:focus-visible{outline:2px solid #2677cd;outline-offset:-2px}.pro-updates-items{max-height:min(32vh,280px);overflow:auto;overflow-wrap:anywhere;padding:0 10px;overscroll-behavior:contain}.pro-updates-items article{padding:10px 0;border-bottom:1px solid #e4edf4}.pro-updates-items article:last-child{border:0}.pro-updates-items h3{font-size:12px;line-height:1.45;margin:0 0 4px}.pro-updates-items p{font-size:11px;margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere;color:#506a80}.pro-updates-items time{font-size:10px;color:#6b8196}.pro-updates-more{display:block;padding:7px 10px;border-top:1px solid #e7eef4;font-size:11px;color:#2166a5;text-decoration:none}.pro-updates-panel:not([open]) .pro-updates-more{display:none}
@media(min-width:1640px){.pro-updates-home .pro-updates-rail{position:fixed;z-index:9;left:max(12px,calc((100vw - 1140px)/2 - 248px));top:88px;width:224px;max-height:calc(100dvh - 100px);margin:0;display:flex;flex-direction:column;align-items:stretch;overflow:auto}.pro-updates-home .pro-updates-panel{flex:none}}
@media(min-width:1920px){.pro-updates-local .pro-updates-rail{position:fixed;z-index:9;left:max(12px,calc((100vw - 1480px)/2 - 212px));top:83px;width:190px;max-height:calc(100dvh - 95px);margin:0;display:flex;flex-direction:column;align-items:stretch;overflow:auto}.pro-updates-local .pro-updates-panel{flex:none}}
@media(max-width:480px){.pro-updates-rail{gap:6px}.pro-updates-panel summary{padding:8px;font-size:11px}.pro-updates-items{padding:0 8px}}`;
export const updatesScript=String.raw`(()=>{
 const panel=document.getElementById('pro-notice-details'),release=document.getElementById('pro-release-details');
 if(!panel||!release)return;
 const wide=matchMedia(document.body.classList.contains('pro-updates-local')?'(min-width: 1920px)':'(min-width: 1640px)');
 panel.open=release.open=wide.matches;
 const node=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
 function draw(id,items,empty){
  const root=document.getElementById(id);if(!root)return;
  root.replaceChildren();
  if(!Array.isArray(items))throw Error('invalid feed');
  const valid=items.filter(item=>item&&typeof item.title==='string'&&typeof item.body==='string').slice(0,8);
  if(!valid.length){root.append(node('p',empty));return;}
  for(const item of valid){
   const article=document.createElement('article');
   article.append(node('h3',item.title.slice(0,200)));
   const seconds=Number(item.first_published_at);
   if(item.first_published_at!=null&&Number.isFinite(seconds)){
    const date=new Date(seconds*1000);
    if(Number.isFinite(date.getTime())){
     const time=node('time',new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date));
     time.dateTime=date.toISOString();article.append(time);
    }
   }
   article.append(node('p',item.body.slice(0,4000)));root.append(article);
  }
 }
 fetch('/api/public/updates',{method:'GET',cache:'no-store',credentials:'same-origin'}).then(r=>{
  if(!r.ok)throw Error('feed unavailable');return r.json();
 }).then(data=>{
  draw('pro-notice-items',data.announcements,'현재 게시된 공지사항이 없습니다.');
  draw('pro-release-items',data.releases,'현재 게시된 업데이트가 없습니다.');
 }).catch(()=>{
  for(const id of ['pro-notice-items','pro-release-items']){
   const root=document.getElementById(id);if(root)root.textContent='게시물을 불러오지 못했습니다. 전체 공지 페이지에서 확인하세요.';
  }
 });
})();`;
