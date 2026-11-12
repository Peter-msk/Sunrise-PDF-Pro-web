# Sunrise PDF PRO(web) — DEV26 복잡한 표·도면 SVG 필터 벡터 보존율 및 PDF 품질검증

**작업일:** 2026-11-12 KST  
**개발 소스:** `dev/dev26-final-integrated-source-20261112`  
**배포 정책:** 운영 Cloudflare Worker 배포·D1 쓰기·`main` 병합 금지 및 미실시

## 1. 문제 정의와 수치의 의미

기존 DEV26 `tryProfessionalDocument` 결과에는 `vectorPages`, `rasterPages`,
`fallbackPages=[{page,reason}]`가 존재한다. 그러나 **이 기록은 엔진이 선택한
출력 방식**에 관한 정보이며 PDF 내부 그리기 명령이 실제 존재하는지를
확인한 검사는 아니었다.

이번에는 두 독립 검증을 함께 적용한다.

- **페이지 기준 벡터 보존율 = vectorPages ÷ 전체 pages × 100**.
  예: 4쪽 중 3쪽이 벡터이면 75%. 이는 전체 객체 수·도형 면적·문자 수 중
  벡터 비중을 뜻하지 않는다. 벡터 페이지에도 원본 사진은 이미지로 남을 수 있다.
- **완성된 PDF 구조 검사:** PDF.js `getOperatorList()`를 실제 PDF에 적용하여
  페이지별 벡터 경로, 텍스트 그리기, 이미지 그리기 명령 수를 확인하고,
  `getTextContent()`로 **실제로 추출 가능한 문자 수**를 별도 계수한다.
  원문 텍스트 자체는 결과로 저장하거나 텔레메트리 전송하지 않는다.
- 이미지화 이유와 페이지 번호는 기존 `fallbackPages`를 정밀 검증한 뒤 표시.
  이미지화됐다고 기록된 페이지에 실제 이미지 그리기 명령이 없다면
  `RASTER_FALLBACK_IMAGE_MISSING` 오류로 구조 검사를 불합격 처리.
- 벡터 페이지에 벡터 경로 및 텍스트 명령이 모두 없는 경우는
  `VECTOR_DRAWING_EVIDENCE_ABSENT` **검토 경고**만 표시:
  원래 공백 페이지나 사진만 존재하는 정상 문서도 있기 때문이다.
- 글자 그리기 명령이 있으나 추출 가능한 글자가 0개인 경우
  `TEXT_PAINT_NOT_EXTRACTABLE` 경고. 원문/한컴 조판의 시각적 동일성을
  이 검사의 PASS만으로 선언하지 않는다.

## 2. 실제 개발 변경

| 파일 | 구현 |
|---|---|
| `browser-local/src/pdf-vector-quality.mjs` (신규) | `summarizeVectorPreservation()`: 페이지 통계·번호·이유·모드의 일관성 검증. `inspectPdfVectorQuality()`: 완성 PDF를 브라우저 안에서 실제 재파싱, 페이지 크기/그리기 명령/이미지/추출 텍스트 점검; 96MiB 기본 파일 제한, 120쪽 및 페이지당 750,000명령 상한·취소 시 worker 정리 |
| `browser-local/src/main.js` | HWP/HWPX 변환 결과마다 벡터 보존율 및 이미지화된 페이지 번호를 즉시 표시. **‘PDF 벡터 품질 확인’** 버튼을 사용자가 눌렀을 때만 고비용 검증 실행. 페이지별 경로/텍스트/이미지/실제 추출 문자 수, 구조검증/검토 경고 표시. 기존 PDF 글꼴 버튼·실행 정책 유지 |
| `browser-local/scripts/copy-wasm.mjs` | PDF.js 공식 `legacy` worker를 기존 미리보기 worker와 별도로 자체 호스팅. 브라우저 환경의 `Map.getOrInsertComputed` 등 API 호환성 보완 |
| `src/worker.js` | `/local/pdf-worker-legacy.mjs`만 정확히 허용, 기존 `pdf-worker.mjs`와 동일한 GET/HEAD·동일 출처·CSP 정책. 임의 `.mjs` 및 source map 라우트는 공개 금지 |
| `browser-local/scripts/verify-local-build.mjs`, `scripts/test-worker-assets.mjs` | 품질 검사용 legacy worker의 빌드 포함 및 엄격한 라우팅 허용/차단 경계 검사 |
| `browser-local/tests/r66-complex-vector-quality.mjs` (신규) | 실제 PDFKit+svg-to-pdfkit으로 합성 4쪽 표·도면을 PDF 생성, PDF.js 실제 내용 파싱, 이미지화 페이지/벡터 경로/추출 글자/불일치 탐지 등 8개 회귀 케이스 |
| `browser-local/tests/r66-vector-quality-browser.mjs` (신규) | 공개 HWP를 실제 Chromium 변환 후 품질 검사 버튼 클릭 및 실제 PDF 구조 결과 표시 확인, 외부 업로드·JS 오류 금지 |
| `browser-local/package.json` | 회귀검사 정규 `npm test`에 신규 8건 등록 |

## 3. 검사용 복잡한 4쪽 SVG 문서 검증 결과

**주의: 아래 수치는 실제 사용자 HWP가 아닌 새로 만든 합성 테스트 문서이다.**
PDFKit과 PDF.js가 독립적으로 생성·분석한 결과다.

| 페이지 | 대표 구성 | 엔진 출력 모드 | PDF 실제 구조 확인 |
|---|---|---|---|
| 1쪽 | 18행 × 10열 **180개 셀**, ASCII 레이블 포함 복잡한 표 | 벡터 | 벡터 경로 100건 이상, PDF 텍스트 그리기 40건 이상, 추출 가능한 문자 60개 이상 |
| 2쪽 | `feGaussianBlur` 필터를 적용한 사각형 도면 | 명시적 혼합 모드에서 해당 페이지만 이미지 | PDF 이미지 그리기 1건 이상, 추출 문자 0개; 폴백 이유 `SVG_FILTER_EFFECT_UNSUPPORTED` |
| 3쪽 | **30개 노드**와 연결선·레이블을 가진 도면 | 벡터 | 벡터 경로 40건 이상, 텍스트 명령 10건 이상, 추출 문자 30개 이상 |
| 4쪽 | 항등 `feColorMatrix saturate(1)`를 갖는 기하 도형 | 벡터 | 실제 PDF 벡터 경로 확인, 불필요한 페이지 이미지화 없음 |

**페이지 기준 벡터 보존율 = 3 ÷ 4 = 75%**, 이미지화된 페이지는 **2쪽만**.
이 수치는 픽셀 면적 기준 75%를 뜻하지 않는다.

또한 확인했다.

- 기본 `professional`은 미지원 `feGaussianBlur`에 대해 명시 오류를 반환:
  **자동 이미지 변환 없음**.
- 허위 폴백 페이지 번호, 중복 번호, 잘못된 페이지 총수, PDF 페이지 수 불일치,
  기록상 이미지 페이지인데 PDF 이미지 그리기 명령이 없는 경우를 불합격 처리.
- 벡터 페이지에 원본 사진이 포함된 별도 PDF 사례에서는 이미지 객체가 존재해도
  **해당 페이지를 전체 이미지 폴백으로 잘못 분류하지 않음**.
- 오류·취소·과대 크기·비정상 문서 입력의 실패 계약 확인.

## 4. QA 결과

- **최종 전체 변경 영향 QA PASS:**
  https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43234862948
- Node 24 / Ubuntu: 관련 테스트 **65/65 PASS, FAIL 0, SKIP 0**.
- 소스 검사, Vite/WASM 빌드, Worker 정적 자산/라우팅 계약 모두 PASS.
- Cloudflare `wrangler dev --local`에서 공개 고정 HWP와 HWPX를 기본
  `professional` 방식으로 변환, 개별 PDF 및 ZIP 다운로드 PASS.
- Chromium에서 생성된 실제 공개 HWP PDF를 대상으로 **'PDF 벡터 품질 확인'**
  클릭해 페이지별 구조 결과와 추출 문자 수 표시 PASS.
- 문서와 글꼴은 같은 브라우저에서만 처리. 사용자 제공 파일을 CI/GitHub/D1에
  업로드하지 않음. 운영 배포·운영 D1 변경 없음.

중간 QA는 PDF.js 실행 환경 제약을 찾고 수정한 증거로 보존한다.

1. Node 일반 PDF.js 빌드에서 `Uint8Array.toHex`가 없어 구조 파싱 실패 →
   Node 공식 `legacy` 빌드 사용.
2. 자동화 Chromium이 `Map.getOrInsertComputed`을 제공하지 않음 →
   품질 검사 전용 공식 `legacy` PDF.js 본체·worker 사용.
3. 최초 legacy worker 경로가 Worker 정적 라우팅 허용 목록에 없음 →
   정확한 GET/HEAD 라우트 추가, 다른 파일은 차단 유지.
4. 각 조치 후 **동일한 PDF 구조 검사 및 실제 Chromium E2E 재검증 성공**.

## 5. 수락의 정확한 범위 및 후속

**이번 완료:** 합성 SVG의 복잡한 표·도면을 실제 PDFKit으로 작성한 뒤 구조검증,
페이지 기준 벡터 보존율·이미지화 페이지·PDF 이미지/벡터/텍스트 명령 및 추출
문자 수의 **독립 확인 기능**이 개발 브랜치에서 동작함.

**이번에 증명하지 못한 것:** 26.30MB·12쪽 실제 사용자 문제 HWP의 페이지별
보존율, SVG와 PDF의 픽셀 차이, 그림자·블러의 원본 동일성, 한컴 정식 PDF의
줄바꿈·표 셀 경계·도형 위치·글꼴 조판 완전 일치.
실문서 수락에는 한컴 기준 PDF와 페이지별 렌더 이미지 비교,
표의 레이아웃·셀 크기, 도면 요소 일치도, 실제 사용자 PC 글꼴을 함께 확인해야 한다.

- 브라우저는 완전히 폐기된 탭에서 작업 메모리를 복원할 수 없다.
- 현재 구조 검사는 UI 버튼을 눌렀을 때만 실행되므로 기본 변환 시간을 늘리지 않음.
- 이미지화 페이지의 문자 검색은 기본적으로 불가능하다.
- 운영용 `main`, `sunrise-pdf-pro-web` Worker 및 D1은 변경하지 않는다.

**최종 판정:** DEV26 복잡한 SVG 필터 벡터 품질 측정 기능 및 합성·공개 HWP QA PASS.
실제 실패 원본 및 한컴 기준 PDF 대비 **시각적 품질 수락은 미완료**. **NO DEPLOY**.

참고 API: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html
