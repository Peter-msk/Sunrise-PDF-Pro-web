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

## 재점검 추가기록 (2026-11-15)

- 사용자 원본 ZIP 3개는 Files 목록에서 메타데이터 재확인: 결과 PDF ZIP 144,671,673 bytes, 안심글꼴 ZIP 445,523,896 bytes 및 145,509,928 bytes. 압축파일의 내부 문서·글꼴 내용은 파일 분석 런타임 반복 오류로 아직 **직접 검사하지 못함**. 개별 PDF 본문·이미지·임베딩 서체, 안심글꼴 내부 LICENSE 및 원본 대조는 미검증을 유지한다.
- 운영: GitHub main 26ec120a862541518b33fcfe7b49289237a8e1a7, Cloudflare active 5a8f74e4-319a-4e2e-8b15-a0841d802d57, Actions 31개 .paused. DEV36은 Draft PR #35에서만 진행, 미배포.
- DEV36 추가 발견: 기존 WASM 초기화 진행 이벤트에는 페이지 값이 없는데 화면 출력에서 공통 `info.page+'/'+info.total+'쪽'`을 무조건 붙여 `undefined/1쪽`이 노출될 수 있었다. 초기 WASM 시작/완료 익명 진단도 일반 750ms 샘플링 때문에 누락될 수 있었다.
- 대응: WASM `wasm_init`/`wasm_ready`는 필수 진행 이벤트로 전송, 바이트 읽기에는 파일 읽기 백분율, 페이지 렌더링에는 유효한 페이지 번호만 표시. 해당 출력 분기 6개 V8 로직 사례에서 6/6 PASS, 정적 구문 검사 PASS. 전체 npm 빌드·실제 사용 문서는 미검증.
- 글꼴 공식 이용범위 재확인: 문화체육관광부 안심글꼴 서비스 https://www.mcst.go.kr/site/s_policy/subPolicy/contents/contents09.jsp (최종수정 2026-09-29). 무료라는 표시만으로 모든 폰트의 웹 정적 배포/재배포/PDF 임베딩 허용이 동일하다고 가정할 수 없다. 공유마당의 개별 글꼴에 별도 재배포·임베딩 제한 사례가 있으므로 https://gongu.copyright.or.kr/gongu/bbs/B0000018/list.do?bbsSeCd=01&menuNo=200195 에서 실제 선택 파일의 사용 조건 확인 후 대체한다.
- 무검증 폰트 전량 삭제 금지: 기존 NanumGothic/NanumMyeongjo/SunriseSymbols/SunriseMarks 6개는 아직 운영 기본 서체로 필요. 사용자가 제출한 폰트 중 파일·라이선스 검증이 끝난 것만 선택적으로 신규 번들에 포함하고, 원본 서체 매칭과 PDF 검색·임베딩을 검사한 뒤에 기존 번들을 퇴역한다.

## 2026-11-15 후속 단계 — 제출 ZIP 실물 검증 재개 / 폰트 후보 교체 코드

이전 초기 장애 기록의 "첨부 ZIP 미열람"은 당시 환경에 관한 이력이며, 이후 컨테이너에서 **ZIP 3개 열람 및 실제 8개 PDF·124쪽 검사**를 완료했다. 집계만 공개 문서 `docs/DEV36_124PAGE_REAL_PDF_AUDIT_AND_KERIS_OFL_20261115.md`에 반영했다. 개별 PDF 원문, 파일명, 사업명은 GitHub에 업로드하지 않았다.

- 실제 검사: PDF 8개·124쪽 전체 렌더 성공, 문자 없는 7쪽(렌더도 공백), 이미지 참조 49건, 벡터 경로 9,164건, 임베드 글꼴 객체 누락 0건.
- 머리말·꼬리말·표·그림의 존재 확인. 일부 페이지의 머리말/페이지 범위 불일치 의심은 **원본 HWP 부재로 원본 오류인지 변환 오류인지 판단할 수 없다**. 공백 페이지를 임의 삭제하지 않는다.
- KERIS 학교안심 바른바탕 R/B·바른돋움 R/B 4종: 사용자 ZIP의 원본 해시와 고정 미러 해시 대조, 서체의 내부 패밀리명 및 B/R 스타일 확인.
- 보완 Google OFL Noto Sans Symbols 2 1종: 실제 TTF cmap 검사 시 문제 문장부호 12종 가운데 `◦ • ▸ ∘` 4종만 커버. `‧ ‑ ｢ ｣ ․ ･ ⁀ ‿` 8종은 이 5개 폰트로 표시 불가능하므로, 실제 문서의 원본 서체 또는 추가 라이선스 검증된 서체가 필요하다.
- 개발 브랜치에서 기존 6개 폰트 바이너리 제거, 5개 검증된 폰트는 **빌드 시 고정 원본에서 다운로드 + 엄격한 길이/해시 검사 후** Cloudflare 정적 자산으로 포함하도록 구성했다. PDF 생성 엔진/한컴 무설치 계약 유지.
- `pdf-fonts.js`의 `subfamilyName='B'` 문제 수정. `local-fonts.js`는 학교안심 한글·영문 패밀리명 대응.
- 서체 교체로 깨지는 실제 기존 테스트 `r66-pdf-font-embedding-audit.mjs` 및 `multi-format-pdf.mjs`가 참조하는 Nanum TTF를 KERIS 실제 TTF로 교체. 빌드 검증에는 제거된 폰트 자산의 미포함 검사 포함.
- 추가 정적 JS 파싱 및 순수 함수 6건 PASS. **원격 `npm ci/npm test/build/verify:dist`는 아직 실제 실행되지 않음.** 임시 Cloudflare 빌드 트리거 생성은 기존 동일 Worker 트리거 유일성 제약(HTTP409)으로 성립하지 않았으며, 프로덕션 트리거를 변경하거나 실행하지 않았다.

**운영 배포는 이전 DEV35 유지, GitHub Actions 중지 지속.** 실제 학교안심 서체가 포함된 빌드가 성공하고 사용자 원본 문서 품질검수가 이루어지기 전까지 DEV36을 품질 PASS로 승인하지 않는다.
