# Sunrise PDF PRO(Web) — 경쟁 HWP/HWPX PDF 변환 엔진 비교·실기검증·DEV27 오류 복구

- 작성 기준: 2026-11-13 KST.
- 저장소: `Peter-msk/Sunrise-PDF-Pro-web`
- 개발 브랜치: `dev/dev27-p0-baseline-audit-20261113`
- 작업 권한 범위: 공개 서비스 확인, 공개 샘플 한 건의 실제 변환, DEV27 개발 코드 수정, 집중 QA.
- 운영 환경: **Cloudflare production 미배포, GitHub main 미병합, D1 데이터/스키마 쓰기 없음**.
- 안전성: 사용자 HWP/HWPX 원본·글꼴·문서 내용은 외부 서비스에 업로드하지 않음. 공개 `edwardkim/rhwp@v0.8.7` 샘플만 사용. 타사 소스 코드를 복제하지 않고 공개 UI 및 산출물의 관찰 가능한 동작만 확인.

## 1. 실제 운영 사이트 및 확인 범위

| 사이트 | 공개 문서상 처리 방식 | 실기검증 판정 | 공개 HTML/UI 관찰 |
|---|---|---|---|
| NextOffice `https://www.nextoffice.kr/en/hwp-to-pdf` | 브라우저 내, 검색 가능한 텍스트 PDF | **PASS**: 공개 HWP→1페이지 PDF | HTTP 200; Next.js 자산; `input[type=file]` accept `.hwp,.hwpx,.hml`, multiple; Convert to PDF 버튼. 파일 선택 시 PDF 다운로드 확인 |
| Seoulstart `https://seoulstart.com/tools/hwpx-to-pdf` | 브라우저 처리, rhwp 명시 | **검증 불가**: Vercel 429 보안 확인 | 파일 입력 DOM 없음; 보안 차단 우회 금지 |
| WorkCal `https://workcal.kr/en/tools/hwp-to-pdf/` | 브라우저 처리 주장 | **검증 불가**: 현재 해당 경로 HTTP 404 | 설명 페이지/검색 결과와 실제 실행 주소 불일치 |
| Allinpdf `https://allinpdf.com/kr/hwp-to-pdf` | 파일 업로드 후 서버 변환, 일정 시간 후 결과 삭제 명시 | 실변환 미실시 | 서버 구조는 서비스 안내 내용으로 확인, 비공개 서버 엔진 종류는 미확정 |
| CloudConvert `https://cloudconvert.com/hwp-to-pdf` | HWP→PDF 온라인 클라우드 | 실변환 미실시 | 내부 변환 엔진 공개되지 않음 |
| Safe Toolbox `https://tools.deios.kr/en/hwp/convert/` | 브라우저 변환, 설치 글꼴 선택 옵션 | 실변환 미실시 | 우리 PC 글꼴 기능과 원리가 비슷하나 내부 구현 미확정 |

브라우저 실기검증 경로: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43425313014

NextOffice 입력: 공개 예제 `re-01-hangul-only-hancom.hwp`, **8,704 B**, SHA-256 접두 `61538931d2e2cf38`. 출력: `genuine.pdf`, **6,550 B**, 유효한 `%PDF-` 및 1쪽 PDF 파싱 성공. 위험한 문서 바이트 POST/PUT/PATCH 요청은 테스트 라우팅에서 차단되며 blockedUploads=0. 브라우저 전환 방식에 대한 독립 검증이지 사이트 서버에서 어떤 라이브러리를 설치했는지 증명하는 시험은 아님.

## 2. 동일 입력 파일의 PDF 구조 비교 — 실기검증

동일한 공개 HWP를 GitHub Actions Linux Chromium에서 NextOffice와 개발용 Sunrise 브라우저 앱 각각으로 변환한 뒤 PDF.js, pdf-lib로 수치만 비교했다.

| 실제 PDF 검사 항목 | NextOffice | Sunrise DEV27 |
|---|---:|---:|
| 변환·파싱 PASS | PASS | PASS |
| 입력 HWP | 동일 8,704 B | 동일 8,704 B |
| 출력 PDF 크기 | 6,550 B | 8,383 B |
| PDF 페이지 | 1 | 1 |
| 추출 텍스트 문자 수 | 100 | 100 |
| PDF 텍스트 항목 | 3 | 3 |
| 이미지 paint 연산 | 0 | 0 |
| PDF Producer | `pdf-lib` | `pdf-lib` |
| Creator | `NextOffice` | `PDFKit` |

검증: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43426461611

- 두 PDF에서 동일한 100자 텍스트 추출 규모와 이미지가 없는 구조가 확인됨.
- PDF 메타데이터의 `pdf-lib`만으로 NextOffice 문서 렌더링 구현이 Sunrise와 같다고 단정할 수 없음.
- 글꼴 매칭, 모든 도형·표 배치, 픽셀 시각동일성, 한컴 출력과의 절대 정합성은 이 수치로 증명되지 않음.
- 복잡한 필터가 있는 원본 25개 사용자 문서는 없으므로 경쟁 사이트가 8건 모두 변환할 수 있다고 주장하지 않음.

## 3. 기술 판단 — 무엇이 다른가

- Sunrise 현재 HWP 계열: `@rhwp/core 0.8.7` WASM에서 문서 파싱·SVG 출력 → 안전한 필터 정규화 → `svg-to-pdfkit` + PDFKit 전문 벡터 경로 → PDF 출력 검증. 지원하지 않는 SVG 필터 효과는 문서 변형 없이 오류 처리하며, 사용자 승인 `hybrid-filter`에서만 해당 **페이지 전체**를 이미지화.
- NextOffice는 Next.js 프런트 UI와 PDF Producer `pdf-lib`의 존재까지 확인. 상세 SVG 렌더링 방식/서버 내부 엔진/원본 동일성은 확인 불가.
- Allinpdf는 실제 변환을 서버에 위탁하는 구조가 명시되어 있으므로 문서 바이트를 외부로 보내지 않는 현재 Sunrise 방침과 보안·프라이버시 모델이 다름.
- 상위 오픈소스 `rhwp` 공식 README의 Canvas2D/CanvasKit, native Skia, SVG compatibility PDF, direct PDF는 별개의 렌더 백엔드로 소개됨. 단, 브라우저용 `@rhwp/core`의 어떤 버전에서 어떤 PDF 엔진이 즉시 사용 가능한지는 확인·계약 시험 없이 단정/교체하지 않음.
- 단순 문서의 성공률을 보고 전체 WASM 또는 SVG 변환 구조를 갈아엎는 것은 근거 부족. 사용자 실패 8건은 `SVG_FILTER_EFFECT_UNSUPPORTED`(image_filter)로 관측되므로 먼저 PDFKit이 표현하지 못하는 SVG 효과의 **독립 출력 경로**에 대응한다.

참고 문서:
- https://github.com/edwardkim/rhwp
- https://www.npmjs.com/package/@rhwp/core
- https://www.nextoffice.kr/en/hwp-to-pdf
- https://allinpdf.com/kr/hwp-to-pdf
- https://seoulstart.com/tools/hwpx-to-pdf
- https://help.hancom.com/hoffice110/ko-KR/Hwp/file/to_pdf.htm

## 4. 이번 비교 결과를 코드에 반영한 개선

**개발 브랜치에만 반영, 운영 배포 전.**

1. 앞선 DEV27 `svg-safe-grayscale.mjs`에서 안전한 회색조+무효과 CSS 필터 체인을 벡터로 처리하도록 확장. 흐림·그림자·부분 투명도 변경은 그대로 fail-closed.
2. 앞선 DEV27 `planBulkRecovery`를 활용하여 다수 실패 파일만 명시적으로 골라 혼합/이미지 PDF로 복구. 기본 `professional`은 변경하지 않음.
3. **경쟁 변환 구조 조사 후 `browser-local/src/main.js`에 새로운 SVG 오류 복구 진입점 추가:** `SVG_FILTER_EFFECT_UNSUPPORTED` 실패 파일에 `브라우저 PDF 인쇄 준비` 버튼 제공. 클릭하면 `show(item)`으로 실패 파일을 선택하고 기존 `renderNativePrintPages`→`prepareNativePrint`를 호출한다.
4. 인쇄 준비 완료 시 해당 파일 행에 `브라우저 PDF로 저장` 버튼 제공. 두 번째 사용자의 직접 클릭만 `printJob.print()`을 호출. 파일은 브라우저/OS의 PDF 저장창으로만 저장되며, 앱이 최종 PDF를 받거나 성공이라고 기록하지 않음.
5. 기존 `native-print.js`는 안전한 SVG 파서와 샌드박스 iframe의 동일 원본 인쇄 경계이며, PDFKit의 SVG 지원 범위와 독립. 일부 필터는 브라우저 인쇄 과정에서 래스터화될 수 있고 PDF 글꼴·페이지 정합성은 원본과 확인해야 함. 혼합 용지나 120쪽 초과는 기존 제한 유지.
6. 타사 NextOffice의 비공개 스크립트를 가져오거나 실행 코드를 재사용하지 않음. 기존 함수·최소한의 UI 변경만 적용.

## 5. 새 대체 렌더러 유효성 및 기존 계약 집중 QA

- https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43426989366
- Node 24 / 실제 Chromium printToPDF: 안전한 SVG `feGaussianBlur`가 포함된 합성 그림과 별도 SVG 텍스트를 PDF로 인쇄하여 출력 PDF 구조·텍스트 추출 성공.
- `SVG_FILTER_EFFECT_UNSUPPORTED` 파일의 명시적 인쇄 준비→별도 저장 버튼 노출, 기존 단일·다중 복구 계획, 비지원/오염 SVG 거부 계약 포함: **20/20 PASS**.
- 참고: 첫 QA에서 테스트용 inline SVG가 block 요소가 아니어서 불필요한 2쪽으로 출력됨. 실제 `native-print.js`의 `display:block`과 같은 테스트 CSS로 수정 후 **20 PASS**. 정정 전 시험 실패는 제품의 실제 인쇄 경로 재현이 아닌 합성 HTML 레이아웃 오류였다.

## 6. 남은 수락 게이트

- 브라우저 native-print가 복잡한 합성 SVG에 대한 대안임은 검증됐지만 사용자 오류 HWP/HWPX의 필터 원형이 없어 그 8건의 성공·원본 정합성을 확정하지 않음.
- 다음 실문서 QA에서는 사용자 개인정보 제거본(최소 1~2개), 가능하면 한컴 PDF 기준을 이용해 기존 전문 PDF vs 혼합 PDF vs 브라우저 인쇄 결과의 **페이지·텍스트 추출·표·그림·폰트·파일 크기·페이지별 렌더링** 비교.
- Native print는 브라우저 인쇄창 경로이며 자동 다운로드 PDF가 아니다. 인쇄 실패 또는 미저장 상태를 자동 성공으로 표시하지 않음.
- 모든 프로덕션 병합, Cloudflare Worker 배포, D1 쓰기는 별도 승인까지 중지.

**상태: 공개 샘플 양측 실제 PDF 검증 PASS / native SVG alternative QA 20/20 PASS / real user 25-document remediation NOT YET PROVEN / NO PRODUCTION DEPLOY.**
