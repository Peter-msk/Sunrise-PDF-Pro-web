# Sunrise PDF PRO (Web) — R30 개발 인수인계

- 작성 기준: 2026-11-03 KST
- 기준 저장소: `Peter-msk/Sunrise-PDF-Pro-web-`, `main`의 R29 최신 기준본 (`12451d348b544c5f095793acd7560bca9a60b5f9`)
- R30 개발 브랜치: `dev/r30-browser-cancel-cleanup`
- 검토 PR: https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/pull/1
- R30 실제 Chromium+PDF 검증: https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41657181720 (SUCCESS)

## 1. 인수 전 검증된 동작
- 공식 `edwardkim/rhwp` v0.8.7의 브라우저 WASM으로 HWP/HWPX를 클라이언트에서 렌더링.
- `pdf-lib`로 SVG → PNG 페이지 기반 PDF 생성.
- 외부 유료 변환 API와 상시 Linux 변환 서버 없이 동작.
- 원본 HWP/HWPX 파일은 웹 변환 경로에서 서버로 업로드하지 않음.
- 기존 `sunrise-pdf-editor` Worker는 별도이며 수정하지 않음.

## 2. R30 변경 내용
1. `browser-local/src/converter.js`: 선택적 `AbortSignal` 수용. WASM 초기화 뒤/페이지 처리 중/PDF 저장 전후 취소 신호를 확인하며, SVG 이미지 로딩 중에는 abort 이벤트로 로드를 중단. Canvas는 취소·실패·성공 경로에서 해제하며 SVG object URL도 항상 철회.
2. `browser-local/src/main.js`: `변환 취소` 버튼으로 진행 작업을 중단. 진행 중에는 파일 선택을 비활성화해 작업 상태 경합을 방지. 변환 시작 시 파일 객체를 고정해 출력 PDF 이름이 다른 파일 이름으로 바뀌는 결함 방지. 취소/오류 시 기존 다운로드 URL/미리보기/진행률 정리.
3. `browser-local/index.html`: 취소 버튼 및 `#download[hidden]{display:none}` 적용. 기존 `.save{display:inline-block}`가 HTML `hidden` 속성 효과를 가렸던 UI 결함 수정.
4. `browser-local/tests/e2e.mjs`: 실제 Chromium에서 HWP 변환 시작→파일 선택 잠금 확인→취소→다운로드 미노출→잠금 해제→같은 원본 다시 변환, HWP/HWPX PDF 구조검증까지 확인.

## 3. 검증 결과
- GitHub Actions run `41657181720`: SUCCESS.
- `npm test`: PASS.
- Vite build: PASS.
- 실제 Chromium 공식 HWP/HWPX 입력 → PDF 생성 및 다운로드: PASS.
- `pypdf` strict 구조검사: HWP 1쪽 / 21,896 bytes, HWPX 1쪽 / 15,001 bytes: PASS.
- 수집된 Chromium page errors, 원본 업로드에 해당하는 외부 요청, request failures: 없음 (테스트 범위 내).
- 취소 후 재변환: PASS.
- R30 변경분의 실제 공개 Cloudflare Worker 운영배포 및 운영 E2E: **미실시**. R30은 PR 개발 상태로 유지.

## 4. 제한과 다음 작업
- 현재 변환 PDF는 이미지 기반이므로 텍스트 검색/선택 불가능. 실제 복잡한 표·글꼴·그림 품질 인증 전.
- WASM/JS는 브라우저 실행, 정적 WASM은 현재 Cloudflare Worker에서 버전·SHA-256 검증된 외부 npm CDN 데이터를 중계. 무유료API 정책은 유지하지만 완전한 자체 정적 호스팅은 미완료.
- 큰 페이지의 동기식 WASM 렌더 단계는 신호 발생 즉시 중단할 수 없으며, 중단은 이미지 로딩·비동기 경계·페이지 경계에서 반영됨.
- 권장 후속 순서: **R31 WASM 정적 자산 자체 호스팅** → 다양한 HWP/HWPX 서식/다쪽 실문서 품질 게이트 → 텍스트 검색/선택 가능한 PDF 구현 가능성 평가 → R30 변경분 운영 배포/실브라우저 검증.
- 배포 시 `browser-local` 소스와 실제 Worker에 내장된 `LOCAL_BUNDLE`/HTML 자산 버전을 동기화해야 함. `browser-local`만 수정했다고 운영 URL에 변경이 자동 반영되는 것은 아님.

## 5. 안전 경계
- 원본 파일을 외부 API에 전송하는 기능을 추가하지 않는다.
- 기존 메인 API의 백엔드 미연결 fail-closed 정책과 기존 PDF Editor Worker를 유지한다.
- 실행 검증하지 않은 항목을 PASS로 표시하지 않는다.
