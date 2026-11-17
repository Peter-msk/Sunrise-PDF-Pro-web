# Sunrise PDF PRO(web) DEV40 — 원본 PDF 대비 실문서 품질 수락 게이트

작성일: 2026-11-16 KST  
기준: DEV39 `0f41930231286cd135182225ddc651771d504a0a`  
개발 브랜치: `fix/dev40-original-pdf-acceptance-20261116`  
운영 변경: 없음 (GitHub Actions 재활성화/PR 병합/Cloudflare 배포 금지)

## 범위와 원칙

원본 HWP/HWPX를 **동일 문서의 기준 PDF로 내보낸 것**과 Sunrise 변환 PDF를 일대일 비교한다. 기존 PDF 8개·124쪽에서 렌더 빈 페이지 7쪽의 원인을 검증하려면 실제 원본 기준 PDF가 필요하다. 동일한 PDF 두 개로 검사기를 테스트하는 것과 실제 HWP 원본 대비 품질 수락은 엄격히 구별한다.

## P0: PR #35~#38 변경 파일 영향 목록 실제 확인

- **PR #35 DEV36 / `main` 기반:** 34개 변경 경로. 웹 UI(`src/main.js`, `index.html`), 변환(`converter.js`, `pdf-fonts.js`), WASM 초기화·로컬 글꼴, Worker 자산/운영 처리(`src/worker.js`, `src/admin/handler.js`)가 함께 포함. 앱·서버·자산 경계 회귀 위험.
- **PR #36 DEV37 / DEV36 기반:** 11개 변경 경로. 승인 글꼴 설치기·해시·Worker allowlist·글꼴 선택/계약 중심.
- **PR #37 DEV38 / DEV37 기반:** 3개 변경 경로. 실제 SVG-PDFKit 글꼴 임베딩 테스트 및 실행 스크립트.
- **PR #38 DEV39 / DEV38 기반:** 4개 변경 경로. `svg-professional.js` 글꼴 구간 분할과 관련 테스트.
- 위 파일 수는 PR별 변경 목록으로 **합계가 고유 파일 수가 아님**. 실제 변경 영향 경계를 분류한 것으로 병합 가능성·전체 QA PASS를 뜻하지 않는다.

## DEV40 실제 개발: 원본 PDF 대비 자동 품질검사기

개발 산출물 이름: `Sunrise_PDF_PRO_WEB_DEV40_원본대조QA_검증패키지.zip`. **Python 소스와 테스트는 이번 대화의 사용자용 ZIP에 생성**되어 있으며, GitHub 저장소에는 이 Markdown 증거 기록만 추가한다. 이 사실을 혼동하지 않는다.

스크립트: `sunrise_dev40/dev40_pdf_visual_acceptance.py`; 테스트: `sunrise_dev40/test_dev40_pdf_visual_acceptance.py`.

기능:
1. 두 PDF의 쪽수·쪽 크기·Unicode 텍스트·단어 좌표(최대 이동 pt) 비교.
2. 96 DPI 그레이스케일 렌더 픽셀 차이 MAE·차이 픽셀 비율 비교.
3. 시각적으로 빈 대상 쪽, 기준 텍스트 누락, 후보 PDF 글꼴 프로그램 임베딩 누락, 벡터 감소·이미지 대체 의심 탐지.
4. **반드시 필요한 문서 8개와 124쪽**에 대해 `--require-files 8 --require-reference-pages 124`로 누락 자료를 자동 차단.
5. 25문서 비교는 25쌍의 기준/변환 PDF를 준비한 뒤 `--require-files 25` 설정. 서로 다른 문서명은 짝지을 수 없으므로 basename을 일치시켜야 한다.
6. 파일명·본문·절대경로는 JSON 출력에 저장하지 않고 해시 ID·숫자 지표·검사 사유 코드만 남긴다. 로컬 기기에서만 실행되며 클라우드 업로드 없음.
7. `VISUAL_REVIEW_REQUIRED`(자동 차단 없음)과 `BLOCKED`를 구분. 전자는 **사람의 시각적 원본 비교가 여전히 필요하다는 뜻**이며 `ACCEPTED`나 `DEPLOYED`로 해석 금지.

독립 합성 공개 글꼴 PDF 기반 **실행 12/12 유닛 시나리오 PASS**, ZIP 무결성 PASS.

| 실행한 시험 | 결과 |
|---|---|
| 동일 내용 PDF 이미지 차이 0 | 정상적으로 VISUAL_REVIEW_REQUIRED |
| 기준 PDF에 텍스트 있음·대상 쪽 공백 | BLOCKED |
| 대상 PDF 페이지 추가 | BLOCKED |
| 벡터 본문을 이미지로 전환한 대상 | BLOCKED |
| 대상 PDF 페이지 크기 불일치 | BLOCKED |
| 대상 PDF 텍스트 내용 차이 | BLOCKED |
| 기준 PDF와 같은 입력 파일 오류 | BLOCKED |
| JSON에 본문·파일명·경로 비노출 | PASS |
| 기준/대상 파일명 짝 누락 | BLOCKED |
| 8파일·124쪽 요구인데 1파일 제출 | BLOCKED |
| 1파일·1쪽 요구 충족 | 정상적으로 VISUAL_REVIEW_REQUIRED |
| 문자는 동일하고 좌표 10pt 차이 | WORD_POSITION_CHANGED + VISUAL_PIXEL_DIFFERENCE |

## 미완료 및 우선순위

| 단계 | 현황 | 수락 조건 |
|---|---|---|
| P0 변경 영향 파일 목록 | 인벤토리 완료, 실제 제품 전체 영향 검증은 미완료 | DEV36~39 전체 리그레션 |
| P1 Node 빌드 및 전체 테스트 | BLOCKED: 실행 컨테이너에서 npm DNS 실패, 의존성 없음 | `npm ci`, `npm run test:local`, `npm run build`, `npm run verify:dist` PASS |
| P2 새 안심 글꼴 실제 브라우저 임베딩 | 미완료, 독립 시험만 통과 | 실제 PDFKit 출력·ToUnicode·검색/복사 및 12종 글리프 PASS |
| P3 PDF 8개·124쪽 원본 비교 | 자동검사 도구 12/12 PASS, **실제 기준 PDF 미제공** | 원본과 8쌍 124쪽 일대일 검수, 빈 페이지 7쪽 근거 판정 |
| P4 HWP/HWPX 25개 실기 | 미완료 (종전 22시작/13성공/8실패/1종료 미대응 기록) | 25/25 진행·결과·품질 수락 증거 |
| P5 PC/모바일 UI | 미완료 | Windows Chrome + 모바일 너비 실기 클릭/다운로드 |
| P6 릴리스 | 보류 | 위 증거, 보안/롤백, 사용자 명시 승인 |

### 개발 PC Miniconda 실행 예

```bat
conda create -n sunrise-pdf-qa python=3.12 -y
conda activate sunrise-pdf-qa
python -m pip install "pymupdf==1.26.7" "numpy==2.3.5"
python dev40_pdf_visual_acceptance.py --reference-dir "D:\\PDF_원본기준" --candidate-dir "D:\\PDF_Sunrise" --require-files 8 --require-reference-pages 124 --out "dev40_8files_124pages.json"
```

실제 HWP/HWPX·한컴 기준 PDF가 없이 생성한 12 PASS는 **검사기의 단위검증**이지 변환기의 정식 합격이 아니다. 본 DEV40은 프로그램의 실제 출력 경로를 고치거나 운영 중인 파일을 수정하지 않는다.
