/** Independent oracle for RHWP 0.9.0 baked RealPic brightness/contrast.
 * Upstream: tag v0.9.0 src/renderer/image_resolver/picture_adjustments.rs,
 * adjusted_channel. Encoded RGB, not SVG linearRGB. Test-only.
 */
export function expectedAdjustedChannel(value,brightness,contrast){
 if(!Number.isInteger(value)||value<0||value>255||
    !Number.isInteger(brightness)||Math.abs(brightness)>100||
    !Number.isInteger(contrast)||Math.abs(contrast)>100)throw Error('TONE_ARGUMENT_INVALID');
 const b=brightness,c=contrast;
 let n,d;
 if(Math.abs(c)===100){n=(c===-100?1:value>128?255:0)*100+b*255;d=100;}
 else if(c>=0){n=20000*value+255*(b*(200-c)-100*c);d=200*(100-c);}
 else{n=200*(100+c)*value+255*(b*(200+c)-100*c);d=20000;}
 return Math.min(255,Math.max(0,Math.trunc(n/d)));
}
export function verifyBakedTone(source,actual,brightness,contrast){
 const {width,height,data}=source;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    width*height*4!==data.length||actual.width!==width||actual.height!==height||
    actual.data.length!==data.length)throw Error('TONE_DIMENSIONS_MISMATCH');
 let changed=0,mismatched=0,alphaMismatch=0,visible=0;
 for(let i=0;i<data.length;i+=4){
  const alpha=data[i+3];
  if(actual.data[i+3]!==alpha)alphaMismatch++;
  if(alpha===0)continue;
  if(alpha!==255)throw Error('TONE_FIXTURE_NOT_OPAQUE');
  visible++;
  const expected=[0,1,2].map(k=>expectedAdjustedChannel(data[i+k],brightness,contrast));
  if(expected.some((v,k)=>v!==data[i+k]))changed++;
  if(expected.some((v,k)=>v!==actual.data[i+k]))mismatched++;
 }
 return {pixels:width*height,visible,changed,mismatched,alphaMismatch};
}
