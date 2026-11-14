# Sunrise PDF PRO(Web) DEV35 — 브라우저 자체 PDF 엔진 / 한컴 설치 불필요 / 글꼴만 OS 선택 사용

날짜: 2026-11-14 KST
개발 브랜치: fix/dev35-browser-only-font-parity-20261114
기준: DEV34 커밋 86e953f32dfab1ac1eed034eceb7ed134a22bffb
운영: 배포 미실시 / main 변경 금지 / 기존 GitHub Actions 중단 유지

## 1. 사용자 의도 최종 확인

- **금지**: 웹 PDF 변환을 시도할 때 해당 PC의 한컴오피스/한글 실행 파일,
  한컴 COM, ActiveX, Windows 프로세스 자동화를 필수 또는 우회 엔진으로 호출.
- **필수**: 한컴오피스가 없는 Windows PC, macOS, 모바일 기기에서도 자체 RHWP
  WASM → SVG → PDFKit 브라우저 엔진으로 변환을 시도할 수 있어야 한다.
- **허용/권장**: PC 브라우저의 Local Font Access API로 사용자가 승인한
  설치 글꼴을 가져와 원본 문서와 패밀리/굵기/기울임 등을 일치시킬 수 있다.
  이는 한컴 프로그램 호출이 아니라 글꼴 데이터 조회다.
- **모바일 보완**: 설치 글꼴 API가 없으면 내장 OFL 글꼴로 계속 변환.
  필요한 원본 TTF/OTF는 사용자가 모바일 기기에 보유한 파일을 직접 선택 가능.
  다른 PC에 설치된 글꼴을 모바일 브라우저가 원격으로 직접 읽는 기능은 없음.
- **결과의 정직성**: 서체가 다르면 줄바꿈·문단 길이·표·도면 배치가 바뀔 수
  있으므로 대체 글꼴 사용을 밝혀야 하며 원본과 같은 PDF라고 표시하지 않음.
- 기존 프로젝트의 GitHub Actions 중지 지시는 별개이며 이번 요구 해석과
  혼동하지 말 것. Actions 중지는 유지한다.

## 2. 현재 실제 웹 파이프라인 (신규 엔진으로 치환하지 않음)

- HWP/HWPX: @rhwp/core 0.8.7 WASM HwpDocument → 페이지 print SVG →
  SVG 안전 검사/필터 정규화 → svg-to-pdfkit 0.1.8 + pdfkit 0.20.2 PDF.
- 기본 professional: 글자/벡터 객체 보존, 미지원 효과는 fail-closed.
- 혼합 hybrid-filter/호환 이미지 출력: 사용자 명시적 선택시에만 실행.
- 실제 결과를 PDF 완전성 게이트에서 검사한 뒤 성공으로 공개.
- 사이트 정적 자산으로 rhwp_bg.wasm과 내장 폰트 6종을 제공.
- 폰트 우선순위: 사용자 직접 TTF/OTF > 같은 기기의 설치 폰트(권한 승인)
  > 내장 나눔명조/나눔고딕/기호 대체.
- Windows 한컴 설치 프로그램은 전혀 호출하지 않음.

## 3. DEV35 변경 내용

1) browser-local/src/main.js: 설치 글꼴 기능 지원·보안 컨텍스트를
   확인하고, 미지원 모바일에서 글꼴 접근 호출 자체를 건너뛴다.
   PDF 변환기는 별도의 RHWP WASM을 계속 사용한다. 초기 메시지에서
   한컴오피스 불필요, 직접 TTF/OTF 선택 가능, 글꼴 대체 위험을 설명한다.
   인쇄 보조 경로도 같은 정책으로 조정했다.
2) browser-local/index.html: PC·모바일 자체 변환 정책, 원본 글꼴 경고,
   직접 추가 경로를 안내한다.
3) browser-local/scripts/verify-engine-contract.mjs: 모든 browser-local/src
   JavaScript 모듈을 순회해 win32com/ActiveXObject/HWPFrame.HwpObject와
   OS child_process import 도입을 차단. 모바일 내장 글꼴 6종의 존재도 점검.
4) src/browser-only-upload-policy.mjs, src/worker.js: 옛 서버형 변환 UI가
   /api/jobs 등에 원본 HWP를 POST할 수 있던 레거시 경로 차단.
   multipart 문서 업로드를 backend relay 이전에 거부한다.
   정상적인 GET/JSON/admin API는 영향받지 않아야 한다.
5) browser-local/src/local-batch-qa.mjs 및 local-qa-release-gate.mjs:
   25개 파일 로컬 QA JSON에 실제 사용된 PC/수동/내장 폰트의 **숫자**,
   대체 패밀리 수, PC 글꼴 불일치 수만 넣는다. 실제 문서명·원본 글꼴명은
   내보내지 않는다. 전부 완료여도 VISUAL_REVIEW_REQUIRED 유지.
6) browser-local/tests/dev35-browser-only-hancom-free.mjs 와 기존
   r66-engine-contract.mjs에 모바일 폰트 미지원/거부/빈 배열/명시적 수동 폰트
   우선순위/서버 업로드 차단/대체 글꼴 개인정보/6종 자산 체크를 추가.
7) npm run test:local 경로에 npm run check:engine을 추가하고
   dev35 테스트를 기본 npm test에 등록했다.
8) browser-local/README.md의 오래된 이미지 전용·20MiB 문구를
   현재 웹 WASM+벡터 전문 출력, 모바일·글꼴 제한 설명으로 대체.

## 4. 실제 실행 검증 vs 미실시

- GitHub 최신 DEV35 실제 소스의 순수 함수를 평가한 모바일 폰트/우선순위/
  QA 비식별 익명 숫자 검사 16/16 PASS (앞선 변경 코드 기준).
- 추가된 레거시 업로드 차단 함수 11/11 PASS. Worker가 backend relay보다
  먼저 차단하도록 삽입된 것을 정적 확인.
- 변경 JS 로직 구문 확인, 새 Node test 파일 및 스크립트 연결 확인.
- GitHub 소스는 connector로 편집했지만 네트워크/DNS 제약으로 전체
  npm ci/npm test, vite build, Chrome 실기 25문서 테스트는 **미실시**.
- 25개 원본 HWP/HWPX / 정답 PDF가 현재 실행 환경에 없어 원본 대비
  폰트 정확도·줄바꿈·표/도면 정합성은 입증하지 못했다.
- 실제 Android/iOS 기기 실행 검증 **미실시**.
- Cloudflare 배포/본선 합병/GitHub Actions 실행 **미실시**.

## 5. 다음 수락 기준

A. 로컬 개발 PC에서 npm ci, npm run test:local, npm run build,
   npm run verify:dist를 실제 실행한 기록 확보.
B. Windows 한컴 미설치 PC 및 Android/iOS 브라우저에서 같은 HWP/HWPX를
   실행하여 브라우저 내부 변환으로 PDF가 내려받아지는지 시험.
C. PC 글꼴 API 허용/거부, 모바일 TTF/OTF 추가, 내장 글꼴 대체 3가지
   경로의 실제 결과 PDF 글꼴 임베딩/검색/복사/줄바꿈 비교.
D. 실제 사용자 문서 25개 전수 검증, 실패 페이지/이미지 필터 종류 기록,
   필터 혼합 출력은 이미지 페이지와 벡터 페이지를 분리해서 승인.
E. 수락 검증 완료와 사용자 명시 승인 후에만 운영 배포.
