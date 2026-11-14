# Sunrise PDF PRO(Web) DEV34 — 회귀 수정, 25파일 증거 게이트, SVG 엔진 재선정

작성일: 2026-11-14 KST
개발 브랜치: fix/dev34-filter-semantics-qa-20261114
기준 DEV33 커밋: c0ccc7f25caebb723d6982cae830e28524724e20
운영 배포 금지, main 수정 금지, GitHub Actions 재활성화 금지.

## 반복 오류와 DEV34의 구체적 수정

1. DEV33의 '필터 혼합 PDF로 시작' 버튼은 전역 출력 선택을 hybrid-filter로 변경해
   다음 작업까지 설정이 남았고, 기존 일괄 복구의 전역 엔진 불변조건을 위반했다.
   DEV34는 requestedBatchEngine 1회성 값으로 바꾸고 일반 변환 시 즉시 소비한다.
   기존 기본 professional 값과 완료 문서/다른 파일의 상태는 바꾸지 않는다.

2. 기본 npm test에 DEV28/29/30/32 테스트가 누락된 사실 확인.
   package.json에 dev28-live-error-policy, dev29-common-output-gate,
   dev30-one-file-retry-ux, dev32-local-batch-qa 및 dev34-25file-evidence-gate를 추가했다.
   기존 dev30 source assertion은 새 일회성 계약으로 정정; 삭제/약화 안 함.

3. SVG_FILTER_EFFECT_UNSUPPORTED가 발생하면 localFailureAdvice가
   사용자에게 혼합 출력과 명시적 호환 이미지 복구 절차 및 품질 제한을 안내한다.
   원본 경로/파일명은 메시지에 반영하지 않는다.

4. DEV32 진단 보고서는 120페이지가 넘는 정상 문서의 페이지·벡터/이미지 수를
   null로 바꾸고 있었다. 상한을 공유 LOCAL_QA_MAX_PAGES=100000로 수정.
   251페이지 HWPX의 251/250/1 자료가 유지되는 회귀를 추가했다.

## 로컬 25파일 증거 심사 (원본·파일명 전송 금지)

Windows Chrome 개발판의 '실기 검증 보고서 저장'으로 익명 JSON을 저장한 후,
개발 소스 browser-local 디렉터리에서 아래 명령으로 점검할 수 있다.

    npm run qa:review -- "<다운로드한 Sunrise_PDF_PRO_Web_QA_*.json 파일 경로>"

새 scripts/review-25file-qa.mjs는 로컬 JSON 보고서만 읽으며, 문서 내용이나
글꼴·원본 PDF를 읽지 않고 네트워크 전송·배포도 하지 않는다.

- BLOCKED: 25개 미충족, 파일 상태 실패·미완료, 페이지 수 불명, 벡터/이미지
  쪽수 합계 불일치, 파일/요약 합계 불일치, 잘못된 보고서 형식 등.
- VISUAL_REVIEW_REQUIRED: 25개가 모두 형식상 완료되었으나 원본과의 글꼴·표·
  그림자·도형·쪽수·줄바꿈·검색/복사·PDF 시각 정합성을 증명한 것은 아님.
  따라서 이 상태로도 운영 배포를 승인하지 않는다.
- JSON만으로는 25개가 각각 고유한 원본 파일인지도 입증하지 못한다.

## SVG 렌더러 비교 수정

기존 DEV33 후보 typst/svg2pdf 공식 README는 유지보수 중단을 선언하고
LaurenzV/krilla의 krilla-svg 사용을 권고한다.

- https://github.com/typst/svg2pdf
- https://github.com/LaurenzV/krilla
- https://github.com/LaurenzV/krilla/blob/main/crates/krilla-svg/src/lib.rs
- https://github.com/LaurenzV/krilla/blob/main/crates/krilla-svg/src/group.rs
- https://github.com/LaurenzV/krilla/blob/main/crates/krilla-svg/src/filter.rs

실제 krilla-svg 소스 근거:
- SvgSettings 기본 embed_text=true, filter_scale=4.0
- SVG 필터가 있는 그룹만 resvg 이미지 렌더 처리, 다른 그룹은 PDF 객체 유지
- 가로/세로 최대 약 5000px 방어 있지만 총 픽셀·메모리 한도는 별도 검증 필요
- 정상 Rust crate이고 실제 제품용 브라우저 WASM 바인딩·빌드 경로는 미확인
- 한국어 텍스트 ToUnicode, 검색·복사, 로컬 PC 글꼴, 취소, 버전핀,
  라이선스, 25파일 시각 비교가 먼저. 아직 의존성 추가/엔진 교체하지 않음.

## 이번 턴 실제 검증 범위

- GitHub 최신 DEV34 소스에서 실제 UI 클릭/plan 로직을 추출해 실행:
  10시나리오/10 PASS (혼합 1회성, 다음 일반 변환 기본값, busy/ready,
  비HWP 거부, 25중 8개 복구, 재시도 엔진, 개인정보 없는 안내, 스크립트 연결).
- 실제 local-batch-qa / local-qa-release-gate 모듈 함수 평가:
  10시나리오/10 PASS (25완료도 시각확인 필요, 실패 BLOCKED, 251쪽 기록,
  벡터/이미지 합, 위변조 합계/오류, 파일명 비노출, npm 명령 연결).
- 새/변경 JS 구문 및 명시적 배포 안전 조건에 대한 정적 확인.

미실시:
- 연결된 GitHub repo는 읽고 수정할 수 있으나 실행 컨테이너에서 외부 호스트 DNS가
  차단돼 clone과 npm ci가 불가하여 Node 전체 테스트, 실제 Vite build,
  Windows Chrome 25파일 변환, 실제 PDF 시각 diff는 아직 실행 못함.
- Cloudflare 운영 배포/Actions/브랜치 병합 미실행.
- Krilla WASM 프로토타입 미빌드, 실제 폰트·필터 품질 우위 미입증.

## 다음 완료 게이트

1) 개발 PC에서 npm ci, npm run test:local, npm run build, npm run verify:dist.
2) 실제 25개 HWP/HWPX Windows Chrome 실기, 익명 JSON 보고서 저장.
3) 파일별 실제 PDF 렌더를 원본과 시각 비교하고 글꼴·표·검색·복사 확인.
4) krilla-svg 새 엔진은 격리 PoC에서 원본 25개 개선을 증명할 때만 도입.
5) 운영 배포는 검증 후 사용자 명시 승인 필요.
