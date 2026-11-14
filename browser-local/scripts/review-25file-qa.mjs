#!/usr/bin/env node
/**
 * Local privacy-safe structural report inspection.
 * Usage: node scripts/review-25file-qa.mjs "/path/to/Sunrise_PDF_PRO_Web_QA_....json"
 * Does not read source HWP/HWPX, open PDFs, contact a network or trigger deploy.
 * Passing this check is NEVER equivalent to visual / semantic PDF acceptance.
 */
import {readFileSync,statSync} from 'node:fs';
import {reviewLocal25FileReport} from '../src/local-qa-release-gate.mjs';

const filepath=process.argv[2];
if(!filepath){
 console.error('사용법: npm run qa:review -- "<실기 검증 보고서 JSON 경로>"');
 process.exitCode=2;
}else{
 try{
  const stat=statSync(filepath);
  if(!stat.isFile()||stat.size>2_000_000)throw Error('QA_REPORT_SIZE_INVALID');
  const parsed=JSON.parse(readFileSync(filepath,'utf8'));
  const result=reviewLocal25FileReport(parsed);
  // Never print filepath, original filenames, raw input or exception text.
  console.log(JSON.stringify(result,null,2));
  console.log(result.status==='BLOCKED'
   ?'구조/완료상태 판정: 미달. 파일별 실패 원인을 복구한 뒤 새 보고서를 저장하세요.'
   :'구조/완료상태 판정: 통과. 그러나 실제 25개 원본·PDF 시각 대조, 한글 글꼴, 검색/복사, 표·이미지·쪽수 검증 전에는 배포할 수 없습니다.');
  if(result.status==='BLOCKED')process.exitCode=1;
 }catch{
  console.error('QA_REPORT_READ_OR_PARSE_FAILED (보고서 형식·크기·읽기 권한을 확인하세요.)');
  process.exitCode=2;
 }
}
