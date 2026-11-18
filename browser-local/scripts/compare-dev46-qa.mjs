/** Compare the anonymous real 25-file baseline with a new local QA export.
 * Structural evidence only. No source or PDF bytes, no upload, no deploy.
 */
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const schema='sunrise-pdf-pro-web-local-qa/v1';
const states=['ready','working','done','failed','cancelled','invalid'];
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000;
const page=v=>count(v)&&v>0;
const indexList=[3,4,9,10,11,12,13,14,24,25];
const expectedError=i=>i>=24?'PDF_STREAM_TIMEOUT':'SVG_FILTER_EFFECT_UNSUPPORTED';
function validReport(r){
 if(r?.schema!==schema||!Array.isArray(r.files)||r.files.length!==25||r.totals?.queued!==25)return false;
 if(!r.files.every((f,i)=>f&&f.index===i+1&&['hwp','hwpx'].includes(f.format)&&states.includes(f.state))||
  !states.every(s=>r.totals[s]===r.files.filter(f=>f.state===s).length))return false;
 const tally=new Map();
 for(const f of r.files)if(f.state==='failed'){if(typeof f.error_code!=='string'||!f.error_code)return false;tally.set(f.error_code,(tally.get(f.error_code)||0)+1);}
 const summary=r.failures_by_code;
 return !!summary&&typeof summary==='object'&&!Array.isArray(summary)&&Object.keys(summary).length===tally.size&&[...tally].every(([code,n])=>Object.hasOwn(summary,code)&&summary[code]===n);
}
export function compareDev46Qa(base,next){
 const issues=[], recovered=[], remaining=[], regressions=[], fontReview=[],diagnostics=[];
 const mark=(code,index)=>issues.push(index==null?{code}:{code,index});
 const finish=()=>({status:issues.length?'BLOCKED':'VISUAL_REVIEW_REQUIRED',issues,recovered,remaining,regressions,font_review:fontReview,missing_diagnostics:diagnostics,visual_review_required:true});
 if(!validReport(base)||!Number.isFinite(Date.parse(base.generated_at))||base.totals.done!==15||base.totals.failed!==10||
  !base.files.every(f=>indexList.includes(f.index)?f.state==='failed'&&f.error_code===expectedError(f.index):f.state==='done'&&page(f.pages)&&f.vector_pages===f.pages&&f.raster_pages===0)||
  base.files.reduce((sum,f)=>sum+(f.state==='done'?f.pages:0),0)!==134){mark('BASELINE_INVALID');return finish();}
 if(!validReport(next)){mark('RETEST_INVALID');return finish();}
 if(!/^DEV(?:4[6-9]|[5-9]\d|[1-9]\d{2,})$/.test(next.build_revision??'')||!['local','qa'].includes(next.deployment_channel)||next.rhwp_version!=='0.9.0')mark('RETEST_BUILD_OR_ENGINE_UNVERIFIED');
 if(!Number.isFinite(Date.parse(next.generated_at))||Date.parse(next.generated_at)<=Date.parse(base.generated_at))mark('RETEST_TIMESTAMP_INVALID');
 for(let i=0;i<25;i++){
  const before=base.files[i],after=next.files[i],n=i+1;
  if(before.format!==after.format){mark('RETEST_FORMAT_MISMATCH',n);continue;}
  if(after.state!=='done'){
   mark('RETEST_NOT_COMPLETED',n);
   (before.state==='done'?regressions:remaining).push(n);
   if(after.error_code==='SVG_FILTER_EFFECT_UNSUPPORTED'&&(!after.filter_primitive||['other','unspecified'].includes(after.filter_primitive)))diagnostics.push(n);
   if(after.error_code==='PDF_STREAM_TIMEOUT'&&(!['NO_BYTES','NO_FINAL_BYTES','FINAL_BYTES_NO_END','END_SEEN_NO_COMPLETION'].includes(after.stream_reason)||!count(after.stream_pending_refs)))diagnostics.push(n);
   continue;
  }
  if(after.error_code!==null||after.filter_category!==null||!['professional','hybrid-filter'].includes(after.engine)||!page(after.pages)||!count(after.vector_pages)||!count(after.raster_pages)||after.vector_pages+after.raster_pages!==after.pages||(after.source_pages!=null&&after.source_pages!==after.pages)){mark('RETEST_OUTPUT_INVALID',n);if(before.state==='done')regressions.push(n);continue;}
  if(after.raster_pages!==0){mark('RETEST_RASTER_OUTPUT',n);if(before.state==='done')regressions.push(n);continue;}
  if(before.state==='done'&&before.pages!==after.pages){mark('RETEST_PAGE_COUNT_CHANGED',n);regressions.push(n);continue;}
  if(before.state==='failed')recovered.push(n);
  if(!count(after.substituted_font_families)||!count(after.unmatched_pc_font_families)||after.substituted_font_families>0||after.unmatched_pc_font_families>0)fontReview.push(n);
 }
 return finish();
}
function read(path){if(!path||!statSync(path).isFile()||statSync(path).size>2_000_000)throw Error('QA_REPORT_INVALID');return JSON.parse(readFileSync(path,'utf8'));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const r=compareDev46Qa(read(process.argv[2]),read(process.argv[3]));console.log(JSON.stringify(r,null,2));if(r.status==='BLOCKED')process.exitCode=1;}
 catch{console.error('QA_REPORT_READ_OR_PARSE_FAILED');process.exitCode=2;}
}
