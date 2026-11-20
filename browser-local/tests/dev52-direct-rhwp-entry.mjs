import {HwpDocument} from '@rhwp/core';
import {prepareWasm} from '../src/converter.js';
import {readDirectPage,inspectDirectPage} from '../src/direct-pdf.mjs';
export async function probeDirectRhwp(input){
 await prepareWasm();const doc=new HwpDocument(Uint8Array.from(input));
 try{
  const count=doc.pageCount(),output=[];
  for(let i=0;i<count;i++){
   const t=readDirectPage(doc,i),r=inspectDirectPage(t);
   const candidate=inspectDirectPage(t,{allowText:true,allowMedia:true,allowLayers:true,allowSpecial:true});
   output.push({candidateMedia:candidate.mediaCount,candidateGlyphs:candidate.glyphCount,candidateTables:candidate.tableCount,candidateCells:candidate.cellCount,candidateMergedCells:candidate.mergedCells,candidateSpecialItems:candidate.specialItems,candidateBlockers:candidate.blockers,page:i+1,schema:t.schemaMinorVersion,width:r.width,height:r.height,operations:r.operations,operationCounts:r.operationCounts,blockers:r.blockers,clips:r.clips,svgReferences:r.svgReferences,textRuns:r.textRuns});
  }
  return output;
 }finally{doc.free();}
}
