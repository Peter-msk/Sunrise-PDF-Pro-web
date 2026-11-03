'use strict';
(()=> {
  const $=id=>document.getElementById(id);
  let selected=null,csrf='',job=null,interval=null,engine=false,wasm=false,username='';
  const set=(id,v)=>{$(id).textContent=String(v);};
  const reply=(msg)=>set('feedback',msg);
  const sync=()=>{ $('convert').disabled=!selected||!engine||!csrf; $('preview').disabled=!selected||!wasm||!csrf; $('cancel').disabled=!job||!['queued','running'].includes(job.state); $('refresh').disabled=!csrf; };
  async function api(path,options={}){
    const method=options.method||'GET';
    const headers={...(options.headers||{})};
    if(method!=='GET'&&csrf)headers['X-Sunrise-CSRF']=csrf;
    const response=await fetch(path,{...options,method,headers,credentials:'same-origin',cache:'no-store'});
    if(!response.ok){let reason='HTTP '+response.status;try{const j=await response.json();reason=j.detail||j.error||reason;}catch{}throw Error(String(reason));}
    return options.raw?response:response.json();
  }
  const fileSelected=async(file)=>{
    selected=null;set('fileInfo','선택된 문서가 없습니다.');
    if(!file){sync();return;}
    if(!/\.(hwp|hwpx)$/i.test(file.name)||file.size<8||file.size>20*1024*1024){reply('HWP/HWPX 문서 20MiB 이하만 선택할 수 있습니다.');sync();return;}
    const head=new Uint8Array(await file.slice(0,8).arrayBuffer());
    const isHwp=/\.hwp$/i.test(file.name);
    const valid=isHwp?[208,207,17,224,161,177,26,225].every((v,i)=>head[i]===v):head[0]===80&&head[1]===75&&head[2]===3&&head[3]===4;
    if(!valid){reply('원본 파일의 기본 서명과 확장자가 다릅니다.');sync();return;}
    selected=file;set('fileInfo',file.name+' · '+(file.size/1048576).toFixed(2)+' MiB · 기본 서명 확인');
    reply(engine?'원본 선택 완료. 서버에 로그인되어 있으면 변환할 수 있습니다.':'원본 선택 완료. 백엔드가 미연결이므로 문서를 전송하지 않습니다.');
    sync();
  };
  $('file').addEventListener('change',e=>fileSelected(e.target.files[0]));
  const drop=$('drop');
  ['dragover','dragleave','drop'].forEach(k=>drop.addEventListener(k,e=>{e.preventDefault();drop.classList.toggle('drag',k==='dragover');if(k==='drop')fileSelected(e.dataTransfer.files[0]);}));
  function offline(){
    engine=false;wasm=false;
    set('badge','변환 서버 미연결');$('badge').classList.add('warn');
    set('serviceTitle','웹 테스트 화면 배포 완료');
    set('serviceDetail','Cloudflare Pages UI는 정상입니다. 실제 HWP/HWPX → PDF 서버는 아직 연결되지 않았습니다.');
    set('serviceMode','API 미연결');set('userLabel','서버 연동 전');
    set('fileHelp','현재 파일은 브라우저에서만 선택·검사합니다. 서버 업로드는 차단됩니다.');
    reply('웹 UI를 확인할 수 있습니다. 변환 서버 연결 전까지 변환은 비활성화됩니다.');
    $('loginLayer').hidden=true;sync();
  }
  async function checkServer(){
    try{
      const r=await api('/api/status');
      engine=Boolean(r.rhwp_cli_available&&r.process_limits&&r.process_limits.ready);
      wasm=Boolean(r.wasm_assets_verified);
      if(!engine){offline();return;}
      set('serviceTitle','변환 API 사용 가능');set('serviceDetail','서버 연결을 확인했습니다. 계정 로그인 후 변환을 시험하세요.');
      set('serviceMode','실서비스');set('badge','서버 연결됨');$('badge').classList.remove('warn');
      const session=await api('/api/session').catch(()=>null);
      if(session&&session.csrf){await authenticated(session);}else{$('loginLayer').hidden=false;set('userLabel','로그인 필요');}
    }catch(e){offline();}
  }
  async function authenticated(s){csrf=s.csrf;username=s.user||'';set('userLabel',username);$('loginLayer').hidden=true;$('logout').hidden=false;sync();await jobs();}
  async function jobs(){
    if(!csrf)return;
    try{const data=await api('/api/jobs');$('jobs').replaceChildren();
      for(const j of (data.jobs||[])){const row=document.createElement('div');row.className='jobrow';
        const name=document.createElement('strong');name.textContent=j.file||'문서';
        const meta=document.createElement('span');meta.textContent=(j.state||'unknown')+' · '+(j.percent||0)+'%';
        row.append(name,meta);
        if(j.download&&j.state==='completed'){const a=document.createElement('a');a.href=j.download;a.textContent='PDF 다운로드';row.append(a);}
        $('jobs').append(row);
      }
      if(!(data.jobs||[]).length)set('jobs','아직 작업이 없습니다.');
    }catch(e){reply('작업 조회 오류: '+e.message);}
  }
  async function poll(){
    if(!job)return;
    try{job=await api('/api/jobs/'+encodeURIComponent(job.id));
      set('stage',job.state);$('fill').style.width=Math.min(100,Math.max(0,Number(job.percent)||0))+'%';sync();
      if(['completed','failed','cancelled','interrupted'].includes(job.state)){
        clearInterval(interval);interval=null;
        if(job.state==='completed'&&job.download){$('download').href=job.download;$('download').hidden=false;reply('실제 PDF 변환 완료 · '+(job.pages||'?')+'쪽');const f=document.createElement('iframe');f.src=job.download;f.title='PDF 결과 미리보기';$('result').replaceChildren(f);}
        else reply('변환 종료: '+job.state+' · '+(job.error||''));
        await jobs();
      }else reply('서버에서 변환 중입니다: '+job.state);
    }catch(e){clearInterval(interval);interval=null;reply('작업 확인 실패: '+e.message);}
  }
  $('convert').addEventListener('click',async()=>{if(!selected||!engine||!csrf)return;
    $('download').hidden=true;const form=new FormData();form.append('file',selected);$('convert').disabled=true;reply('문서를 전송하는 중입니다.');
    try{job=await api('/api/jobs',{method:'POST',body:form});await poll();if(job&&!['completed','failed','cancelled','interrupted'].includes(job.state))interval=setInterval(poll,1400);}
    catch(e){reply('변환 요청 실패: '+e.message);}finally{sync();}
  });
  $('cancel').addEventListener('click',async()=>{if(job&&csrf){try{await api('/api/jobs/'+encodeURIComponent(job.id)+'/cancel',{method:'POST'});reply('작업 취소 요청 완료');}catch(e){reply(e.message);}}});
  $('refresh').addEventListener('click',jobs);
  $('preview').addEventListener('click',()=>reply('브라우저 rhwp WASM 자산 연결 후 원본 미리보기를 활성화합니다.'));
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const r=await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('username').value,password:$('password').value})});$('password').value='';await authenticated(r);}catch(err){set('loginError','로그인 실패: '+err.message);}});
  $('logout').addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST'});}catch{}window.location.reload();});
  checkServer();
})();