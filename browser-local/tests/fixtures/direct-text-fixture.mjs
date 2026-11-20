export function directTextOp(text='한글',family='Example'){
 const style={fontFamily:family,fontSize:20,color:'#112233',bold:false,italic:false,ratio:1,
 underline:'none',strikethrough:false,outlineType:0,shadowType:0,emboss:false,engrave:false,
 superscript:false,subscript:false,emphasisDot:0,shadeColor:'#ffffff'};
 let utf8=0;const enc=new TextEncoder();
 const range=(start,end)=>({start,end});
 const clusters=Array.from(text,(ch,i)=>{const end=utf8+enc.encode(ch).length;
 const c={sourceRangeUtf8:range(utf8,end),textRangeUtf8:range(utf8,end),textRangeUtf16:range(i,i+1),
 projection:'verbatim',origin:{x:i*20,y:0},advance:{dx:20,dy:0}};utf8=end;return c;});
 return {type:'textRun',bbox:{x:10,y:20,width:text.length*20,height:24},text,baseline:16,rotation:0,
 isVertical:false,orientation:'horizontal',projectionKind:'verbatim',clusterBasis:'legacyPosition',style,paintStyle:{...style},
 placement:{runToPage:{a:1,b:0,c:0,d:1,e:10,f:36},baselineY:0},
 source:{id:1,utf8Range:range(0,utf8),utf16Range:range(0,text.length)},
 positions:Array.from({length:text.length+1},(_,i)=>i*20),clusters,charOverlap:null,fieldMarker:{kind:'none'}};
}
