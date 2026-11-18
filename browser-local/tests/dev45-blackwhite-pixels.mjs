/** Verify the pinned RHWP v0.8.7 zero-brightness/contrast BMP->PNG bake. */
export function verifyBakedBlackwhite(source, actual) {
 const {width,height,data}=source;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    width*height*4!==data.length||actual.width!==width||actual.height!==height||actual.data.length!==data.length)
  throw Error('BLACKWHITE_DIMENSIONS_MISMATCH');
 let black=0,white=0,changed=0,mismatched=0,alphaMismatch=0;
 for(let i=0;i<data.length;i+=4){
  const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
  const expected=Math.floor((299*r+587*g+114*b)/1000)<=128?0:255;
  if(actual.data[i+3]!==a)alphaMismatch++;
  if(a===0)continue; // Canvas cannot recover invisible straight RGB.
  if(a!==255)throw Error('BLACKWHITE_FIXTURE_NOT_OPAQUE');
  if(expected===0)black++;else white++;
  if(r!==expected||g!==expected||b!==expected)changed++;
  if(actual.data[i]!==expected||actual.data[i+1]!==expected||actual.data[i+2]!==expected)mismatched++;
 }
 return {pixels:width*height,black,white,changed,mismatched,alphaMismatch};
}
