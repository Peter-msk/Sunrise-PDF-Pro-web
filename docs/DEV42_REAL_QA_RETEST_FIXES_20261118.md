# DEV42 — 2026-11-18 사용자 실기검증 실패 3건 보완

## 실제 입력 근거
- 사용자가 첨부한 `Sunrise_PDF_PRO_Web_QA_20261117162054.json` (생성 UTC 2026-11-17 16:20:54).
- 10개 HWP / 완료 7 / 실패 3. 완료한 7개의 전문 PDF는 총 **123쪽 벡터 / 이미지 페이지 0**.
- 5번: `svg_build`, 81,140ms, `OTHER_ERROR`.
- 8번: `pdf_stream`, 130,017ms, `PDF_STREAM_TIMEOUT`.
- 10번: `load`, 2,477ms, `OTHER_ERROR`.
- 보고서의 `OTHER_ERROR`는 오류 내용을 버린 요약 분류다. **5번을 특정 SVG 한도 초과로, 10번을 페이지 수 초과로 확정할 수 없다.** 이전 브라우저 캡처와 증상이 유사하더라도 동일 원인이라는 보장은 없다.

## 변경
1. `src/local-batch-qa.mjs`: 기존에 `OTHER_ERROR`로 묻혔던 `SVG_RENDER_SOURCE_CHARS_LIMIT`, `HWP_PAGE_COUNT_LIMIT`, `HWP_DOCUMENT_OPEN_FAILED`, `FILE_READ_FAILED` 등의 **고정 오류 코드**를 수락 목록에 추가. PDF 스트림의 폐쇄형 `stream_reason` 및 `stream_integrity` 표시. 원본 쪽수 `source_pages`, 마지막 페이지 `last_page` 수치만 추가. 파일명·본문·경로·임의 오류 전문은 제외.
2. `src/converter.js`: HWP 문서 열기와 페이지 수 검사를 공통 처리하여 0쪽/200쪽 초과/실제 HWP 열기 실패를 구별. 읽기 시도, 파일 읽기, HWP 열기, 페이지 수 검사를 별도의 로컬 진행 단계로 표시. PDF 출력 200쪽과 네이티브 인쇄 120쪽 한도는 유지.
3. `src/main.js`: 진행 단계·원본 페이지 수·마지막 페이지를 파일별로 저장하며 결과 보고서에 사용.
4. `src/pdfkit-backend.js`: 스트림 검증 오류를 `PDF_OUTPUT_...` 폐쇄 코드로 보존. **실제 xref 또는 %%EOF가 없으면 복구 금지**.
5. `src/svg-professional.js`: 브라우저 탭의 타이머 throttling으로 종료 검증 poll보다 timeout이 먼저 실행되는 경우, timeout catch에서 **한 번 더** 완전한 PDF 구조를 검사. 성공한 PDF만 반환하고 원본 대조 경고를 유지. 잘린 PDF는 `PDF_STREAM_TIMEOUT`을 유지하며 안전한 무결성 실패 사유를 포함.
6. `tests/dev42-qa-error-remediation.mjs`: 사용자 QA 보고서의 5·8·10번 실패 형태를 **합성 데이터로** 재현하고, 개인정보 비노출·페이지 수·정확한 오류 코드·완성 PDF 복구·손상 PDF 거부를 검증.
7. `package.json` 표적 `npm run test:dev42` 등록; 전체 `npm test`에도 추가.

## 제한
- 이 보완은 DEV41에서 7/10 성공이었던 원본 문서 3개를 직접 재변환한 결과가 아님.
- 대형 SVG 64 Mi 문자 안전 한도는 유지. 필요 시 해당 실패 문서에만 호환 이미지 복구를 **사용자가 명시적으로 선택**. 글자 검색 불가라는 품질 손실 고지 유지.
- HWP 200쪽 상한 역시 증거 없이 해제하지 않음. 10번이 200쪽을 초과한 것인지 다음 보고서로 판정해야 함.
- PDF stream의 실제 xref 부재가 원인이라면 마지막 구조검사에서도 정상 PDF가 될 수 없으며, 다음 보고서의 `stream_integrity`와 실제 HWP 재시험을 근거로 PDFKit 내부 참조가 완료되지 않은 원인을 조사할 것.
- 사용자 원본 ZIP·파일명·본문은 GitHub에 반영하지 않음.
- Cloudflare 운영 Worker `sunrise-pdf-pro-web`와 D1·관리자 인증은 변경하지 않음.

**현재 단계:** DEV42 최소 수정 + 표적 회귀 검증. 3건의 실제 HWP 성공 수락은 별도 확인 전까지 PENDING.
