// wasm-bindgen generates a default URL even when the caller always supplies
// verified bytes. Prevent Vite from emitting that unused oversized raw asset.
// Do not edit installed files or change any explicit-module initialization.
export function explicitRhwpModulePlugin(){
 return {
  name:'sunrise-rhwp-explicit-module',
  enforce:'pre',
  apply:'build',
  transform(code,id){
   if(!id.replaceAll('\\','/').includes('/node_modules/@rhwp/core/'))return null;
   const pattern=/new\s+URL\(\s*(['"])rhwp_bg\.wasm\1\s*,\s*import\.meta\.url\s*\)/g;
   if(!pattern.test(code))return null;
   pattern.lastIndex=0;
   return {code:code.replace(pattern,"(()=>{throw new Error('RHWP_EXPLICIT_WASM_REQUIRED')})()"),map:null};
  }
 };
}
