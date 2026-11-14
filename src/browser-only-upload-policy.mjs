/**
 * Reject the retired server document-conversion path before it can reach a
 * backend relay. Real HWP/HWPX conversion runs in /local/ via RHWP WASM;
 * only browser-local fonts/files may be used. Admin/public JSON endpoints
 * must continue operating normally.
 */
export function blocksLegacyDocumentUpload(path,method,contentType=''){
 const verb=String(method||'').toUpperCase();
 if(verb==='GET'||verb==='HEAD')return false;
 const pathname=String(path||'');
 // The old R27 UI posted an original HWP/HWPX File through FormData here.
 if(/^\/api\/jobs(?:\/|$)/i.test(pathname)&&!/^\/api\/jobs\/[^/]+\/cancel\/?$/i.test(pathname))return true;
 if(/^\/api\/(?:convert|upload|documents)(?:\/|$)/i.test(pathname))return true;
 // A separately named endpoint must not smuggle a document as multipart.
 if(pathname.startsWith('/api/')&&/^multipart\/form-data\s*(?:;|$)/i.test(String(contentType||'')))
  return true;
 return false;
}
