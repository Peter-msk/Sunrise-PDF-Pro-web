import {loadPdfFonts,familyKey} from './pdf-fonts.js';

// OFL-licensed substitute faces. Their use is reported to the caller; they do
// not claim to reproduce the original Hancom font's metrics or appearance.
const FONT_FILES=[
 ['NanumMyeongjo-Regular.ttf','serif'],['NanumMyeongjo-Bold.ttf','serif'],
 ['NanumGothic-Regular.ttf','sans'],['NanumGothic-Bold.ttf','sans']
];
const FAMILY_ALIASES={
 serif:['함초롬바탕','HCR Batang','HCR Batang Ext','HCR Batang ExtB','함초롬바탕 확장','함초롬바탕 확장B','바탕','Batang','Nanum Myeongjo','NanumMyeongjo','Noto Serif KR','Noto Serif CJK KR','AppleMyungjo','HY명조','휴먼명조','신명조','한컴바탕','HCR Batang ExtB'],
 sans:['함초롬돋움','HCR Dotum','돋움','Dotum','맑은 고딕','Malgun Gothic','Nanum Gothic','NanumGothic','Noto Sans KR','Noto Sans CJK KR','굴림','굴림체','Gulim','GulimChe','HY굴림체','Apple SD Gothic Neo','Pretendard','Noto Sans KR ExtraLight','Noto Sans Mono','D2Coding','한컴돋움','함초롬돋움체']
};
let cached=null;
export async function loadBundledFonts(parser,signal){
 if(signal?.aborted)throw new DOMException('PDF 변환이 취소되었습니다.','AbortError');
 if(cached)return cached;
 const files=[];
 for(const [name] of FONT_FILES){
  const response=await fetch(new URL('fonts/'+name,document.baseURI),{signal,credentials:'same-origin'});
  if(!response.ok)throw Error('기본 한글 글꼴을 불러오지 못했습니다: '+name);
  const bytes=await response.arrayBuffer();
  if(!bytes.byteLength)throw Error('기본 한글 글꼴 파일이 비어 있습니다: '+name);
  files.push(new File([bytes],name,{type:'font/ttf'}));
 }
 const registry=await loadPdfFonts(files,parser,signal);
 registry.faces.forEach((face,index)=>{
  const category=FONT_FILES[index][1];
  face.name='BundledFont'+(index+1);
  face.isFallback=true;
  face.cssAliases=FAMILY_ALIASES[category];
  face.aliases=[...new Set([...face.aliases,...face.cssAliases.map(familyKey)])];
  face.genericFamily=category;
 });
 cached=registry;
 return registry;
}
