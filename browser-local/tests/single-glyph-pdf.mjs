import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import PDFDocument from '../node_modules/pdfkit/js/pdfkit.standalone.js';
import SVGtoPDF from 'svg-to-pdfkit';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';

test('PDF output scales single character width to SVG textLength without page images',async t=>{
 if(spawnSync('pdftotext',['-v']).error){t.skip('pdftotext unavailable');return;}
 const dir=await mkdtemp(join(tmpdir(),'sunrise-glyph-'));
 try{
  const path=join(dir,'out.pdf');const output=createWriteStream(path);
  const pdf=new PDFDocument({size:[200,100],margin:0,compress:false});pdf.pipe(output);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="10" y="30" font-size="20" font-family="Helvetica" textLength="10" lengthAdjust="spacingAndGlyphs">M</text><text x="10" y="65" font-size="20" font-family="Helvetica" textLength="40" lengthAdjust="spacingAndGlyphs">M</text></svg>';
  const warnings=[];SVGtoPDF(pdf,svg,0,0,{assumePt:true,warningCallback:w=>warnings.push(w)});pdf.end();await finished(output);
  assert.deepEqual(warnings,[]);
  const result=spawnSync('pdftotext',['-bbox',path,'-'],{encoding:'utf8'});assert.equal(result.status,0);
  const words=[...result.stdout.matchAll(/<word xMin="([\d.]+)"[^>]* xMax="([\d.]+)"[^>]*>M<\/word>/g)];
  assert.equal(words.length,2);assert.ok(Math.abs((+words[0][2]-words[0][1])-10)<0.01);assert.ok(Math.abs((+words[1][2]-words[1][1])-40)<0.01);
  const bytes=await readFile(path);assert.doesNotMatch(bytes.toString('latin1'),/\/Subtype\s*\/Image\b/);
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('R43 multi-character textLength remains selectable vector text in PDFKit',async t=>{
 if(spawnSync('pdftotext',['-v']).error){t.skip('pdftotext unavailable');return;}
 const dir=await mkdtemp(join(tmpdir(),'sunrise-multi-glyph-'));
 try{
  const path=join(dir,'multi.pdf'),output=createWriteStream(path);
  const pdf=new PDFDocument({size:[350,120],margin:0,compress:false});pdf.pipe(output);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="350" height="120"><text x="10" y="35" font-size="20" font-family="Helvetica" textLength="200" lengthAdjust="spacingAndGlyphs">WIDE TEXT</text><text x="10" y="80" font-size="20" font-family="Helvetica" textLength="120" lengthAdjust="spacing">HELLO WORLD</text></svg>';
  const warnings=[];SVGtoPDF(pdf,svg,0,0,{assumePt:true,warningCallback:w=>warnings.push(w)});
  pdf.end();await finished(output);assert.deepEqual(warnings,[]);
  const result=spawnSync('pdftotext',['-bbox',path,'-'],{encoding:'utf8'});assert.equal(result.status,0);
  assert.ok(result.stdout.includes('WIDE')&&result.stdout.includes('HELLO'));
  const bytes=await readFile(path);assert.doesNotMatch(bytes.toString('latin1'),/\/Subtype\s*\/Image\b/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
