/**
 * Sunrise PDF PRO — R49 DEV2: permission-aware, OPTIONAL local-font access.
 * A Local Font Access failure must not silently claim that Windows has no
 * fonts, nor fail an unrelated Excel/image file. Print/PDF warnings must
 * disclose when the browser used substitutes instead of PC fonts.
 *
 * No font bytes are read here; no metadata is persisted or sent off-device.
 * queryLocalFonts() itself remains invoked in the user's original click.
 */
const DENIED = new Set(['NotAllowedError','SecurityError','PermissionDeniedError']);
function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
}
// The browser API cannot necessarily be cancelled after permission is opened,
// but our conversion must not remain blocked waiting for that Promise.
function awaitOrCancel(task,signal,timeoutMs=30000) {
  checkAbort(signal);
  return new Promise((resolve,reject)=>{
    let settled=false;
    let timer=null;
    const finish=(callback,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      signal?.removeEventListener('abort',cancel);
      callback(value);
    };
    const cancel=()=>finish(reject,new DOMException('PDF 변환이 취소되었습니다.','AbortError'));
    signal?.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>finish(reject,Object.assign(new Error('LOCAL_FONT_ACCESS_TIMEOUT'),{name:'TimeoutError'})),timeoutMs);
    Promise.resolve(task).then(value=>finish(resolve,value),error=>finish(reject,error));
    if(signal?.aborted)cancel();
  });
}
function outcome(status,notice,permission='unknown',fonts=null) {
  return {status,fonts,notice,permission};
}
/**
 * @param {Promise<Array>|null} request a promise started directly in the user click.
 * @param {{permissions?: object, signal?: AbortSignal}} options
 * @returns {Promise<{status:string,fonts:Array|null,notice:string,permission:string}>}
 */
export async function settleInstalledFonts(request, {
  permissions=globalThis.navigator?.permissions, signal, timeoutMs=30000
}={}) {
  checkAbort(signal);
  if (request == null) return outcome('disabled','');
  try {
    const result=await awaitOrCancel(request,signal,timeoutMs);
    checkAbort(signal);
    if (!Array.isArray(result)) return outcome('invalid-result',
      'PC 글꼴 API가 비정상 결과를 반환했습니다. 내장 글꼴로 계속하며, 필요한 TTF/OTF는 직접 선택하세요.');
    if (result.length) {
      // Only metadata is inspected: the font blob() method is not called.
      const readable=result.filter(item=>item&&typeof item.family==='string'&&
        item.family.trim()&&typeof item.blob==='function');
      if (readable.length) return outcome('ready','', 'unknown',readable);
      return outcome('unreadable',
        'PC 글꼴 목록은 반환됐지만 읽을 수 있는 글꼴이 없어 내장 글꼴로 변환합니다.');
    }
    // [] does NOT mean the OS lacks fonts. Query is advisory and optional.
    let permission='unknown';
    try {
      const state=(await awaitOrCancel(permissions?.query?.({name:'local-fonts'}),signal,Math.min(5000,timeoutMs)))?.state;
      if (['granted','denied','prompt'].includes(state)) permission=state;
    } catch { /* Permissions API may not expose local-fonts. */ }
    checkAbort(signal);
    if (permission==='denied') return outcome('denied',
      'PC 글꼴 접근이 거부됐습니다. 브라우저 사이트 권한을 확인하세요. 내장 글꼴로 변환하며 원본 서체는 달라질 수 있습니다.',permission);
    if (permission==='granted') return outcome('empty-granted',
      'PC 글꼴 권한은 허용됐지만 브라우저가 0개를 반환했습니다. Windows 글꼴 부재로 단정할 수 없으며 내장 글꼴로 변환합니다.',permission);
    if (permission==='prompt') return outcome('empty-prompt',
      'PC 글꼴 권한이 아직 허용된 것으로 확인되지 않았습니다. 내장 글꼴로 변환하며 원본 서체는 달라질 수 있습니다.',permission);
    return outcome('empty-unknown',
      '브라우저가 PC 글꼴 목록을 0개 반환했고 권한 상태도 확인할 수 없습니다. 내장 글꼴로 변환합니다.',permission);
  } catch(error) {
    if(error?.name==='TimeoutError')return outcome('timeout',
      'PC 글꼴 접근 권한 응답이 지연되어 내장 글꼴로 변환을 계속합니다. 글꼴 접근을 허용한 후 다시 변환하면 원본 서체를 우선 사용합니다.');
    if (error?.name==='AbortError'||signal?.aborted) {
      checkAbort(signal);
      throw error;
    }
    if (DENIED.has(error?.name)) return outcome('denied',
      'PC 글꼴 접근이 거부되거나 보안 정책으로 차단됐습니다. 내장 글꼴로 변환하며 원본 서체는 달라질 수 있습니다.');
    return outcome('failed',
      'PC 글꼴을 읽는 과정에서 오류가 발생했습니다. 내장 글꼴로 변환하며 정확한 서체가 필요하면 TTF/OTF를 직접 선택하세요.');
  }
}
/** Check browser support without prompting for permission. */
export function localFontCapability(host=globalThis){
  return {supported:typeof host?.queryLocalFonts==='function',
    secure:host?.isSecureContext===true};
}
