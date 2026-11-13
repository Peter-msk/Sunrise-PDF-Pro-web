# Sunrise PDF PRO(Web) — DEV27 SVG 필터 벡터 안전 확장·오류 진단 (2026-11-13)

## 1. 실제 사고와 작업 경계

- 사용자가 2026-11-12 밤 약 25개 문서를 변환한 뒤 오류 보완을 요청.
- 운영 D1 읽기 전용 조회로 확인한 특정 2026-11-13 00:00:22~00:04:49 KST 익명 세션: HWP/HWPX 변환 시작 22건, 성공 이벤트 13건, 실패 이벤트 8건, 종료 이벤트 불명 1건.
- 실패 8건은 모두 `SVG_FILTER_EFFECT_UNSUPPORTED`, 발생 진단 단계 `image_filter`. 이 세션에 `PDF_STREAM_TIMEOUT` 실패는 없음.
- 파일명·문서 원본·SVG 원문·필터 정의는 운영 D1에 저장하지 않으므로, 위 사건이 전부 동일 필터 종류로 인해 발생했다고 단정할 수 없음.
- 사용자 작업의 25개 입력 파일이 위 세션의 22건과 정확히 1:1 연결된다고 입증할 수 없음.
- 사용자 원본과 한컴 기준 PDF는 개발 측에 없음. 실문서 정확성 검증 및 사고 완전 종결은 미실시.

## 2. 실제 변경

### browser-local/src/svg-safe-grayscale.mjs
- 기존 `CSS_GRAY` 단일 필터 정규화를 안전한 **회색조 필터 1개 + 시각 효과가 없는 CSS 필터 토큰 최대 7개**의 시퀀스 인식으로 확장.
- 허용 예: `grayscale(100%) brightness(1)`, `opacity(1) grayscale() invert(0)`, `contrast(100%) saturate(0%)`.
- 기존 `grayscale(0)`/ `saturate(1)` 같은 무효과 전용 필터 처리와 기존 SVG `feColorMatrix` 단일 정규화는 보존.
- `blur`, `drop-shadow`, 부분 투명도 변화, 부분 채도·색상 조정, URL 필터와 혼합된 CSS 효과, 정의되지 않은 복잡 체인은 여전히 `SVG_FILTER_EFFECT_UNSUPPORTED`로 fail-closed.
- `unsupportedFilter(category)`: 동일 안정된 오류 코드에 고정된 비식별 필터 범주만 추가. 범주 어휘: unsafe-identity-target / css-or-external / missing-definition / multi-primitive / blur / blend / composite / displacement / other-primitive. 원본 SVG, URL, 필터 ID, 텍스트, 폰트 이름은 포함하지 않음.
- 사용자가 별도 선택한 `hybrid-filter`의 원래 오류 코드 매칭과 전문 벡터 기본값은 변경하지 않음.

### browser-local/src/converter.js
- 동일 페이지별 `SVG_FILTER_EFFECT_UNSUPPORTED` 오류에 내부 범주를 한글 설명으로 표시.
- 내부 범주 문자열은 고정된 매핑 표로만 출력. 원문이나 임의의 필터 속성 값을 오류 문구에 연결하지 않음.
- 기존 익명 서버 텔레메트리의 `error_code`는 동일 오류 코드로 유지, D1 스키마/Worker 변경 없음.

### browser-local/tests/r66-svg-filter-vector-safe.mjs
- 추가 단위·벡터 구조 검증 3종:
  1. 안전한 회색조 + 무효과 체인 5종의 실제 동일 회색 조정 및 벡터 보존.
  2. 흐림/부분 투명/그림자/색조 변화/복합 필터 등의 원치 않는 조용한 제거 금지.
  3. 진단 범주의 고정 어휘 및 SVG 원본 이름·속성의 오류 메시지 노출 금지.

## 3. 집중 QA

- GitHub Actions (배포 없음): https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43417128776
- Node 24, source syntax check, `npm ci --prefix browser-local --ignore-scripts`(기존 의존성 고정), targeted test 4개 파일:
  - `r66-svg-filter-vector-safe.mjs`
  - `r66-hybrid-svg-filter.mjs`
  - `r66-hybrid-vector-integration.mjs`
  - `r66-complex-vector-quality.mjs`
- 결과: **43/43 PASS, FAIL 0, SKIP 0**, GitHub workflow conclusion `success`.
- 실제 PDFKit + PDF.js 합성 복잡 표/도형 시험은 성공. 기존 흐림 필터 페이지의 부분 이미지화와 비지원 필터의 기본 출력 실패 계약도 유지.
- 시험 출력에는 PDF.js 표준 폰트 데이터 경고가 있었지만 해당 테스트의 벡터·구조 검증은 PASS. 경고가 발생했다고 실문서 동일성을 보증하거나 경고를 숨기지 않음.
- Node 테스트/합성 SVG 통과는 사용자가 지난밤 처리한 실제 25개 HWP/HWPX의 재현 또는 치유를 입증하지 않음.

## 4. 남은 정확한 검증과 운영 경계

- 원본 문서 또는 민감정보 제거 후 동일 필터를 포함하는 최소 실패 문서가 확보되면 `professional`→`hybrid-filter` 비교 및 한컴 기준 PDF 페이지별 육안/자동 구조 평가.
- 새 분류 코드를 실제 사용자 환경에서 확인하려면 후속 릴리스 QA·명시 승인·운영 배포가 필요. 현재 운영 화면에는 이 변경이 적용되지 않음.
- 동일 오류 8건 모두에 새 CSS 조합 확장이 적용될 수 있는지 **알 수 없음**; SVG 흐림·그림자 등의 필터인 경우 여전히 혼합 PDF 선택이 필요함.
- `main` 병합, 프로덕션 Cloudflare Worker 배포, D1 스키마/쓰기, 별도 `sunrise-pdf-editor` 변경 없음.
- 인접 개발 `DEV27_NIGHT_BATCH_SVG_RECOVERY_20261113.md`에서 구현한 실패 파일 일괄 복구 동작과 공존, 사용자 명시적 동의 없는 이미지 PDF 자동 강등 없음.

**현재 판정: DEVELOPMENT QA 43/43 PASS / ROOT CAUSE OF REAL USER DOCUMENTS UNVERIFIED / NO PRODUCTION DEPLOY.**
