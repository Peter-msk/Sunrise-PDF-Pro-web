import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyProError} from '../src/pro-telemetry.js';
import {canRecoverFile,recoveryCode,recoveryEngine,planBulkRecovery,planConversion}
 from '../src/conversion-recovery.mjs';

const f=(name,err,engine='professional')=>({file:{name},state:'failed',
 error:err,lastEngine:engine});

test('XLSX and file reader error categories survive anonymous classification',()=>{
 for(const code of ['XLSX_ZIP_LOCAL_HEADER_INVALID','XLSX_ZIP_EOCD_MISSING',
  'XLSX_PACKAGE_PARTS_MISSING','XLSX_PARSE_FAILED','XLSX_ENGINE_UNAVAILABLE',
  'FILE_READ_IDLE_TIMEOUT','FONT_GLYPH_MISSING','PC_FONT_COLLECTION_FACE_UNAVAILABLE']){
  assert.equal(classifyProError('문서 처리 실패 ('+code+')'),code);
 }
 assert.equal(classifyProError('사용자정보.pdf /local/private'), 'CONVERSION_FAILED');
 assert.equal(classifyProError('사용자 파일 /local/private/name.xlsx 에서 오류'),'CONVERSION_FAILED');
});

test('missing glyph explicitly offers per-file raster PDF, never auto-downgrades unrelated docs',()=>{
 const glyph=f('실패문서.hwp','8쪽 글자 미지원 (FONT_GLYPH_MISSING)');
 const svg=f('필터.hwpx','SVG_FILTER_EFFECT_UNSUPPORTED');
 const parsed=f('표.xlsx','XLSX_PARSE_FAILED');
 assert.equal(recoveryCode(glyph.error),'FONT_GLYPH_MISSING');
 assert.equal(canRecoverFile(glyph),true);
 assert.equal(recoveryEngine(glyph),'compat-raster');
 const queued={file:{name:'기다리는문서.hwp'},state:'ready'};
 const original=planConversion([glyph,queued],'professional');
 assert.equal(original.recovery,false);
 assert.equal(original.engine,'professional');
 assert.deepEqual(original.pending,[glyph,queued]);
 const explicit=planConversion([glyph,queued],'professional',glyph);
 assert.deepEqual(explicit.pending,[glyph]);
 assert.equal(explicit.engine,'compat-raster');
 const batch=planBulkRecovery([glyph,svg,parsed,queued]);
 assert.deepEqual(batch.targets.map(x=>x.engine),['compat-raster','hybrid-filter']);
 assert.equal(parsed.state,'failed');
 assert.equal(queued.state,'ready');
 assert.equal(canRecoverFile(f('실패.hwpx','FONT_GLYPH_MISSING','compat-raster')),false);
 assert.equal(canRecoverFile(f('실패.hwp','FONT_FAMILY_OR_VARIANT_UNAVAILABLE')),false);
 assert.equal(canRecoverFile(f('실패.hwp','UNKNOWN_ERROR')),false);
});

test('live UI discloses quality loss and XLSX diagnostic stages without touching output default',()=>{
 const ui=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const telemetry=readFileSync(new URL('../src/pro-telemetry.js',import.meta.url),'utf8');
 const sheet=readFileSync(new URL('../src/spreadsheet-pdf.js',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../../src/admin/handler.js',import.meta.url),'utf8');
 assert.match(ui,/글꼴 누락·스트림 오류/);
 assert.match(ui,/글자 검색이 불가능/);
 assert.match(ui,/itemEngine=spec\?\.engine\|\|engine/);
 assert.match(ui,/item\._proDiagStage=info\.stage==='load'\?\(\['xlsx_package','xlsx_parse'\]/);
 assert.match(telemetry,/xlsx_package','xlsx_parse'/);
 assert.match(backend,/xlsx_package','xlsx_parse'/);
 assert.match(sheet,/detail:'xlsx_package'/);
 assert.match(sheet,/detail:'xlsx_parse'/);
 assert.match(sheet,/XLSX_PARSE_FAILED/);
 assert.match(sheet,/XLSX_ENGINE_UNAVAILABLE/);
 assert.doesNotMatch(ui,/\$\('pdf-engine'\)\.value\s*=\s*'compat-raster'/);
});
