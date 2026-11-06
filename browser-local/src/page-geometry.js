/**
 * SVG viewport/page geometry, in 96dpi CSS pixels.
 * viewBox dimensions describe an internal drawing coordinate system, not
 * necessarily the physical CSS viewport. Conflating the two changes PDF
 * paper size whenever an HWP renderer emits millimetres/points on <svg>.
 */
const LENGTH=/^\s*((?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)\s*(px|pt|pc|mm|cm|in|q)?\s*$/i;
const PIXELS_PER_UNIT={px:1,pt:96/72,pc:16,mm:96/25.4,cm:96/2.54,in:96,q:96/101.6};
const MAX_PX=20000;
const MAX_VIEWBOX_COORD=1_000_000_000;

export function svgLengthToPixels(raw){
 if(raw==null || String(raw).trim()==='')return null;
 const match=LENGTH.exec(String(raw));
 if(!match)return null;
 const value=Number(match[1])*PIXELS_PER_UNIT[(match[2]||'px').toLowerCase()];
 return Number.isFinite(value)&&value>=1&&value<=MAX_PX?value:null;
}

export function svgViewBox(raw){
 if(raw==null||String(raw).trim()==='')return null;
 const tokens=String(raw).trim().split(/[\s,]+/);
 if(tokens.length!==4||tokens.some(x=>!x.trim()))throw Error('SVG viewBox 형식 오류');
 const values=tokens.map(Number);
 if(values.some(n=>!Number.isFinite(n))||values[2]<=0||values[3]<=0||
    Math.abs(values[0])>MAX_VIEWBOX_COORD||Math.abs(values[1])>MAX_VIEWBOX_COORD||
    values[2]>MAX_VIEWBOX_COORD||values[3]>MAX_VIEWBOX_COORD)throw Error('SVG viewBox 크기 오류');
 return {minX:values[0],minY:values[1],width:values[2],height:values[3]};
}

/**
 * Return the target PDF paper width/height in CSS pixels. The embedded SVG
 * string and its viewBox are kept intact so the browser/PDFKit performs its
 * own preserveAspectRatio mapping. The fallback is only for unitless SVG
 * pages that omitted both viewport dimensions and a viewBox.
 */
export function svgPageSize({width:rawWidth=null,height:rawHeight=null,viewBox:rawViewBox=null}={}){
 const viewBox=svgViewBox(rawViewBox);
 const hasWidth=rawWidth!==null && String(rawWidth).trim()!=='';
 const hasHeight=rawHeight!==null && String(rawHeight).trim()!=='';
 let width=hasWidth?svgLengthToPixels(rawWidth):null;
 let height=hasHeight?svgLengthToPixels(rawHeight):null;
 if(hasWidth&&width===null)throw Error('SVG 용지 너비의 단위 또는 값이 잘못되었습니다.');
 if(hasHeight&&height===null)throw Error('SVG 용지 높이의 단위 또는 값이 잘못되었습니다.');
 if(width===null){
  width=viewBox?(height!==null?height*viewBox.width/viewBox.height:viewBox.width):794;
 }
 if(height===null){
  height=viewBox?(hasWidth?width*viewBox.height/viewBox.width:viewBox.height):1123;
 }
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||
    width>MAX_PX||height>MAX_PX)throw Error('비정상적인 SVG 페이지 크기');
 return {width,height};
}
