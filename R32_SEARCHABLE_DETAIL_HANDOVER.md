# Sunrise PDF PRO (Web) — R32 검색·복사 가능 PDF / 도면 정밀 모드 개발 인수인계

- 기준: 2026-11-04 KST (코드 작성 및 2026-11-03 UTC GitHub Actions 검증 기록)
- 저장소: `Peter-msk/Sunrise-PDF-Pro-web`
- 개발 브랜치: `dev/r32-searchable-text-and-detail-render`
- PR #3: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/pull/3

## 1. PC/Web PDF 6쪽 실제 비교 분석 인수
- PC: 텍스트·폰트·벡터선·이미지 혼합, PDF 텍스트 추출 총 2,042자, 총 6쪽.
- Web R29: 6쪽 각각 전체 페이지 PNG 래스터, 텍스트 추출 0자. 표 101쪽/본문 102쪽/컬러 구성도 103쪽/도로 평면도 104~105쪽/상세 구조도 106쪽에서 글자·선 선명도 차이.
- R31에서는 300dpi 기본으로 증대; 현재 R32에서는 360dpi 정밀 모드 및 한글 투명 텍스트 계층 추가.
- 원본 `(보완) 0204 대기질(101-106).hwp`는 과거 라이브러리 색인에서 발견했으나 원본 파일 바이트를 안전하게 가져올 수 없어 R32 실변환 직접 비교는 수행하지 않음.

## 2. R32 소스 변경
- `browser-local/src/searchable-layer.js`: SVG `<text>`에서 명시된 기본 x/y/font-size 및 글자 추출. 위치 없는 객체, transform/tspan 등 복잡한 항목은 누락(통계 표시). 페이지 상한 25,000 텍스트 노드.
- `browser-local/src/converter.js`: 기본 래스터 PDF와 선택적으로 겹친 투명 Unicode 검색용 텍스트 계층. `@pdf-lib/fontkit`과 `@fontsource/nanum-gothic@5.3.0` 사용. 검색용 폰트는 동일 오리진의 정적 자산에서만 받아옴. `AbortSignal` 및 자원 정리 유지.
- 정밀 품질: 360dpi / 16,000,000픽셀 / 최대 30쪽. 기본 품질: 300dpi / 9,000,000픽셀 / 최대 120쪽.
- `browser-local/index.html`과 `src/main.js`: UI 옵션 및 실제 PDF 검색 계층 커버리지(삽입/누락) 표시.
- `src/worker.js`: hashed `.woff/.woff2` 정적 폰트 자산을 allowlist로 안전하게 제공. 신규 문서 업로드 API 없음.
- `browser-local/tests/*`, `scripts/test-worker-assets.mjs`, CI `.github/workflows/r29-browser-local.yml`: 옵션 선택, 변환 취소/재시도, Cloudflare Wrangler 로컬 Worker 및 브라우저 실변환, `pypdf` 실제 PDF 텍스트 추출 검사.

## 3. 검증 근거
- 1차 R32 E2E: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/41666890502 — SUCCESS.
- HWP PDF 1쪽: `pypdf` 추출 200자(한글 포함), 다운로드 PDF 크기 73,082B.
- HWPX PDF 1쪽: `pypdf` 추출 34자(주로 영문), 다운로드 PDF 크기 37,181B.
- 정밀 HWP 샘플 A4: 2,976 x 4,209 px. 일반 HWPX 샘플 A4: 2,480 x 3,508 px.
- 검색 결과는 각 glyph의 배치에 의존하며, 실제 사용자 PC PDF처럼 완전한 문단 단위 검색/복사를 보장하는 것은 아님.
- 최종 최신 SHA의 CI PASS는 별도 확인하고 PR 리뷰/병합 후 추가 기록 필요.

## 4. 남은 과제
- R33: rhwp SVG native PDF vector rendering (paths/lines/images with fallback) 및 정량 시각회귀. PDF 레이어 출력 우선순위와 한글 폰트 메트릭 정합 별도.
- 상용/실무 문서: 한국어 본문, 표·사진·도로 CAD 도면 복합 6쪽 HWP 원본 재확보 → R31/R32/PC 3개 변환 파일 비교(A4, 가로 페이지, 줄바꿈, 1px 선 및 이미지 원본 해상도).
- Cloudflare Worker GitHub Builds 연결: 기존 `sunrise-pdf-editor`는 GitHub 연결됨, `sunrise-pdf-pro-web`는 `8000012` GitHub App 저장소 접근 오류로 불가. 사용자가 GitHub App 설치 설정에서 `Sunrise-PDF-Pro-web` 권한 승인 필요. 승인 후 계정 `569c0b66d1f480e577ca67cd68592203`, Worker 이름 `sunrise-pdf-pro-web`, branch `main`, build `npm run build`, deploy `npx wrangler deploy`.
- 현재 main 운영 URL은 R29. 소스 main 병합만으로 실제 Cloudflare 배포를 의미하지 않음.

## 5. 안전 경계
- 사용자 HWP/HWPX 바이트는 GitHub, Actions, 외부 분석/변환 API로 업로드하지 않음.
- `sunrise-pdf-editor` Worker 수정 및 기존 API 프록시 계약 변형 금지.
- PDF의 벡터 보존, PC 수준 품질, 완벽한 텍스트 검색은 통과한 개별 검증 범위 밖에서는 주장하지 않음.
