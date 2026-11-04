# R32 벡터 PDF 엔진 기술 검토 및 도면 품질 개선

## 현재 구현과 한계
현재 rhwp WASM `renderPageSvg(i)` 결과는 SVG이며, `pdf-lib`는 SVG 전체를 PDF의 텍스트/벡터 객체로 직접 삽입하는 API를 제공하지 않는다. 현재 파이프라인은 SVG→Canvas→PNG→PDF이다. R32에서 이 구조를 벡터 PDF라고 표시하지 않는다.

## R32 도면 품질 구현
SVG에서 `path,line,polyline,polygon,rect,circle,ellipse`와 `text,tspan` 요소 개수를 계산한다. 도형 180개 이상이며 텍스트의 두 배 이상인 도면 페이지는 목표 360dpi 및 페이지당 12MP 제한, 일반 페이지는 기존 300dpi 및 9MP 제한을 적용한다. 실제 출력은 여전히 이미지 PDF이므로 글자 선택/검색 불가. 비정상 크기·외부 리소스는 기존 차단 유지.

## 벡터 PDF로 전환하기 위한 필수 기술 게이트
1. 한국어 폰트 파일 라이선스·브라우저 사용권·폰트 서브셋 내장 가능 여부 확인.
2. SVG의 `text`·`tspan`·transform·clipPath·stroke·fill·image·table 경계 등 PDF 명령으로의 변환 라이브러리 PoC 검증. 단순 PDF 투명 텍스트 덮어쓰기는 실제 문서와 위치 불일치·중복 복사·접근성 문제를 유발하므로 금지.
3. PDF ToUnicode CMap / 문자 검색·복사 검증. HWP 본문과 PDF 추출 텍스트의 Unicode 정규화·페이지별 대응 검증.
4. 사진·지도·치수·표·글꼴 누락·줄바꿈 비교; 특히 사용자 제공 환경영향평가 원본 HWP의 동일 페이지 PC/Web 시각 차이 및 검색 정확도 확인.
5. 벡터 렌더링이 실패하면 현재의 고해상도 raster PDF로 안전하게 fallback하고 사용자에게 renderMode를 명시.
6. 문서 내용은 외부 서버로 전송하지 않으며 SVG 외부 URL 및 스크립트 차단 정책 유지.

## Cloudflare 자동 배포
`main`의 `npm run build` 및 `npx wrangler deploy` 설정은 준비돼 있으나 Cloudflare Builds의 GitHub App이 저장소 `Peter-msk/Sunrise-PDF-Pro-web`에 접근하지 못함(Cloudflare API 8000012). 계정 소유자가 GitHub Settings > Applications > Installed GitHub Apps에서 Cloudflare App의 repository access를 승인해야 한다. 승인을 대신 수행하거나 권한 검사를 우회하지 않는다.
