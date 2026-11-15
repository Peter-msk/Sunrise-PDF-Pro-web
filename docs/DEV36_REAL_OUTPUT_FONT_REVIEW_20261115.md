# DEV36 — 실기 변환 결과 분석·파일명 표시·안심글꼴 교체 작업

기준일: 2026-11-15 (KST)
기준 운영 배포: Cloudflare Worker `sunrise-pdf-pro-web`, version `5a8f74e4-319a-4e2e-8b15-a0841d802d57`
작업 브랜치: `fix/dev36-file-queue-layout-20261115`

## 제출된 원본 증빙
- `Sunrise_PDF_변환결과.zip`: 144,671,673 bytes. 실제 사용자 변환 PDF 결과 보관
- `안심글꼴_폰트폴더에파일붙여넣기.zip`: 445,523,896 bytes
- `안심글꼴_폰트폴더에파일붙여넣기 (2).zip`: 145,509,928 bytes
- 웹 문서목록 화면 캡처: 파일명은 거의 보이지 않고 PDF 검토/품질/글꼴/다운로드 버튼이 동일한 셀을 점유함

**검증 제약:** 현 실행 환경의 첨부 ZIP 압축 해제 및 PDF 렌더링용 Python/container가 내부 실행 오류로 동작하지 않았다. ZIP의 실제 PDF 본문, 머리말·꼬리말, 표, 그림, 글꼴 임베딩/원본 대비 동일성을 조사 완료했다고 주장하지 않는다. 두 글꼴 ZIP 내부 파일 목록·라이선스도 확인하지 못했다. 원본 HWP/HWPX가 ZIP에 포함되는지 확인 전에는 문서 간 내용 일치도 판정 불가.

## 사용자 증상과 운영 익명 로그
당시 단일 익명 브라우저 세션 집계(개별 파일명을 서버에 수집하지 않음): XLSX 1 성공, HWP 10 시도·7 성공·3 실패. HWP 중 1건 최초 시작 뒤 약 384초가 지나서야 파일 읽기 후속 진단이 나왔고, 총 412.1초에 PDF 생성 성공. 이후 여러 HWP가 약 9~49초에 성공.

오류 분류:
- `SVG_RENDER_SOURCE_CHARS_LIMIT`: 86.7초 후 실패; 생성된 SVG 소스가 페이지당 64MiB 문자 제한을 넘음. 제한을 무조건 높이면 메모리 장애 위험
- `PDF_STREAM_TIMEOUT`: 131.8초 후 실패; PDFKit 스트림 최종 저장 단계 120초 watchdog
- `CONVERSION_FAILED`: 파일 읽기 단계에서 약 3초 후 실패; 상세 고정 코드가 없어 원인 불명확

## DEV36 구현
1. `src/pro-operations-r56.js`: R56의 `body.append(tools)`가 파일명 셀을 가리는 원인 제거. 이름·상태는 별도 셀에 보존, PDF 검토/다운로드/품질/글꼴/삭제 작업은 각 문서 아래 펼침 패널로 이동. 여러 행 동시 확장 방지. aria-expanded/aria-controls 연동
2. `browser-local/index.html`: 독립 개발서버의 동일 CSS를 Worker 스타일과 일치. 파일명을 줄바꿈 가능하게 하고 모바일에서 열 최소 폭 조절
3. `browser-local/src/converter.js`: RHWP WASM 초기화 전후 `wasm_init`/`wasm_ready` 진행단계 및 시간 기록. 파일 읽기와 엔진 초기화를 구별. 실패 코드는 `WASM_INIT_FAILED`
4. `browser-local/src/main.js`, `browser-local/src/pro-telemetry.js`, `src/admin/handler.js`: 단계 안내 및 고정 코드 검증/익명 집계 스키마 일치
5. `browser-local/src/conversion-recovery.mjs`: 큰 SVG/엔진 초기화 실패의 안전한 사용자 조치 안내
6. DEV36 전용 회귀 테스트 6건(파일명/접근성/작업 패널·WASM/진단 코드), `npm test` 목록에 추가

## 검증 이력
- GitHub 개발 소스 7개 핵심 파일 JS 파싱 체크 PASS, package.json/HTML 정적 검사 PASS
- 별도의 Cloudflare Browser Rendering synthetic HTML에서 R56 DOM 재구성, 원본 긴 파일명 유지, 버튼 패널 분리, 작업 토글과 aria-expanded 동작 확인
- **미수행**: 실제 사용자의 144MB ZIP PDF 페이지 렌더링/원본 대조, 2종 ZIP의 폰트·라이선스 검사, npm ci+full npm test, 개발 브랜치 Worker 실배포, 실제 390px/680px 화면 픽셀 렌더 수락 확인
- 사용자의 운영 배포 및 GitHub Actions 중지 상태 유지. 개발 브랜치만 수정

## 문체부 안심글꼴 교체 정책
- 공식 1차 출처: https://www.mcst.go.kr/site/s_policy/subPolicy/contents/contents09.jsp
- 안심글꼴 서비스는 온라인 문서/인쇄/공유 사용을 안내하지만 개별 KOGL/OFL 글꼴의 이용 조건은 서로 다르므로 파일별 라이선스 확인이 필수
- **현재 번들 삭제·대체는 아직 미수행.** ZIP 내용 확인 전 전체 제거는 PDF 변환을 중단시키므로 금지
- 내부 ZIP의 TTF/OTF와 LICENSE/출처를 조사 후 웹 정적 배포와 PDF 임베딩이 허용되는 글꼴만 선별. 원본 문서에 없는 이름을 원본 서체인 것처럼 허위 매칭하지 않음
- 수백 MB 글꼴을 무조건 브라우저에 모두 선로드하지 않음. 필요한 패밀리·굵기·기호에 한정해 지연 로드, 글꼴 파일/출처/라이선스 고지 유지

## PDF 실기 검수 필요 항목
각 문서의 페이지 수, 텍스트 추출 가능 문자 수, 이미지/벡터 PDF 그래픽 리소스, 실제 임베딩 FontFile, 상단/하단 반복 텍스트(머리말·꼬리말) 및 페이지 번호, 표 선/셀/합병, 그림·그림자/회색조, 결측·중복 페이지, 오탈자 및 줄바꿈·표 위치·글꼴을 원본과 교차 검사. 이미지 PDF로 변환된 쪽은 텍스트 검색 품질에서 별도 표시.

원본 PDF 품질 검토와 새로운 안심글꼴 파일 배포가 완료되기 전에는 DEV36을 '전체 완료' 또는 '실기 PASS'로 선언하지 말 것.
