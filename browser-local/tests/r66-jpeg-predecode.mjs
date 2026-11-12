import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {jpegSourceInfo,MAX_JPEG_HEADER_BYTES} from '../src/jpeg-header.mjs';

const utf8=new TextEncoder();
const segment=(marker,body)=>Uint8Array.from([255,marker, (body.length+2)>>8, (body.length+2)&255,...body]);
function sample({width=800,height=400,orientation=1,soF=0xc0,appBytes=0}={}){
 const tiff=Uint8Array.from([73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]);
 const exif=segment(0xe1,Uint8Array.from([...utf8.encode('Exif'),0,0,...tiff]));
 const extra=appBytes?segment(0xe2,new Uint8Array(appBytes)):new Uint8Array();
 const sof=segment(soF,Uint8Array.from([8,height>>8,height&255,width>>8,width&255,1,1,0x11,0]));
 return Uint8Array.from([255,216,...exif,...extra,...sof,...segment(0xda,[1,1,0,0,63,0]),0,255,217]);
}
const code=error=>String(error?.message||error);

test('baseline JPEG SOF0 and progressive SOF2 dimensions',()=>{
 for(const soF of [0xc0,0xc2]){
  assert.deepEqual(jpegSourceInfo(sample({soF})),{width:800,height:400,orientation:1,displayWidth:800,displayHeight:400});
 }
});
test('EXIF orientation 6 and 8 swaps displayed dimensions',()=>{
 for(const orientation of [5,6,7,8]){
  assert.deepEqual(jpegSourceInfo(sample({orientation})),{width:800,height:400,orientation,displayWidth:400,displayHeight:800});
 }
});
test('EXIF mirrored orientation 2, 3, 4 retains aspect ratio',()=>{
 for(const orientation of [2,3,4]){
  const info=jpegSourceInfo(sample({orientation}));
  assert.equal(info.displayWidth,800);assert.equal(info.displayHeight,400);
 }
});
test('large but valid SOF dimensions are inspected without pixel decoding',()=>{
 const info=jpegSourceInfo(sample({width:60000,height:40000}));
 assert.equal(info.width,60000);assert.equal(info.height,40000);
});
test('large APP metadata is skipped safely',()=>{
 assert.equal(jpegSourceInfo(sample({appBytes:20000})).width,800);
});
test('truncated JPEG and incorrect SOI are rejected',()=>{
 for(const bytes of [new Uint8Array(),Uint8Array.from([255,216,255,192]),Uint8Array.from([255,216,255,218,0,2])]){
  assert.throws(()=>jpegSourceInfo(bytes),/JPEG_(?:SIGNATURE|HEADER|DIMENSIONS)/);
 }
});
test('zero dimensions and invalid EXIF orientation fail closed',()=>{
 assert.throws(()=>jpegSourceInfo(sample({width:0})),/JPEG_DIMENSIONS_INVALID/);
 assert.throws(()=>jpegSourceInfo(sample({orientation:9})),/JPEG_EXIF_ORIENTATION_INVALID/);
});
test('invalid segment length and marker are rejected',()=>{
 assert.throws(()=>jpegSourceInfo(Uint8Array.from([255,216,255,224,0,1])),/JPEG_SEGMENT_LENGTH_INVALID/);
 assert.throws(()=>jpegSourceInfo(Uint8Array.from([255,216,0,0,0,0])),/JPEG_MARKER_INVALID/);
});
test('SOS without a SOF is rejected',()=>{
 assert.throws(()=>jpegSourceInfo(Uint8Array.from([255,216,...segment(0xda,[1,1,0,0,63,0])])),/JPEG_DIMENSIONS_UNAVAILABLE/);
});
test('bounded header parser rejects oversized metadata before browser decode',()=>{
 const bytes=new Uint8Array(MAX_JPEG_HEADER_BYTES);bytes.set([255,216,255,226,255,255],0);
 assert.throws(()=>jpegSourceInfo(bytes),/JPEG_(?:MARKER|HEADER|SEGMENT)/);
});
test('R65 image predecode uses parsed display dimensions before createImageBitmap',()=>{
 const source=readFileSync(new URL('../src/image-pdf.js',import.meta.url),'utf8');
 assert.match(source,/jpegSourceInfo\(new Uint8Array\(jpegHeader\)\)/);
 assert.match(source,/imageDecodeTarget\(rawSize\.width,rawSize\.height\)/);
 assert.match(source,/imageOrientation:'from-image'/);
 assert.match(source,/JPEG_EXIF_ORIENTATION_UNVERIFIED/);
});

// Exercise the unchanged R65 image conversion owner via a transparent shim;
// pdf-lib and DOM APIs are mocked because this environment has no browser.
function conversionShim({decodeIgnoresExif=false}={}){
 const moduleText=readFileSync(new URL('../src/image-pdf.js',import.meta.url),'utf8')
  .replace(/^import .+;$/gm,'').replace(/^export /gm,'');
 let requested=null,closed=0,dimensions=null;
 const fakePdf={create:async()=>({
  embedPng:async()=>({width:dimensions.width,height:dimensions.height}),
  addPage:()=>({drawImage:()=>{}}),save:async()=>Uint8Array.from([37,80,68,70,45,49])
 })};
 const fakeImage=async(_blob,options={})=>{
  requested=options;
  const w=options.resizeWidth||800,h=options.resizeHeight||400;
  return {width:decodeIgnoresExif?800:w,height:decodeIgnoresExif?400:h,
    close(){closed++}};
 };
 const dom={createElement:()=>({width:0,height:0,getContext:()=>({drawImage:()=>{}}),
  toBlob(cb){cb(new Blob(['fake-png'],{type:'image/png'}))}})};
 const factory=new Function('PDFDocument','verifyOtherHeader','cancelled',
  'readDocumentBuffer','jpegSourceInfo','MAX_JPEG_HEADER_BYTES',
  'createImageBitmap','document','Blob','waitForImageOperation','assertCompletePdfBytes',moduleText+'\nreturn {convertImage};');
 const api=factory(fakePdf,()=>{},()=>{},async(file)=>file.bytes.buffer,
  jpegSourceInfo,MAX_JPEG_HEADER_BYTES,fakeImage,dom,Blob,async(p)=>p,bytes=>bytes);
 async function convert(bytes){
  const file={bytes,slice:(_start,end)=>({arrayBuffer:async()=>bytes.slice(0,end).buffer})};
  dimensions={width:0,height:0};
  // PDF embedding returns dimensions supplied by the drawn bitmap.
  const old=fakePdf.create;
  fakePdf.create=async()=>({embedPng:async()=>dimensions,
    addPage:()=>({drawImage:()=>{}}),save:async()=>Uint8Array.from([37,80,68,70,45])});
  // Staging source invokes imagePdfBytes() with the final dimensions. Our
  // embedPng fake receives no size; read the Canvas output sizing instead.
  dom.createElement=()=>{const can={width:0,height:0,getContext:()=>({drawImage:()=>{}}),
    toBlob(cb){dimensions={width:can.width,height:can.height};cb(new Blob(['png'],{type:'image/png'}))}};return can;};
  try{return await api.convertImage(file,()=>{},undefined,'jpg')}
  finally{fakePdf.create=old}
 }
 return {convert,get requested(){return requested},get closed(){return closed}};
}

test('actual convertImage path bounds a large JPEG BEFORE calling createImageBitmap',async()=>{
 const shim=conversionShim();
 const result=await shim.convert(sample({width:60000,height:40000}));
 assert.equal(result.pages,1);
 assert.ok(shim.requested.resizeWidth*shim.requested.resizeHeight<=16_000_000);
 assert.ok(shim.requested.resizeWidth<60000&&shim.requested.resizeHeight<40000);
 assert.equal(shim.requested.imageOrientation,'from-image');
 assert.equal(shim.closed,1);
});
test('actual convertImage refuses an EXIF-orientation mismatch without PDF success',async()=>{
 const shim=conversionShim({decodeIgnoresExif:true});
 await assert.rejects(shim.convert(sample({orientation:6})),/JPEG_EXIF_ORIENTATION_UNVERIFIED/);
 assert.equal(shim.closed,1);
});

test('real generated JPEG markers and Exif orientation are parsed correctly',()=>{
 const base=new URL('./fixtures/',import.meta.url);
 const plain=jpegSourceInfo(readFileSync(new URL('jpeg-rgb-800x400.jpg',base)));
 assert.equal(plain.width,800);assert.equal(plain.height,400);
 assert.equal(plain.orientation,1);
 const rotated=jpegSourceInfo(readFileSync(new URL('jpeg-exif-rotate-6.jpg',base)));
 assert.deepEqual(rotated,{width:800,height:400,orientation:6,displayWidth:400,displayHeight:800});
});
