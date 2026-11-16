# DEV38 — 안심글꼴 실제 PDF 문자·임베딩 검수 / QA 수락 게이트

작성일: 2026-11-16 KST
기반 DEV37 R02: `74b08b19caece8ebdbc4b413925fd4a1f483994d`
개발 브랜치: `fix/dev38-real-glyph-pdf-qa-20261116`

## 목표
사용자 제공 안심글꼴 365종(2026-11-15 기록상 ZIP 두 개 내부 548개 형식 파일)의 **특정 8문자만** 확인하는 검사는 충분하지 않다. 실제 변환 결과 PDF의 전체 추출가능 Unicode 문자와 설치·번들 대상 글꼴의 Unicode cmap을 교차 검사하고, 그 뒤 브라우저 SVG/PDFKit 경로에서 실제 텍스트 추출·PDF 임베딩을 확인해야 한다.

## 이번 작업: 실제 수행과 코드 추가를 구분

1. 사용자에게 제공하는 로컬 Python QA 도구 `Sunrise_PDF_PRO_DEV38_R03_안심글꼴_실PDF_문자전수검사.py` 개발.
   - 옵션: `--pdf-zip <PDF결과.zip>` (여러 번 지정 가능), `--out *.json`, 안심글꼴 ZIP 1~N개.
   - **PDF ZIP 안의 모든 PDF에서 텍스트만 읽음**. PDF 본문 문장/파일별 본문은 기록하지 않고 출현 Unicode 코드포인트, 빈 텍스트 페이지 수, 검색가능 문자별 횟수 및 글꼴 지원 face 수만 로컬 JSON에 기록.
   - ZIP에서 직접 메모리 로딩, 영구 압축 해제·외부 업로드·네트워크 불필요. 글꼴별 SHA-256, 패밀리, 굵기, fsType(임베딩 제한 메타데이터)을 함께 기록.
   - 검사하지 못한 EOT, 암호화, 손상/과대 파일이 있으면 `PARTIAL`. 코드포인트가 불일치하면 `GLYPH_COVERAGE_INCOMPLETE`. 사용자가 선택한 입력 ZIP 경로와 JSON 출력 경로가 같으면 거부.
   - **이 Python 도구는 이 대화의 개발 산출물**이며 GitHub 브랜치 안에 Python 파일을 올렸다고 주장하지 않는다.
2. 실제 외부 라이브러리 기반 오프라인 합성 PDF 테스트:
   - 공개 글꼴 샘플 Noto Sans Regular(512672 byte), Noto Sans Yi Regular(182808 byte) 사용. 고정된 DEV37 번들 TTF와 해시가 **다른 샘플**.
   - 시험용 1페이지 PDF에서 8개 글자 `‧-｢｣․･⁀‿`를 글꼴 선택하여 출력, `PyMuPDF`에서 **8/8 글자 그대로 추출**, PDF에 **2/2 글꼴 임베딩 데이터 존재**, Poppler 렌더 1/1 성공 및 그림 육안 확인.
   - 시험용 PDF 1개를 포함한 ZIP에 로컬 R03 검사기 실행: PDF 1 / 1쪽 / Unicode 8종 / 후보 2개 / 누락 0 / COMPLETE.
   - 다른 합성 PDF(문서 1개·2쪽, 빈 텍스트 쪽 1개) 검증: PDF 1개/2쪽/빈 텍스트 1쪽/실사용 문자 17종/원래 필수 8종 포함 총 24종 검사; 누락 0.
   - 글꼴 ZIP 2개/2 face 정상 검사 시 종료 0. EOT 및 비정상 WOFF 포함 불완전 ZIP: PARTIAL 종료 3. PDF 없는 잘못된 ZIP을 `--pdf-zip` 지정할 경우 종료 2.
3. GitHub에 `browser-local/tests/dev38-actual-svg-font-pdf.mjs` 추가:
   - 기존 고정 글꼴 **7개를 실제 바이너리로 읽고 SHA/크기 검증** 후 `fontkit` 파싱.
   - 기존 `preflightProfessionalSvg`, `resolveFont`, `svg-to-pdfkit` + `pdfkit` 경유, 원래 8글자의 vector SVG를 조합·출력.
   - `inspectPdfFontEmbedding`과 `compareSelectedAndEmbedded`로 실제 선택한 fontCallback 자원의 PDF 임베딩 검사.
   - `pdfjs-dist`로 ToUnicode 텍스트 추출을 검사; 글꼴 없는 문자를 조용히 바꾸면 실패 처리.
   - `browser-local/package.json`의 기본 `npm test`에 새 테스트 등록하고 별도 `npm run test:dev38` 추가.
   - **신규 JS/JSON 구문 검사 PASS**. Node 전체 의존성 설치·실제 본 신규 npm 테스트 실행은 아직 미실시. 따라서 npm 테스트 PASS로 표기하지 않는다.

## 배포와 사용자 데이터 보호
- 실제 고객 HWP/HWPX/폰트 바이트를 서버로 올리지 않음. 공개 샘플 기반으로만 시험 진행.
- 현재 라이브 배포·main 병합·GitHub Actions 활성화 없음.
- 365종/548글꼴 사용자 ZIP은 기록·기존 메타데이터만 확인 가능하고, 원본 ZIP 재접근이 제한되어 **전수 cmap 분석 미수행**.
- 실제 HWP/HWPX 25개 실문서, 8개 PDF/124쪽 원본과 시각 정합성 검증 미수행.
- 실PDF에서 텍스트를 찾을 수 있다고 해서 정확한 HWP 글꼴·폰트폭·표 줄바꿈·색·윤곽·이미지 유사성을 보장하지 않음.

## QA 게이트
| 항목 | 판정 |
|---|---|
| 원래 8문자 코드포인트 정정 및 font fallback 선택 | 기성 DEV37 선별 PASS |
| PDF ZIP 내용 기반 전체 코드포인트 분석 유틸리티 | 합성 fixture PASS |
| 실제 샘플 PDF 생성·8/8 텍스트 검색·2/2 임베딩·렌더 | PASS(별도 PDF 생성기, 배포 번들과 버전 다름) |
| GitHub DEV38 실제 웹 SVG-to-PDFKit 회귀시험 코드 및 npm 명령 | 작성·정적 구문 PASS |
| GitHub DEV38 신규 npm 실 실행 | **PENDING** |
| 실제 DEV38 고정 TTF 실PDF 생성·ToUnicode·글꼴 임베딩 | **PENDING** |
| 사용자 365종 ZIP 전수·실문서 25개 및 PDF 124쪽 육안 비교 | **PENDING** |
| Cloudflare 운영 배포 | **보류** |

## Windows Miniconda 사용 방법
```bat
conda create -n sunrise-font-audit python=3.12 -y
conda activate sunrise-font-audit
python -m pip install fonttools brotli pymupdf
python Sunrise_PDF_PRO_DEV38_R03_안심글꼴_실PDF_문자전수검사.py --out safe_font_coverage.json --pdf-zip "Sunrise_PDF_변환결과.zip" "안심글꼴_폰트폴더에파일붙여넣기.zip" "안심글꼴_폰트폴더에파일붙여넣기 (2).zip"
```

## Node QA의 우선 실행 순서 (사용자 클릭 불필요)
```bash
cd browser-local
npm ci
npm run test:dev38
npm run test:local
npm run build
npm run verify:dist
```
개발 컨테이너에서 외부 npm/git DNS 연결 불가. GitHub Actions는 사용자 지시로 비활성 상태이므로 어떤 워크플로도 다시 켜지 않는다.

## 후속 조치
1. ZIP 원본 접근 재허가/재제공 가능한 환경에서 위 로컬 검사기 실행 후 **전체 문자 지원 + 라이선스 허용 여부**를 구분.
2. Node 로컬 의존성 확보 시 신규 DEV38 실PDF 테스트 및 해당 변경 영향범위 중심 회귀 수행.
3. 실제 사용자 HWP/HWPX 25개 실행, PDF 전체의 머리말·표·그림·빈 페이지·검색·복사·폰트 동일성 검수.
4. 명시적 사용 승인 후에만 배포 검토.

**DEV38 판정:** 신형 QA 도구 및 저장소 자동검증 코드 준비, 합성 PDF 검증 통과. 웹 실제 출력과 전체 사용자 원본 수락/정식 배포는 미완료.


## R04 후속 점검 (2026-11-16)

**DEV38 테스트 자체의 결함 수정:**
- `tests/dev38-actual-svg-font-pdf.mjs`의 PDF `FontFile` 존재 검사가 문자 그대로의 `\\n` 때문에 주석에 흡수된 문제를 발견, 실제 실행되는 독립 assert로 복구.
- fontCallback에서 선택한 각 PDF 서체를 `pdfResourcePresent`, `embedded`, `pages:[1]` 단위로 개별 검사. '선택 글꼴 없음'의 공허한 성공은 `used.size>=4`로 방지.
- 이미지 XObject가 있으면 기본 전문 벡터 변환을 FAIL로 판정하는 검사 추가.
- 검증 문자열을 원래 문제 문자 8개에 기존 Noto Symbols 2가 지원한 4개 `◦ • ▸ ∘` 및 한글 본문 `한글/문서`를 합친 **총 12개 특수문자+한글 혼합**으로 확장. 동일 글꼴 파일 각각의 이종 문자 선택이 실제로 작동해야 통과.
- 전혀 지원하지 않는 문자 `🪼`가 포함된 SVG는 조용히 다른 문자로 바꾸지 않고 사전검사에서 FAIL 하는 회귀시험 추가. timeout 45초 설정.
- 수정을 저장소에 반영하고 JS 구문 검사 및 비교 대상 소스 존재 확인. **Node 실제 `npm run test:dev38` 실행은 환경의 GitHub DNS/의존성 부재로 미실시.**

**독립 PDF 생성기 검증:**
- ReportLab + PyMuPDF + fontTools(브라우저 엔진과 별개)를 사용해 사용자 원본을 포함하지 않는 1페이지 합성 PDF 생성.
- 최초 시험은 테스트용 글꼴 alias `Symbol`이 ReportLab 기본 `Symbol`과 충돌하여 `▸`와 `∘`가 `I`로 추출됨. 이 초기 시험을 실패로 기록하고 전용 이름 `Symbols2Test`로 교체.
- 수정 후 **12/12 특수문자 PDF 텍스트 추출**, 한글 `한글`·`문서` 추출, **4개 글꼴 임베딩 프로그램 확인**, **0 이미지 XObject**, 1쪽 PNG 렌더 성공. 또한 생성 PDF의 텍스트가 추출 가능함을 확인.
- 이는 **다른 버전의 공개 샘플 글꼴 + 별도 PDF 엔진**의 시험으로 **실제 Sunrise 브라우저 PDF 변환 PASS를 뜻하지 않음**. 글자 위치·서체 폭·표 일치·원본 대비 품질은 미검증.

**추가로 실제 재실행한 독립 R03 CLI:**
```
FONT_AUDIT_GLYPH_COVERAGE_CANDIDATES_FOUND audit=COMPLETE fonts=2 faces=2 target_codepoints=8 uncovered=0 pdf_pages=1
```
- 위 검사는 임의 합성 ZIP의 정상 동작만 증명하며 사용자가 제공한 365종 글꼴 ZIP의 전수검사 결과가 아니다.
- 사용자가 제출한 ZIP 원본 바이트 재접근 불가, 웹 앱 전체 npm 빌드 미실행, HWP/HWPX 원본 25개와 124페이지 시각 비교 미실시, GitHub Actions·main·Cloudflare 운영 배포 불변.

**게이트 판정: DEV38 R04 테스트 코드 수정 완료 / 합성 PDF 별도 엔진 검증 PASS / 웹 정식 엔진과 원본 품질 PENDING.**


## R04 추가 단일 PDF 전체 문자 검사
- 1쪽 공개 글꼴 합성 PDF `한글◦•▸∘‧-｢문서｣․･⁀‿`를 ZIP에 담고, 공개 글꼴 4파일(Nanum Gothic, Noto Sans Symbols 2, Noto Sans, Noto Sans Yi)과 R03 오프라인 검사기를 실제 실행함.
- **출력**: `FONT_AUDIT_GLYPH_COVERAGE_CANDIDATES_FOUND audit=COMPLETE fonts=4 faces=4 target_codepoints=34 uncovered=0 pdf_pages=1`.
- PDF에서 추출되는 제목 및 실제 글을 포함해 서로 다른 문자 **34종/34종 후보 지원**. 프로그램이 글꼴 지원 후보를 정확히 탐색했음을 보여주지만 원본 HWP와의 글꼴 메트릭·레이아웃 동일성은 증명하지 않음.
- 데이터는 사용자 원본이 아닌 합성 표본이며, 사용자 제공 글꼴 365종 전수 검사의 결과라고 표시하지 않음.
