# Sunrise PDF PRO(Web) 작업지시서
작성일: 2026-11-22
대상 저장소: Peter-msk/Sunrise-PDF-Pro-web
작업 브랜치: feat/dev63-modular-ui-clean-release-20261122
기준 배포: DEV62, 커밋 8724b1dd9a301692a8140c2a323a4ae91eef9d91
목적: 코드의 모듈화, 사용자 화면에서 내부 개발 용어 비노출, 기존 기능의 안전한 유지, 검증 증거 확보

## 1. 필수 요구사항
- GitHub에는 HTML 한 파일에 JavaScript/CSS를 몰아넣지 않는다. HTML은 구조, CSS는 스타일, JavaScript는 기능으로 구분한다.
- PC·모바일 웹 사용자는 DEV/R/QA 등 내부 식별자, 내부 엔진 이름, 불필요한 기술 진단을 볼 필요가 없다. 단, 실제 파일 오류·글꼴 부족·검색 불가 같은 사용자 판단 정보는 유지한다.
- HWP/HWPX, XLS/XLSX, JPG/PNG, 일괄변환, 개별/ZIP 저장, PDF 미리보기·페이지 이동, 취소, 실패 파일 재시도, 글꼴 추가, 관리자·공지 기능을 유지한다.
- 파일 원본은 브라우저에서 처리한다. 허가 없는 업로드, 수집, 외부 폰트 전송, 자동 이미지화, 복구 성공의 허위 표시를 금지한다.
- 사용자 요구에 따른 고정 쪽수/파일수/일반 용량 상한 완화는 유지하되, 압축폭탄·경계초과·손상된 PDF 차단과 취소 처리는 유지한다.

## 2. 수정·감사 담당 범위
- browser-local/index.html: 구조와 사용자 안내만 보유. CSS 링크 연결과 정보 구조 확인.
- browser-local/src/styles/converter.css: 변환기 기본 레이아웃.
- browser-local/src/styles/file-queue.css: 파일별 목록·작업 버튼.
- browser-local/src/styles/responsive.css: 모바일·접근성 보정.
- browser-local/src/main.js: 화면 이벤트, 상태, 출력 파일 표시. 기술 버전 제거.
- browser-local/src/user-output-copy.mjs: 사용자에게 보여줄 출력 모드·오류 설명.
- browser-local/src/converter.js, direct-*.mjs, spreadsheet-pdf.js, batch.js: 기존 PDF 변환기와 자원 관리 유지.
- src/worker.js: 외부 CSS 정적 자산 경로 허용. 임의 경로 노출 방지.
- src/site-home.js, src/site-updates.js: 공개 화면 안내와 공지 제목 표현 정리.
- browser-local/tests/: 변경 영향 회귀 시험과 출력 화면 불변 조건 검사.

## 3. 검증 승인 기준
- 소스 연결·ESM 구문 검사, npm ci 및 기존 자동 시험 실패 0건, Vite 빌드, 정적 자산 검증, Worker 배포 성공 확인.
- 브라우저 실행에서 /local/ CSS·JS 응답 200, 개발자용 식별자 비노출, 미리보기·다운로드 정상 확인.
- 원본 문서 25개와 사용자 Windows·Android 실기 검증 결과는 별도 판정한다. 수행하지 않은 실기를 PASS로 보고하지 않는다.
- 기존에 검증이 완료된 정상 기능을 의미 없이 반복 시험하지 않는다. 변경 영향과 새 자산 연결 중심으로 검사한다.

## 4. 배포·보존
- 검증 완료 커밋을 Cloudflare Workers Builds 수동 배포한다. GitHub Actions 신규 사용 금지, DB 변경 금지.
- 배포 전 기존 Worker 버전을 기록하고 배포 직후 버전 및 트래픽 비중을 읽어 검증한다.
- 같은 프로젝트 폴더 ‘9. Sunrise PDF PRO(web)’에 최신 HTML과 개발계획서·작업지시서·인수인계서를 업로드한다.
- HTML은 CSS/JS를 참조하는 소스 파일이며 단독 실행 보장을 하지 않는다. 재현 가능 소스는 GitHub 커밋을 권위 기준으로 삼는다.

## 5. 완료와 미완료의 구분
코드 변경과 자동화 검증 결과는 로그와 커밋으로 확인한다. 원본 25문서 육안 비교, 실제 Windows/Android 브라우저 품질, 장시간 대용량 성능은 실기 증거 전까지 미검증으로 유지한다.
