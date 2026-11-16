# Sunrise PDF PRO(web) DEV39 — 내장 원본 서체의 글자 구간 보존

작성일: 2026-11-16 (KST)
기준: DEV38 R04 `ffdeb2941b6b99b059b327cb1ab16237bda5f2a9`
개발 브랜치: `fix/dev39-preserve-bundled-font-runs-20261116`

## 1. 실제 재현된 원인과 영향

`browser-local/src/svg-professional.js`의 `preflightProfessionalSvg()`에서 문서가 지정한 서체가 특정 문장부호를 지원하지 않고, 다른 OFL fallback 서체가 **전체 텍스트**를 지원할 때 원문 본문까지 하나의 fallback으로 바꿔버리는 경로가 있었다.

- SVG의 원문 예: `<text font-family="학교안심 바른돋움">한글‧</text>`
- 원래 지정 서체 BodyFace의 glyph 집합: `한글`.
- 대체 글꼴 WideFace의 glyph 집합: `한글‧`.
- DEV38의 `namedLocal` 가드는 `candidate.isFallback===false`인 사용자 설치 글꼴만 보호했다. 따라서 **이미 사이트에 번들된 학교안심 본문 서체**는 선택된 `face.isFallback` 상태에서 제외되었다.
- 같은 실제 분기의 기존 코드를 실행한 결과: `resolveFont(..., "한글‧") → WideFace`; `resolveFontRuns(...) → [("한글",BodyFace),("‧",WideFace)]`이지만 preflight `changed=false`로 구간 분할이 일어나지 않았다. 전체 WideFace 대체는 글자폭·행간·줄바꿈의 변형 위험이 있다.

## 2. 최소 변경 수정

- `browser-local/src/svg-professional.js`: 원래 CSS에 **명시된 원본 폰트**가 사용자 PC/수동 글꼴이든 번들 글꼴이든 해당 문장에 실제 글리프를 일부 보유하면 `namedOriginal`로 식별한다.
- 보완 글꼴이 문장 전체를 지원해도, 본문의 지정 글꼴을 보존할 수 있으면 `resolveFontRuns`를 통해 글자 단위 구간을 선택한다.
- 이미 있던 안전조건(문자수가 너무 많음, combining mark, emoji 복합문자, 중심/오른쪽 정렬, 명시 `textLength`, 다중 x/dx/rotate, 중첩 tspan, DOM 미지원)은 바꾸지 않는다. 복잡한 레이아웃에서 임의의 폭과 위치를 재계산하지 않는다.
- 신규 분할에서 본래 지정한 학교안심 서체를 그대로 사용하는 span은 더 이상 “학교안심 바른돋움 → 학교안심 바른돋움”과 같은 허위 대체 경고를 생성하지 않는다. **실제 다른 서체가 사용된 문자 구간만 대체로 기록**한다.
- 변환 엔진, WASM 버전, PDFKit 버전, UI 레이아웃, 기본 변환 모드, Cloudflare 라우터는 변경하지 않는다.

## 3. 검증 결과

실제 GitHub 브랜치에서 가져온 `svg-professional.js`의 동작 분기와 `r66-font-run-fidelity.mjs`를 V8 함수로 평가해 검증했다.

| 항목 | 결과 |
|---|---|
| DEV38 기존 코드의 전체 대체 문제 재현 | 확인 |
| 수정 후 `한글`은 원래 `학교안심 바른돋움` 유지 | PASS |
| `‧`는 지원하는 보완 서체로 분리 | PASS |
| 원본 서체를 자기 자신으로 대체했다는 허위 경고 미표시 | PASS |
| 원본 서체가 지정되지 않은 일반 fallback 동작 유지 | PASS |
| `textLength`와 위치 안전조건 유지 | PASS |
| 기존 검사·신규 검사 총합 | **19 / 19 PASS** |
| 수정된 JS 파일 3개 소스 구문 검사 | PASS |
| DEV38 테스트 경유한 실제 `preflightProfessionalSvg` 시나리오 추가 | 작성·등록, 실행 보류 |

**중요 제한**: 19/19는 **선별된 SVG 코드 분기 실행**이며 `npm test` 전체, 진짜 PDFKit 기반 웹앱 변환, 원본 HWP/HWPX 25개의 품질 승인 결과가 아니다. 테스트 1개는 DEV38 실제 preflight 모듈 테스트 파일에 추가했지만 의존성 미설치로 실행하지 못했다.

## 4. 실제 운영·수락 상태

| 검증·배포 항목 | 상태 |
|---|---|
| DEV39 최소 수정, 소스·테스트 GitHub 반영 | 완료 |
| 글꼴 지정 시 본문 유지와 문자 단위 대체 회귀 | 19/19 PASS (선별 실행) |
| Node `npm ci`, `npm run test:dev38`, `npm test` | 미실행 (실행 컨테이너 외부 DNS 차단 및 의존성 캐시 없음) |
| `npm run build`, `npm run verify:dist` | 미실행 |
| 사용자 제공 안심글꼴 365종 ZIP 실바이트 전수검사 | 미완료 (파일 기록은 확인, 원본 재반출 불가) |
| 실제 HWP/HWPX 25개 및 변환 PDF 8개/124쪽 원본 대비 1:1 검수 | 미완료 |
| Cloudflare 운영 배포, main 병합, GitHub Actions 활성화 | **모두 미실시** |

## 5. 다음 단계 체크리스트

1. 개발 PC 또는 의존성이 준비된 격리 환경에서 기존 `browser-local` 기준 `npm ci`를 확인하고 **변경 영향 테스트만 우선 실행**: `node --test tests/r66-font-run-fidelity.mjs tests/dev38-actual-svg-font-pdf.mjs`.
2. 실제 로컬 브라우저에서 학교안심 명시 본문 + 누락 특수기호가 섞인 HWP를 변환하고 PDF 글자 검색·폰트 임베딩·조판 폭을 확인한다.
3. 기존 전체 릴리스 조건인 `npm run test:local`, `npm run build`, `npm run verify:dist`와 사용자 원본 문서 25개 품질 수락시험을 완료한다.
4. Cloudflare 정식 배포는 **명시적 승인 후에만** 진행한다.

**판정: DEV39 원본 글꼴 구간 보존 로직 및 선별 회귀 PASS. 정식 웹앱 릴리스는 PENDING.**
