# Sunrise PDF PRO(Web) DEV27 — 실제 브라우저 인쇄 복구 UI 수락시험

**일자**: 2026-11-13 (KST)  
**대상 저장소**: `Peter-msk/Sunrise-PDF-Pro-web`  
**개발 브랜치**: `dev/dev27-p0-baseline-audit-20261113`  
**시험**: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43430228432  
**판정**: **PASS** — 실제 Chromium UI, 공개 HWP/HWPX 원본, 실제 rhwp WASM 인쇄용 SVG 변환, 인쇄 버튼 이벤트 및 상태 수명주기.

## 1. 문제와 목표

직전 DEV27에서 미지원 SVG 필터 오류를 겪은 파일을 **Chrome/Edge 인쇄 경로**로 준비하는 기능을 연결했다. 그러나 기존 `show(item)`은 동일 파일을 다시 선택해도 `clearPrint()`를 호출하여 이미 준비된 프레임을 폐기했다. 또한 파일을 변경해도 이전 행의 `브라우저 PDF로 저장` 버튼이 한동안 남아 다른 파일의 인쇄 작업처럼 보일 수 있었다.

이번 수정의 목적은 렌더링 엔진 신규 구현이 아니라, **기존 인쇄 프레임의 소유권과 UI 수명주기**를 정확하게 관리하고 실제 사용 시나리오를 검증하는 것이다.

## 2. 최소 코드 변경

- `browser-local/src/main.js`: `show(item)`에서 **활성 파일이 실제 바뀌는 경우에만** `clearPrint()` 실행. 동일 파일 재선택은 준비된 프레임 유지.
- `clearPrint()`: 준비된 프레임 해제 후 모든 `.native-print-save` 행별 저장 버튼 제거. 파일 전환 시 `draw()`가 호출되지 않아도 잘못된 저장 버튼이 남지 않음.
- `pdf-font`, `pdf-engine` 변경 시 인쇄 프레임을 무효화하며 `draw()`로 옵션 변경에 따른 행 버튼 상태 즉시 갱신.
- 오류 분류, HWP 파서, `native-print.js`의 SVG 안전 검사, 기존 전문 PDF 기본 엔진, 변환 결과 상태 전이는 변경하지 않음.

## 3. 실제 Chromium 수락시험

- 시험 코드: `browser-local/tests/dev27-native-print-real-browser.mjs`
- 시험 워크플로: `.github/workflows/dev27-native-print-real-browser.yml` (개발 브랜치 전용, 배포 없음).
- 공개 원본:
  - `edwardkim/rhwp@v0.8.7/samples/re-01-hangul-only-hancom.hwp`
  - `edwardkim/rhwp@v0.8.7/samples/tac-host-spacing.hwpx`
- 프런트 실제 변환 호출 `convertAnyToPdf`만 테스트 내부에서 미지원 필터 오류로 대체. 문서 선택·파일 큐·실패 UI·재선택·기본 엔진 상태는 앱의 실제 구현을 사용.
- **브라우저 인쇄 경로 `renderNativePrintPages`는 대체하지 않음**. 두 원본을 실제 WASM으로 열고 페이지별 안전한 SVG를 생성한 뒤 `prepareNativePrint` 샌드박스 iframe에 넣는 경로를 실행.
- 운영체제 인쇄 대화상자 호출은 테스트 전용 `window.print` 인터셉터로 계측해 클릭 동작을 확인했다. 앱이 실제로 PDF 파일을 디스크에 저장했다고 주장하지 않는다.

### 수락 결과 — 점검 10항목 / 10 PASS

1. Chromium 앱과 실제 WASM 자원 초기화 정상.
2. 두 원본의 전문 PDF 실패 오류가 UI에 표시되며 무단 래스터 자동 전환 없음.
3. 공개 HWP → 실제 WASM/안전 SVG → 샌드박스 인쇄 프레임 생성.
4. HWP를 다시 선택해도 준비된 인쇄 프레임 유지.
5. HWP 행별 `브라우저 PDF로 저장` 직접 클릭이 프린트 이벤트 1회를 발생.
6. HWPX로 이동 시 이전 HWP 인쇄 프레임과 행별 저장 버튼 제거.
7. 공개 HWPX → 실제 WASM/안전 SVG → 별도 인쇄 프레임 생성.
8. HWPX를 다시 선택해도 준비된 인쇄 프레임 유지.
9. HWPX 행별 `브라우저 PDF로 저장` 직접 클릭이 프린트 이벤트 두 번째 호출.
10. `pdf-engine` 변경 시 기존 인쇄 프레임과 저장 버튼 제거, 원래의 실패 상태 유지.

QA: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43430228432  
Job `focused-browser`: **success**. 테스트 브라우저에서 포착된 미처리 페이지 오류 0개. 보안 원본 파일은 업로드하지 않음.

## 4. 시험 초기에 확인된 테스트 코드 실수와 수정

- `genuine.hwp` 부분 일치 선택자가 `genuine.hwpx` 행까지 선택: 정확한 파일명과 행 인덱스로 고정.
- `iframe` 노드의 후손을 일반 locator로 찾았던 오류: `iframe.contentDocument`에 직접 접근해 안전한 SVG 존재 여부를 확인.
- 접힌 `details.advanced`에서 보이지 않는 `select`를 조작하려던 오류: 실제 UI의 고급 설정 요약을 먼저 클릭.
- 이 문제들은 **시험 조작 코드의 오류**이며 수정 후 최종 QA PASS. 중간 실패한 workflow를 최종 제품 실패로 오판하지 않음.

## 5. 품질과 출시 경계

**이번에 검증한 것**: 공개 원본 HWP/HWPX의 실제 브라우저 WASM 인쇄 준비, SVG 안전 경계, 사용자 클릭으로 분리된 인쇄 호출, 파일별 프레임 및 버튼의 소유권, 옵션 변경·재선택 상태.

**이번에 검증하지 못한 것**: 사용자의 지난밤 실패 원본 25개, 복잡한 실제 SVG 필터가 있는 HWP/HWPX의 한컴 기준 PDF 시각동일성, 운영체제 PDF 저장 대화상자에서 최종 파일 저장 성공, 실제 사용자 PC 글꼴 동일성.

이전 DEV27 별도 시험에서 합성 `feGaussianBlur` SVG에 대해 Chromium PDF 생성과 일반 SVG 텍스트 추출을 통과했고, 공개 원본 HWP/HWPX는 일반 전문 PDF 엔진에서 실제 다운로드/텍스트 추출을 검증한 바 있다. 세 가지 독립 시험을 혼동해서 **실패 원본 8건 해결 성공**이라고 판단하지 않는다.

`main` 및 운영 Cloudflare Worker 변경 금지. 명시적 배포 승인 전까지 DEV27 개발 브랜치만 수정.

**현재 결론: DEV27 REAL UI ACCEPTANCE PASS / USER ORIGINAL DOCUMENT PARITY UNVERIFIED / NO PRODUCTION DEPLOY.**
