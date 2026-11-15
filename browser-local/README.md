# Sunrise PDF PRO(Web) — 브라우저 자체 HWP/HWPX → PDF 변환

## 필수 제품 계약

**한컴오피스/한글/한COM/Windows COM은 PDF 변환의 설치·실행 전제조건이 아니다.** Android·iOS·Windows·macOS 등의 지원되는 브라우저 안에서, 사이트가 제공하는 RHWP WASM과 JavaScript PDF 출력 엔진으로 문서 처리를 수행한다. 브라우저 성능·메모리·지원 API의 차이 때문에 모든 기기에서 모든 원본이 성공한다고 보장하는 것은 아니다.

실제 HWP/HWPX 변환 경로:
`@rhwp/core@0.8.7` WebAssembly → `HwpDocument` 페이지 파싱/인쇄용 SVG 생성 → 안전 검사·필터 정규화 → `svg-to-pdfkit@0.1.8` + `pdfkit@0.20.2` PDF 생성. 사용자가 명시적으로 선택하는 혼합 출력은 미지원 SVG 필터가 있는 **해당 쪽만** 이미지화하고 나머지 쪽 벡터·텍스트 보존을 우선한다. 호환 이미지 출력은 사용자 선택 시에만 실행한다. PDF.js와 pdf-lib는 출력 검토·후처리 및 PDF 완전성 검증에 사용한다.

원본 HWP/HWPX·설치 글꼴 바이트·선택한 TTF/OTF 글꼴은 외부 변환 서버로 업로드하지 않는다. 애플리케이션 JS/WASM과 기본 글꼴은 사이트의 정적 자산에서 불러오며, 집계형 진단 이벤트가 있더라도 원본 바이트/글꼴을 포함하지 않아야 한다.

## 글꼴 사용 순서 (PC/모바일 모두)

1. **사용자가 직접 선택한 원본 TTF/OTF**: 해당 기기에서 서체를 보유한 경우 가장 정확한 경로.
2. **해당 기기에 실제 설치된 글꼴**: Local Font Access API가 제공되는 안전한 브라우저 환경에서, 사용자가 브라우저 권한을 허용했을 때만 요청한다. 일치하는 패밀리·굵기·기울임·글리프를 확인해 선택한다. 글꼴 확인은 OS 설치 한글 프로그램을 실행하는 행위가 아니다.
3. **사이트 내장 OFL 글꼴**: 모바일에서 설치 글꼴 API가 없거나 권한을 거부한 경우에도 사용할 수 있다. DEV37 개발 후보는 **KERIS 학교안심 바른바탕 R/B·바른돋움 R/B 4종**, **Noto Sans Symbols 2** 및 Unicode 문장부호 보완용 **Noto Sans / Noto Sans Yi**의 **총 7개 글꼴 파일**을 사용한다. 11월 15일 지적된 8개 문자에 대한 새 2개 TTF의 실제 cmap 지원 여부는 확인했지만, 실제 변환 PDF의 임베딩과 원본 일치 여부는 아직 미검증이다. **원본 서체와 폭·행간·줄바꿈·표 위치가 달라질 수 있다.** 파일이 만들어졌다고 원본과 동일하다고 단정하지 않는다.

모바일에서는 PC에 설치된 서체를 원격으로 직접 읽을 수 없다. 반드시 원본 서체가 필요하면 라이선스를 준수해 모바일 기기에 보관한 TTF/OTF를 직접 선택해야 한다. 폰트 파일 접근의 실패는 HWP/HWPX 파싱 또는 PDF 엔진을 차단하지 않는다.

## 알려진 한계

- HWP/HWPX 당 현재 **최대 120쪽** (메모리/안전 운영 정책). 파일 바이트 크기에는 단순 20MiB 상한을 두지 않지만 실제 기기 RAM에 따라 실패할 수 있다.
- 비영 SVG 흐림·그림자 등의 복합 필터는 기존 PDFKit 벡터 경로에서 보장되지 않는다. 의도적 전문 출력 실패 또는 사용자가 선택한 혼합/호환 출력으로 취급한다.
- 벡터 PDF의 실제 글꼴 임베딩, PDF 검색·복사, 한국어 줄바꿈, 표·도형 배치는 원본과 별도로 검증한다. 이미지화된 쪽은 검색·복사가 불가하다.
- XLS/XLSX의 원본 복잡한 서식·차트는 전부 재현되지 않는다.

## 로컬 개발 및 회귀

```bash
cd browser-local
npm ci
npm run check:source
npm run check:engine
npm run test:local
npm run build
npm run verify:dist
npm run qa:review -- "/path/to/Sunrise_PDF_PRO_Web_QA_*.json"
```

`check:engine`은 active browser module 전체에 한컴 COM·OS 자식 프로세스 호출이 추가되지 않았는지 차단한다. `dev35-browser-only-hancom-free.mjs`는 모바일의 Local Font Access 부재, 권한 거부, 정확한 글꼴 우선 사용, 웹 자체 엔진의 존재를 검사한다. 이 검사들은 프로그램의 **실기 25개 문서 수락시험을 대체하지 않는다.**

신규 엔진 후보 krilla-svg는 별도 실험 대상이며, 검증 없는 변경과 운영 자동 배포를 금지한다. GitHub Actions 중지 상태를 유지한다.

## DEV36 — 검증된 안심글꼴 공급
- 소스: 사용자가 제공한 안심글꼴 ZIP에 포함된 4개 KERIS TTF와 SHA-256이 일치하는 공개 버전, 추가로 Google OFL 특수기호 보완 TTF.
- `npm run test` / `npm run build` 직전에 `scripts/install-safe-fonts.mjs`가 **고정 커밋 URL의 자산을 빌드 환경에서만** 읽는다. 모든 다운로드 파일은 실제 길이, TTF 서명, 사용자 ZIP의 SHA-256 또는 Noto Git blob SHA-1로 확인하며, 불일치 시 빌드를 중단한다.
- 브라우저는 완성된 Cloudflare 동일 출처 `/local/fonts/` 자산만 사용하며 Google/GitHub 또는 외부 서버에 사용자 문서/서체를 보내지 않는다.
- DEV36 브랜치에서는 이전 6개 Nanum/Sunrise 폰트 **바이너리 파일을 제거**했다. 새 글꼴이 존재하지 않으면 `check:engine`과 `verify:dist`가 실패한다.
- 저작권 및 출처 고지: `public/fonts/OFL_NOTICES.md`, 라이선스 전문: `public/fonts/SIL-OFL-1.1.txt`.
- **글꼴 대체는 원본 텍스트의 완전한 시각적 동등성을 보장하지 않는다.** 고객 원본 25개가 없으면 실제 PDF 124쪽과 1:1 비교할 수 없다.

제3자 라이선스·귀속 표기는 프로젝트 루트의 별도 라이선스/NOTICE도 확인한다.
