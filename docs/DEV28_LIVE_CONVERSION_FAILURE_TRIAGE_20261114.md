# Sunrise PDF PRO(Web) DEV28 — 사용자 운영 실기 오류 분석·핫픽스 후보

일시: 2026-11-14 KST. 저장소: `Peter-msk/Sunrise-PDF-Pro-web`.
운영 Worker: `sunrise-pdf-pro-web`. 기존 사용자 실문서·원본 파일은 수집/업로드/복사하지 않았다.

## 1. 운영 D1 익명 메타데이터 — 사용자 보고와 일치하는 시각

KST 2026-11-14 **11:32:29 ~ 11:36:43** 구간 관측.
`pro_telemetry`, `pro_trace_dev4`, `pro_telemetry_progress` **SELECT만 실행**.

- 11:32:29 시작 HWPX, 11:32:33 PDF 완료.
- 11:33:05~11:33:20 XLSX 3건 실패. 당시 오류 `CONVERSION_FAILED`, stage `load`, trace `spreadsheet/read_file`, 시간 2,756ms/203ms/217ms. 이것은 ZIP/파서/레이아웃의 실제 세부 원인을 **구분하지 못한 기록**이고, 반드시 파일 읽기 실패라는 뜻이 아님.
- 11:33:40, 11:34:23 JPG 2건 성공.
- 11:36:03 시작 HWP, 11:36:09 `CONVERSION_FAILED` / `fonts` 1건. 상세 글꼴 오류/원본 서체 미기록.
- 11:36:40 시작 HWP, 11:36:43 `FONT_GLYPH_MISSING` / `svg_preflight` 1건.

선행 독립 검증에서 같은 `FONT_GLYPH_MISSING`으로 실패한 공개 17쪽 HWP가 확인됐지만, 사용자가 실제 시험한 파일과 같다는 근거는 없다.

### 근본 원인과의 구분

**확인된 소스 결함 1**: `browser-local/src/pro-telemetry.js`의 오류 코드 추출 정규식이 `XLSX_*`, `XLS_*`, `FILE_*`를 제외해서, 실제 내부 코드가 이미 존재하더라도 익명 운영 기록은 `CONVERSION_FAILED`로 뭉뚱그렸다. 이 결함은 실제 XLSX 변환 실패의 원인이라기보다 **원인 파악을 가로막은 진단 결함**이다.

**확인된 소스 결함 2**: `browser-local/src/conversion-recovery.mjs`는 `FONT_GLYPH_MISSING`을 회복 대상에서 제외했다. DEV27에는 브라우저 수동 PDF 인쇄 진입점이 있었으나 **파일별 호환 이미지 PDF 다운로드 재시도** 버튼이 없었다.

**미확정 원인**: 실제 XLSX 3건의 근본 오류와 HWP 1건의 `CONVERSION_FAILED/fonts`는 원본 및 상세 사용자 화면 오류 없이 확정 불가. 무근거로 ZIP 안전 제한, 페이지 수, 텍스트 폰트 커버리지 조건을 해제하지 않음.

## 2. DEV28 최소 수정

- `conversion-recovery.mjs`: `FONT_GLYPH_MISSING` HWP/HWPX에만 기존 `compat-raster`를 **사용자 클릭으로** 제안. 프로페셔널/혼합 출력 재실패 이후만 복구 가능, 정상·대기·XLSX·취소 파일은 건드리지 않음.
- `main.js`: 전체 이미지/텍스트 검색 불가를 분명히 안내. SVG 필터는 기존 `hybrid-filter`을 우선함. 기본 professional 엔진·글꼴 무손실 기준을 변경하지 않음.
- `pro-telemetry.js`: `XLSX_*`, `XLS_*`, `FILE_*` 등 안정적인 코드 접두어 식별 보완. 자유 문장·문서명·경로는 전송하지 않음.
- `spreadsheet-pdf.js`: XLSX ZIP 안전검사 `xlsx_package`, SheetJS 파싱 `xlsx_parse`, 레이아웃 `xlsx_layout`을 별도로 표시/익명 기록. 파서/브라우저 모듈 오류는 안정 코드 `XLSX_PARSE_FAILED`, `XLSX_ENGINE_UNAVAILABLE`로 제공. ZIP 콘텐츠 검사·총 확장량·압축률·경로·중복 엔트리 보안 제한은 그대로 유지.
- `src/admin/handler.js`: 3단계 신규 코드만 기존 익명 텔레메트리 허용값에 추가. D1 테이블 및 스키마 수정 없음. 사용자 문서 원문·바이트 서버 송신 없음.

## 3. 실제 파일·브라우저 검증

1. **기존 운영 버전** https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/ 에서 *직접 생성한 비개인정보 XLSX* → 실제 1쪽 PDF(747,742B) 다운로드 성공. 이 사실은 XLSX 엔진이 모든 파일에 대해 중단된 상태가 아님을 뜻할 뿐, 사용자가 실패한 3개를 설명하지 못함.
2. 공개 `edwardkim/rhwp@v0.8.7/samples/basic/issue2007_nested_cell_pagination_42065.hwp`: 전문 `FONT_GLYPH_MISSING` 실패 확인 → **사용자가 직접 `이 파일만 이미지 PDF로 복구` 클릭** → 17쪽, 6,487,376바이트 실제 PDF 유효성/다운로드 검증. 기본 전문 출력 엔진은 변경 없이 유지. 결과 이미지 PDF는 글자 선택·검색 불가.
3. 지정된 후보 commit에 대한 실제 로컬 Worker 묶음에서도 동일한 XLSX/17쪽 HWP 브라우저 검증 실행.

근거:
- 공개 XLSX 운영 실기: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43548057897 (XLSX PASS. 같은 구버전 커밋의 종전 테스트 기대값은 변경된 복구 계약에 맞지 않아 해당 실행의 다른 단위시험 1건 실패; 후속 검증에서 정정).
- 초기 17쪽 복구 및 회귀: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43548551809 — 42 PASS.
- 최종 후보 전체 빌드/통합: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43548922666 — 463건 중 460 PASS, 0 FAIL, 기존 3 SKIP, 추가 회귀 3 PASS, Wrangler dry-run PASS, 실제 로컬 Worker XLSX / 17쪽 HWP PASS.
- 최신 세부 `xlsx_layout` 분류 포함 최종 재검증: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43549230091.

## 4. 남은 게이트 및 출시

- 실제 사용자 XLSX 오류 원본 1개 또는 개인정보 제거본, 그리고 `CONVERSION_FAILED / fonts` HWP 또는 해당 오류 문구가 없어서 **실제 실패 파일별 근본 해결 판정 불가**.
- 문서 첨부가 어려우면 사이트의 실패 행에 표시된 오류 문자열 전체와 파일 확장자/대략적 크기/열 개수/암호 여부를 받으면 구체 원인을 한 단계 더 좁힐 수 있음.
- 사용자 원본의 한컴 기준 PDF 원본 시각동일성 및 Windows 설치 글꼴과의 일치 여부는 미검증.
- 운영 `main`과 Cloudflare Worker는 이 후보 작업 중 수정하지 않음. 사용자가 이전에 요구한 **검증 완료 전 무단 배포 금지**를 준수하여, 사용자 실제 실패 XLSX의 원인 확인 전에는 '모든 PDF 오류 해결'로 승인하지 않음.
- 기존 정상 운영 Worker 롤백 버전을 유지하고, 승인된 수정만 별도 릴리스 게이트로 반영.

**판정: 관측·원인 분류 개선 및 특정 FONT_GLYPH_MISSING 복구 실기 PASS. 사용자 XLSX 및 글꼴 처리의 미확정 사례는 미해결.**
