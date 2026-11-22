# Sunrise PDF PRO(Web) 인수인계서
작성일: 2026-11-22
담당 작업: 소스 모듈 분리, 사용자 화면 기술 표현 정리, 기능/회귀 감사
저장소: https://github.com/Peter-msk/Sunrise-PDF-Pro-web
개발 브랜치: feat/dev63-modular-ui-clean-release-20261122
이전 확정 운영 버전(DEV62): Cloudflare Worker f91f4d0b-4bb2-4044-89f4-67bbbb8a34bc
이전 코드 기준: 8724b1dd9a301692a8140c2a323a4ae91eef9d91
신규 배포 빌드 요청: 4d6452bd-6756-4825-952f-5895290314a7
주의: 작업 중 빌드/배포/실기 판정은 실측 상태로만 갱신해야 한다.

## 1. 작업 구현 내역
- 원래 browser-local/index.html 안의 CSS 3종을 browser-local/src/styles/의 converter.css, file-queue.css, responsive.css로 추출.
- HTML에는 화면 마크업 및 외부 CSS/JS 참조만 남김.
- main.js에서 사용자 표시용 개발 버전 및 문서 제목 개발 꼬리표 제거. 숨겨진 로컬 QA 출력 기능은 내부 검증 경로로 유지.
- user-output-copy.mjs에 사용자용 출력 방식·오류 텍스트를 정리. 원본 오류 및 복구 판정은 손실하지 않음.
- site-home.js와 site-updates.js의 일부 기술 용어를 사용자용으로 치환.
- Worker에서 /local/assets/의 해시 CSS 제공 경로 허용. 임의 JS·소스맵 등은 제공하지 않음.
- GitHub Actions 사용 안 함. 관리자 DB 스키마/데이터 변경 안 함.

## 2. 기준 기능
한글(HWP/HWPX), Excel(XLS/XLSX), JPG/PNG PDF 변환, 일괄 처리, 개별 PDF 및 ZIP 다운로드, 페이지 미리보기, 취소, 실패 파일 재시도, 글꼴 선택·확인, 웹 관리자·공지. 기본 모드는 객체·텍스트 보존 방식. 실험적인 정밀 방식은 일부 문서에서 지원되지 않을 수 있음.

## 3. 검사 항목
- src/styles 3개 실제 생성 및 CSS 링크가 Vite에서 자산으로 구성되는지.
- 정적 자산 /local/assets/*.css 및 /local/assets/local-bundle.js /local/pdf-worker.mjs 응답.
- DEV/R/QA 문구가 사용자 페이지/문서 제목/출력 상태에서 노출되지 않는지.
- 기존 단위/회귀 및 새로운 UI 모듈 테스트 전부 통과하는지.
- 브라우저 실제 변환, 첨부 PDF 다운로드, 페이지 수, 한글 검색 여부.
자동 시험은 실제 운영 기기와 원본 25개 문서의 시각적 동일성을 증명하지 않는다.

## 4. 재현·배포
git fetch origin
git switch --track origin/feat/dev63-modular-ui-clean-release-20261122
cd browser-local
npm ci
npm run check:source
npm test
npm run build
npm run verify:dist
npm run test:dev63
Cloudflare 배포는 기존 Worker의 수동 Builds 트리거로 지정 커밋을 사용한다. GitHub Actions/관리자 DB 변경은 없다.

## 5. 복구 및 후속 조치
Cloudflare Workers ‘sunrise-pdf-pro-web’의 이전 운영 버전 f91f4d0b-4bb2-4044-89f4-67bbbb8a34bc를 롤백 기준으로 보존한다. 롤백은 코드·정적자산에 한정되며 별도 스토리지 변경 복원은 보장하지 않는다. 운영 페이지 오류, CSS 누락, 변환 결과 오류가 확인되면 새 코드 배포 중단·기존 버전 복구 후 실패 로그를 조사한다.
미검증: 25개 실제 원본의 비교, 물리 Windows/Android 전체 실기, 큰 파일 메모리/속도 비교, 일부 정밀 PDF 특수 객체. 필요 시 개인 정보가 포함되지 않은 오류 코드 및 사용자 실기 결과로 보완한다.

## 6. 파일 인계
- GitHub 기준 소스: 위 브랜치와 커밋 SHA.
- Google Drive 대상: 9. Sunrise PDF PRO(web).
- 업로드 대상: 최신 index.html(관련 CSS·JS 분리 소스는 GitHub), 작업지시서, 개발계획서, 인수인계서.
- HTML 단독 다운로드는 외부 CSS·JS·WASM 없이 기능 실행되지 않는다. 브라우저 실행은 Cloudflare 서비스 URL을 사용한다.

## 7. 공개 공지 및 기술 표현 표시 정책
- src/public-release-copy.js의 publicPublicationRecord 함수는 공개 API 응답의 제목·본문에서 DEV, R, QA, WASM, RHWP 형태의 내부 표기를 제거한다.
- src/admin/handler.js는 공개 공지/업데이트 조회에만 이를 적용한다. 데이터베이스의 원본 기록과 관리자 게시물 조회는 수정하지 않는다.
- src/site-updates.js도 실제 사용자 화면에서 내부 표기를 필터링하며, 장애가 발생해도 저장된 게시물은 변경하지 않는다.
- 이 수정 사항은 사용자 표시 계층에 한정되며 관리자 내부 진단·검증·문제 추적 정보는 유지한다.

## 8. Google Drive 인계 확인
- 폴더: https://drive.google.com/drive/folders/1ewq2W8ln78rZxw5O7wIudlB_q1Co-3F1
- 최신 HTML: https://drive.google.com/file/d/1ZIMkQK9W43SbNnVGkJp4IXxfVuef2c8B/view
- 작업지시서: https://docs.google.com/document/d/1P_ZBSUVTP9zFy7CL1R8NfyUrg85I2lYvSf7-yKzazDY/edit
- 개발계획서: https://docs.google.com/document/d/1iR7SSEVL8RTGHSA2xarurCbxT8oJ2482l1SPlKwe2UU/edit
- 인수인계서: https://docs.google.com/document/d/1TumOihZfofcSTVwbfusL3NxUJl33RtfV48_7rNiicCo/edit
- HTML과 세 문서는 Google Drive에서 같은 부모 폴더 소속임을 조회해 확인했다. HTML은 CSS·JS 분리 소스와 서버 자산 없이 단독 실행할 수 없다.
