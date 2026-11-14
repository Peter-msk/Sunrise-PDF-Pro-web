/**
 * Evidence gate for a locally exported PDF PRO Web 25-file report.
 * It is deliberately NOT a release gate: the JSON has no source/PDF content,
 * so page geometry, fonts, searchability and visual parity remain unverified.
 * No network, filename or document-byte access.
 */
import {LOCAL_QA_MAX_PAGES} from './local-batch-qa.mjs';
export const QA_BATCH_SIZE=25;
const FORMAT=new Set(['hwp','hwpx','xls','xlsx','jpg','jpeg','png']);
const ENGINES=new Set(['professional','hybrid-filter','compat-raster']);
const STATES=['ready','working','done','failed','cancelled','invalid'];
const reportSchema='sunrise-pdf-pro-web-local-qa/v1';
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=LOCAL_QA_MAX_PAGES;
const mark=(issues,code,index=null)=>issues.push({code,...(index===null?{}:{index})});

/**
 * Returns a bounded code-only result. A structurally complete report is still
 * "VISUAL_REVIEW_REQUIRED", not a proof that 25 user documents were rendered
 * correctly, or that the queue contained 25 distinct originals.
 */
export function reviewLocal25FileReport(report,{expectedFiles=QA_BATCH_SIZE}={}){
 if(!Number.isSafeInteger(expectedFiles)||expectedFiles<1||expectedFiles>250)
  throw Error('LOCAL_QA_EXPECTED_COUNT_INVALID');
 const issues=[];
 if(!report||typeof report!=='object'||Array.isArray(report)||
   report.schema!==reportSchema||!Array.isArray(report.files)){
  mark(issues,'QA_SCHEMA_INVALID');
  return {status:'BLOCKED',expected_files:expectedFiles,reported_files:0,
   complete_files:0,image_pages:0,issues,visual_review_required:true};
 }
 const files=report.files,seen=new Set();
 if(files.length!==expectedFiles)mark(issues,'QA_FILE_COUNT_MISMATCH');
 const counts=Object.fromEntries(STATES.map(state=>[state,0]));
 let imagePages=0;
 for(let i=0;i<files.length&&i<expectedFiles;i++){
  const f=files[i],index=i+1;
  if(!f||typeof f!=='object'||Array.isArray(f)){mark(issues,'QA_FILE_RECORD_INVALID',index);continue;}
  if(f.index!==index||seen.has(f.index))mark(issues,'QA_INDEX_INVALID',index);
  seen.add(f.index);
  if(!FORMAT.has(f.format))mark(issues,'QA_FORMAT_INVALID',index);
  if(!STATES.includes(f.state)){mark(issues,'QA_STATE_INVALID',index);continue;}
  counts[f.state]++;
  if(f.state!=='done'){
   mark(issues,'QA_FILE_NOT_COMPLETED',index);
   continue;
  }
  if(!Number.isSafeInteger(f.pages)||f.pages<1||f.pages>LOCAL_QA_MAX_PAGES){
   mark(issues,'QA_PAGES_INVALID',index);continue;
  }
  if(f.error_code!==null||f.filter_category!==null)
   mark(issues,'QA_DONE_HAS_ERROR',index);
  if(f.engine!==null&&!ENGINES.has(f.engine))
   mark(issues,'QA_ENGINE_INVALID',index);
  const v=f.vector_pages,r=f.raster_pages;
  if(v!==null&&v!==undefined&&!count(v))mark(issues,'QA_VECTOR_PAGES_INVALID',index);
  if(r!==null&&r!==undefined&&!count(r))mark(issues,'QA_RASTER_PAGES_INVALID',index);
  if(count(v)&&count(r)&&v+r!==f.pages)mark(issues,'QA_PAGE_COMPONENTS_MISMATCH',index);
  if(count(r))imagePages+=r;
 }
 // Do not trust an externally supplied summary when the file-level evidence
 // differs. Never count successes based on anonymous server telemetry.
 if(!report.totals||typeof report.totals!=='object'||
  report.totals.queued!==files.length||
  STATES.some(s=>report.totals[s]!==counts[s]))
  mark(issues,'QA_TOTALS_MISMATCH');
 if(files.length>expectedFiles)mark(issues,'QA_ADDITIONAL_FILES');
 return {
  status:issues.length?'BLOCKED':'VISUAL_REVIEW_REQUIRED',
  expected_files:expectedFiles,reported_files:files.length,
  complete_files:counts.done,image_pages:imagePages,
  issues:issues.slice(0,expectedFiles+6),visual_review_required:true
 };
}
