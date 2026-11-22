# Sunrise PDF PRO(Web) 개발계획서
작성일: 2026-11-22
프로젝트: Sunrise PDF PRO(Web)
저장소: https://github.com/Peter-msk/Sunrise-PDF-Pro-web
개발 브랜치: feat/dev63-modular-ui-clean-release-20261122

## 1. 개발 목표와 원칙
사용자 기능의 일관성을 유지하면서 HTML/CSS/JavaScript 책임을 분리한다. 실사용 화면에서 내부 DEV/R/QA 코드, 엔진 구조 설명, 검증 버튼을 숨기고 PDF 변환·미리보기·저장에 집중한다. 변경은 KISS, YAGNI, 최소 작업 범위 및 위험 비례 검증 원칙을 따른다.

## 2. 현행 구성
- Cloudflare Worker: src/worker.js, site-home.js, site-updates.js. 홈페이지·관리자·공지·변환기 자산 라우팅.
- 브라우저 프런트엔드: browser-local/index.html, src/main.js, src/styles/*.css, src/user-output-copy.mjs.
- 변환 라우팅: browser-local/src/convert-any.js와 converter.js.
- HWP: @rhwp/core 0.9.0, 기본 객체 보존, 명시적 혼합/이미지 호환 방식, 정밀 PDF 시험 모드.
- 기타: spreadsheet-pdf.js, image-pdf.js, pdf-viewer.js, batch.js.
- 폰트·파일 무결성: pdf-fonts.js, local-font-policy.mjs, pdf-output-integrity.mjs 등.

## 3. 단계별 작업
1단계: 기준 DEV62와 운영 배포 버전 고정, 주요 UI·라우트·변환 기능별 호출점 조사.
2단계: 인라인 CSS를 converter / file-queue / responsive 모듈로 분리, 기존 CSS 순서와 Vite 의존성 유지.
3단계: 코드·오류 메시지의 사용자용 설명을 분리, 홈페이지 및 공지에서 개발 코드 비노출.
4단계: Cloudflare Worker가 Vite 번들 CSS를 제공하도록 허용 목록 연결.
5단계: 기존·추가 회귀 테스트, 정적 자산 검증, 빌드 및 Cloudflare 배포 결과 확인.
6단계: 25개 원본 실기, PC·모바일 크로스브라우저 검증, 대용량 비교 측정. 미실시 시 개별 미검증으로 명시.
7단계: HTML·문서·커밋·롤백 정보를 Google Drive 프로젝트 폴더에 인계.

## 4. 품질 기준과 실행 명령
cd browser-local
npm ci
npm run check:source
npm test
npm run build
npm run verify:dist
npm run test:dev63
운영에서는 사용자 인증·DB·로그 수집 상태와 /local/ HTML, 해시 CSS, JS, WASM, PDF worker, 글꼴 리소스 경로를 각각 확인한다.

## 5. 실기검증 매트릭스
- HWP/HWPX: 한글 검색·복사, 수식·표·도형·그림, 머리말·꼬리말, 페이지 수, 원본 글꼴, 취소·재시도.
- XLS/XLSX: 다중 시트·병합 셀·수식 계산값·페이지 분할, 120쪽 초과 입력, 큰 파일.
- JPEG/PNG: 방향·비율·투명도·고해상도, 브라우저 메모리·대기시간.
- 대량 처리: 여러 파일 240개 이상, ZIP 무결성, 파일명 중복, 누락/실패 파일 분리.
- 장치: Windows Chrome/Edge, Android Chrome, 일부 기능 제한 시 사용자 안내.

## 6. 위험·대응
- CSS 자산 404: Worker /local/assets/*.css allowlist, 번들 경로 검사.
- 사용자용 안내 제거로 원인 불명: 상세 원인은 로컬 QA 로그/코드에 남겨 추적.
- 비정상 입력으로 메모리 소진: 압축 구조·픽셀·페이지 복잡도 안전 검사 유지.
- 정밀 PDF 지원 제한: 미지원 문서를 성공으로 표시하지 않고 기본/혼합 방식으로 명시적 재시도.
- 실기 누락: 자동 PASS를 시각적 원본 일치로 해석하지 않음.
- 운영 이상: 기존 Worker 배포 버전으로 복구. 데이터베이스 변경 없음.

## 7. 완료 정의
GitHub에 분할 소스와 검증 로그가 존재하고 Cloudflare 빌드·배포 결과가 검증돼야 코드 배포 완료로 판정한다. Windows·Android 실기와 원본 대조를 거쳐야 최종 품질 승인으로 판정한다.
