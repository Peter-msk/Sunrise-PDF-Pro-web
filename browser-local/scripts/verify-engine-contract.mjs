/**
 * Sunrise PDF PRO(web) R66-DEV8: enforce the existing browser-local engine.
 * No document bytes are read, no network is contacted, and no files are written.
 * This guard is an architecture regression check, NOT a PDF quality test.
 */
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

function contains(body,pattern){return pattern.test(body);}
export function inspectEngineContract(root){
  const issues=[];
  const requireFile=rel=>{
    const path=resolve(root,rel);
    if(!existsSync(path)){issues.push('MISSING_SOURCE:'+rel);return '';}
    return readFileSync(path,'utf8');
  };
  let pkg=null;
  try{pkg=JSON.parse(requireFile('browser-local/package.json'));}
  catch{issues.push('PACKAGE_JSON_INVALID');}
  if(pkg){
    for(const [name,version] of Object.entries({
      '@rhwp/core':'0.8.7','pdfkit':'0.20.2','svg-to-pdfkit':'0.1.8'
    })) if(pkg.dependencies?.[name]!==version)
      issues.push('BROWSER_ENGINE_DEPENDENCY_DRIFT:'+name);
  }
  const converter=requireFile('browser-local/src/converter.js');
  const writer=requireFile('browser-local/src/svg-professional.js');
  const backend=requireFile('browser-local/src/pdfkit-backend.js');
  if(!contains(converter,/from\s*['"]@rhwp\/core['"]/)) issues.push('WASM_PARSER_NOT_USED');
  if(!contains(converter,/tryProfessionalDocument\s*\(/)) issues.push('PROFESSIONAL_ENGINE_NOT_CALLED');
  if(!contains(converter,/allowRasterFallback\s*:\s*false/)) issues.push('OBJECT_PRESERVING_POLICY_MISSING');
  if(!contains(writer,/renderPageSvgWithProfile\s*\(\s*i\s*,\s*['"]print['"]\s*\)/))
    issues.push('PRINT_SVG_PIPELINE_MISSING');
  if(!contains(writer,/SVGtoPDF\s*\(/)) issues.push('VECTOR_PDF_OUTPUT_MISSING');
  if(!contains(backend,/import\s*\(\s*['"]pdfkit['"]\s*\)/) ||
     !contains(backend,/toBlob\s*\(/)) issues.push('PDFKIT_BACKEND_MISSING');
  for(const rel of ['native_hancom','browser-local/native_hancom'])
    if(existsSync(resolve(root,rel))) issues.push('UNAPPROVED_HANCOM_RUNTIME:'+rel);
  for(const [rel,body] of [
    ['browser-local/src/converter.js',converter],
    ['browser-local/src/svg-professional.js',writer],
    ['browser-local/src/pdfkit-backend.js',backend]
  ]){
    if(/\b(?:win32com|ActiveXObject|HWPFrame\.HwpObject)\b/.test(body))
      issues.push('NATIVE_COM_DEPENDENCY:'+rel);
  }
  // DEV35: A native Hancom/COM or subprocess shim may be introduced outside
  // converter.js (e.g. in a new format dispatcher). Inspect all active browser
  // modules, not only the original three files. The web bundle may fetch its
  // own pinned WASM and OFL fonts, but must never execute local applications.
  // Mobile browsers commonly lack Local Font Access. A missing self-hosted
  // fallback face must stop a build, not fail only at the user's document.
  for(const font of [
   'NanumMyeongjo-Regular.ttf','NanumMyeongjo-Bold.ttf',
   'NanumGothic-Regular.ttf','NanumGothic-Bold.ttf',
   'SunriseSymbols.otf','SunriseMarks.ttf'
  ]){
   if(!existsSync(resolve(root,'browser-local/public/fonts',font)))
    issues.push('MISSING_MOBILE_BUNDLED_FONT:'+font);
  }
  const runtime=resolve(root,'browser-local/src');
  let browserModules=0;
  if(existsSync(runtime)){
   const dirs=[runtime];
   while(dirs.length){
    const dir=dirs.pop();
    for(const entry of readdirSync(dir,{withFileTypes:true})){
     const full=resolve(dir,entry.name);
     if(entry.isDirectory()){dirs.push(full);continue;}
     if(!entry.isFile()||!/\.m?js$/i.test(entry.name))continue;
     browserModules++;
     const source=readFileSync(full,'utf8');
     const rel=full.slice(root.length+1).replaceAll('\\','/');
     if(/\b(?:win32com(?:\.client)?|comtypes\.client|HWPFrame\.HwpObject|new\s+ActiveXObject\s*\(|(?:win32|node):?COMObject\s*\()/i.test(source))
      issues.push('BROWSER_NATIVE_HANCOM_DEPENDENCY:'+rel);
     if(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](?:node:)?child_process['"]/i.test(source))
      issues.push('BROWSER_CHILD_PROCESS_DEPENDENCY:'+rel);
    }
   }
  }
  return {ok:issues.length===0,issues,engine:'browser-wasm-svg-pdfkit',
   filesInspected:4+browserModules};
}

const invoked=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
  const result=inspectEngineContract(root);
  if(result.ok)console.log('R66_ENGINE_CONTRACT_PASS: browser-only WASM + SVG + PDFKit');
  else{console.error('R66_ENGINE_CONTRACT_FAIL: '+result.issues.join(', '));process.exitCode=1;}
}
