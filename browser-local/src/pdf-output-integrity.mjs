/** R66-DEV22: bounded PDF output structure validation.
 * Checks header, final startxref, EOF and the actual referenced xref target.
 * Both classic xref tables and PDF 1.5+ xref streams are supported.
 * This is NOT a full PDF parser or a content/visual-fidelity validator.
 */
const TAIL_BYTES=4096;
const XREF_LOOKAHEAD=4096;
const MAX_BYTES=512*1024*1024;
const DECODER=new TextDecoder('latin1');

function xrefWindow(source,offset,total){
 const length=Math.min(XREF_LOOKAHEAD,total-offset);
 if(source instanceof Uint8Array){
  if(source.length!==total)throw Error('PDF_OUTPUT_XREF_SOURCE_MISMATCH');
  return source.subarray(offset,offset+length);
 }
 if(!Array.isArray(source))throw Error('PDF_OUTPUT_XREF_SOURCE_REQUIRED');
 const sample=new Uint8Array(length);
 let copied=0,pos=0;
 for(const chunk of source){
  if(!(chunk instanceof Uint8Array))throw Error('PDF_OUTPUT_XREF_SOURCE_MISMATCH');
  const end=pos+chunk.length;
  if(end>offset && pos<offset+length){
   const from=Math.max(0,offset-pos);
   const take=Math.min(end,offset+length)-(pos+from);
   sample.set(chunk.subarray(from,from+take),Math.max(0,pos+from-offset));
   copied+=take;
  }
  pos=end;
 }
 if(pos!==total||copied!==length)throw Error('PDF_OUTPUT_XREF_SOURCE_MISMATCH');
 return sample;
}

function verifyXrefWindow(bytes){
 const sourceText=DECODER.decode(bytes);
 if(/^xref[ \t]*(?:\r\n|\n|\r)[0-9]+[ \t]+[0-9]+[ \t]*(?:\r\n|\n|\r)/.test(sourceText))return 'table';
 // A PDF 1.5+ cross-reference stream starts with an indirect object header;
 // its dictionary must declare /Type /XRef before the binary 'stream' token.
 const header=/^[0-9]{1,10}[ \t]+[0-9]{1,5}[ \t]+obj\b/.exec(sourceText);
 if(header){
  const beforeStream=sourceText.split(/\bstream\b/,1)[0];
  if(beforeStream.indexOf('<<',header[0].length)>=0 &&
     /\/Type\s*\/XRef\b/.test(beforeStream) &&
     /\/Size\s+[0-9]+\b/.test(beforeStream) &&
     /\/W\s*\[/.test(beforeStream))return 'stream';
 }
 throw Error('PDF_OUTPUT_XREF_TARGET_INVALID');
}
function verifyXrefAt(source,offset,total){
 return verifyXrefWindow(xrefWindow(source,offset,total));
}

function pdfEnvelope(header,tail,size){
 if(size<40||header.length!==8||!/^%PDF-(?:1\.[0-7]|2\.0)$/.test(DECODER.decode(header)))
  throw Error('PDF_OUTPUT_HEADER_INVALID');
 const suffix=DECODER.decode(tail);
 const match=/(?:^|[\r\n])startxref[ \t]*[\r\n]+([0-9]+)[ \t]*[\r\n]+%%EOF[ \t\r\n]*$/.exec(suffix);
 if(!match)throw Error('PDF_OUTPUT_TRAILER_INCOMPLETE');
 const pointer=Number(match[1]);
 if(!Number.isSafeInteger(pointer)||pointer<8||pointer>=size-20)
  throw Error('PDF_OUTPUT_XREF_OFFSET_INVALID');
 return pointer;
}

/** Check a Blob's PDF envelope using only bounded sparse reads (<= 8 KiB),
 * avoiding an additional whole-file buffer after a large HWP/XLSX render.
 * This is a structural gate, not a substitute for parsing page content. */
export async function assertCompletePdfBlob(blob,signal,maxBytes=MAX_BYTES){
 if(!(blob instanceof Blob))throw Error('PDF_OUTPUT_BLOB_REQUIRED');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_BYTES)
  throw Error('PDF_OUTPUT_BUDGET_INVALID');
 if(blob.size>maxBytes)throw Error('PDF_OUTPUT_BYTES_LIMIT');
 const cancel=()=>{if(signal?.aborted)
  throw new DOMException('PDF 검증이 취소되었습니다.','AbortError');};
 cancel();
 const head=new Uint8Array(await blob.slice(0,8).arrayBuffer());
 cancel();
 const tail=new Uint8Array(await blob.slice(-TAIL_BYTES).arrayBuffer());
 cancel();
 const pointer=pdfEnvelope(head,tail,blob.size);
 const window=new Uint8Array(await blob.slice(pointer,Math.min(blob.size,pointer+XREF_LOOKAHEAD)).arrayBuffer());
 cancel();
 verifyXrefWindow(window);
 return blob;
}

/** Format-neutral success gate. All converters must return a structurally
 * complete PDF Blob and self-consistent page/byte counts before UI marks done.
 * This does not claim text fidelity or that all declared pages are rendered. */
export async function assertConvertedPdfResult(result,signal){
 if(!Number.isSafeInteger(result?.pages)||result.pages<1||result.pages>120)
  throw Error('PDF_RESULT_PAGE_COUNT_INVALID');
 if(!(result?.pdf instanceof Blob))throw Error('PDF_OUTPUT_BLOB_REQUIRED');
 if(!Number.isSafeInteger(result.bytes)||result.bytes!==result.pdf.size)
  throw Error('PDF_RESULT_BYTES_MISMATCH');
 await assertCompletePdfBlob(result.pdf,signal);
 return result;
}

export function createPdfOutputGuard(maxBytes=MAX_BYTES){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_BYTES)
  throw Error('PDF_OUTPUT_BUDGET_INVALID');
 const first=new Uint8Array(8),tail=new Uint8Array(TAIL_BYTES);
 let size=0,leading=0,trailing=0,finished=false;
 function append(chunk){
  if(finished)throw Error('PDF_OUTPUT_ALREADY_FINISHED');
  if(!(chunk instanceof Uint8Array))throw Error('PDF_OUTPUT_CHUNK_INVALID');
  if(chunk.byteLength>maxBytes-size)throw Error('PDF_OUTPUT_BYTES_LIMIT');
  if(leading<8){
   const take=Math.min(8-leading,chunk.byteLength);
   first.set(chunk.subarray(0,take),leading);leading+=take;
  }
  const n=chunk.byteLength;
  if(n>=TAIL_BYTES){tail.set(chunk.subarray(n-TAIL_BYTES));trailing=TAIL_BYTES;}
  else if(n){
   if(trailing+n>TAIL_BYTES){
    const overflow=trailing+n-TAIL_BYTES;
    tail.copyWithin(0,overflow,trailing);trailing-=overflow;
   }
   tail.set(chunk,trailing);trailing+=n;
  }
  size+=n;
 }
 /** source is the existing pdf-lib Uint8Array or PDFKit's retained chunks.
  * No duplicate full-document copy is made for the target inspection. */
 function finish(source){
  if(finished)throw Error('PDF_OUTPUT_ALREADY_FINISHED');
  finished=true;
  const pointer=pdfEnvelope(first.subarray(0,leading),tail.subarray(0,trailing),size);
  const xrefKind=verifyXrefAt(source,pointer,size);
  return {bytes:size,xrefOffset:pointer,xrefKind};
 }
 return {append,finish,get bytes(){return size;}};
}

export function assertCompletePdfBytes(bytes,maxBytes=MAX_BYTES){
 if(!(bytes instanceof Uint8Array))throw Error('PDF_OUTPUT_CHUNK_INVALID');
 const guard=createPdfOutputGuard(maxBytes);
 guard.append(bytes);
 guard.finish(bytes);
 return bytes;
}
