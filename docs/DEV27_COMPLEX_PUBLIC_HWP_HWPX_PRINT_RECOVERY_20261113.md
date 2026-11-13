# Sunrise PDF PRO(Web) — DEV27 복잡 HWP/HWPX PDF 복구 및 SVG href 별칭 보완

- 검증 날짜: 2026-11-13(KST)
- 저장소: `Peter-msk/Sunrise-PDF-Pro-web`
- 개발 브랜치: `dev/dev27-p0-baseline-audit-20261113`
- 결과: **실제 공개 복잡 HWP 17쪽 + 공개 복잡 HWPX 46쪽 Chromium PDF 생성 PASS**
- 운영 main / Cloudflare Worker / D1: 변경 없음
- 검증 범위는 **공개된 rhwp v0.8.7 샘플**이며, 사용자가 밤에 변환한 실제 25개 원본 파일 또는 정식 한컴 PDF와의 시각 정합성은 포함되지 않음.

## 1. 단순 공개 HWP/HWPX — 실제 PDF 양측 정밀 비교

기존 PASS 시험의 수준을 높여, 전문 SVG/PDFKit 경로와 브라우저 인쇄 SVG의 독립 Chromium PDF 산출물을 비교했다. 브라우저 인쇄 시험은 실제 `native-print.js`의 HTML/SVG 내용을 별도 인쇄 페이지에 복제해 `printToPDF` 실행한 구조 시험이며 **운영체제 PDF 저장 대화상자 자체를 자동화한 것은 아니다**.

| 항목 | 공개 HWP | 공개 HWPX |
|---|---:|---:|
| 전문 PDF | 8,383B, 1쪽 | 8,354B, 1쪽 |
| Chromium print PDF | 5,994B, 1쪽 | 7,915B, 1쪽 |
| 양쪽 텍스트 추출 건수 | 3 | 2 |
| 양쪽 추출 문자 수 | 100 | 18 |
| **추출 글자 내용 SHA-256(앞 24 hex) 동일** | PASS | PASS |
| 페이지 크기 전문가 출력 | 595.28 × 841.88pt | 595.28 × 841.88pt |
| Chromium 출력 | 594.96 × 841.92pt | 594.96 × 841.92pt |
| 페이지 크기 편차 허용 0.5pt 이내 | PASS | PASS |
| PDF.js image-paint operation | 양쪽 0 | 양쪽 0 |

최종 구조 시험 관련 GitHub Actions:
- https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43432756548 (기본 PDF 구조 PASS)
- https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43433382420 (문자열 해시와 치수 강화: 기본 두 건 PASS, 복잡 HWP의 전문 PDF 글꼴 누락 확인)
- https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43433734175 (원래 전문 PDF 실패 건과 인쇄 복구를 분리하여 기록. 복잡 HWP 17쪽 복구 PASS, 복잡 HWPX의 중첩 SVG 안전검사 실패 발견)

## 2. 공개 복잡 HWP 복구 — 기본 출력의 FONT_GLYPH_MISSING과 분리

`edwardkim/rhwp@v0.8.7/samples/basic/issue2007_nested_cell_pagination_42065.hwp` (약 50.5KiB)

- 원래 `professional` 경로: 8쪽 `FONT_GLYPH_MISSING`; 기본 벡터 PDF **실패**.
- 기존 안전한 `renderNativePrintPages` → Chromium 인쇄 경로: **17쪽 유효 PDF 생성 성공**.
- 추출 텍스트: 1,265자, 753개 text item.
- 출력 PDF: 480,666바이트, A4 근접 페이지(594.96 × 841.92pt).
- PDF.js image-paint operation 0 (해당 연산 카운트에 대한 결과이지 모든 모양이 원본과 동일하다는 보장은 아님).
- 실제 한컴 기준 PDF, 사용자 PC 글꼴, 모든 표 셀과 줄바꿈의 동일성 미검증.

## 3. 공개 복잡 HWPX의 첫 쪽 SVG 외부 참조 거부 원인

`edwardkim/rhwp@v0.8.7/samples/SO-SUEOP.hwpx` (약 131.2KiB, WASM pageCount 46)

수정 전 인쇄 준비: `문서 SVG의 외부 자원 참조는 허용되지 않습니다.`

실제 공개 자료에서 약 40쪽까지 검사했고, 첫 페이지 SVG에는 `data:image/svg+xml;base64,...` 형태의 삽입 SVG 그림이 존재. 기본 검사기는 `<image>`의 **SVG2 `href`와 레거시 `xlink:href`가 함께 있는 경우**를 정규화하지 못했다. `src/svg-embedded.js` 기존 코드는 `refs.length===1`만 중첩 SVG 펼침 대상으로 삼았으므로, 이중 별칭은 여전히 최종 SVG 보안 경계로 넘어가 `data:image/svg+xml`을 외부 리소스처럼 거부했다.

## 4. 코드 수정: 안전한 동등 별칭만 확장

변경: `browser-local/src/svg-embedded.js`

- **`href`와 `xlink:href`가 모두 존재하고, 두 문자열이 동일하며, 각각의 XML namespace가 SVG 일반/정식 xlink인 경우에만** 기존 `data:image/svg+xml;base64` 중첩 펼침 허용.
- 중첩 SVG 디코딩 크기/개수/깊이, ID 중복, CSS/스크립트/외부 URL 차단, 내부 ID 재정의, 물리적 비율 검사는 기존 구현을 재사용. 새 보안 우회나 일반 외부 URL 허용 없음.
- 두 별칭이 서로 다른 원본을 가리키는 경우나 악성 SVG를 포함한 경우는 계속 **fail-closed**.
- 원본의 빈 이미지·누락 그림을 임의로 생략해 PDF를 성공으로 위장하지 않음.
- 새 외부 의존성, 전역 플래그, Worker API 및 D1 스키마 변경 없음.

수정 대상:
- `browser-local/src/svg-embedded.js`
- `browser-local/tests/svg-embedded.mjs` (새 정합·안전성 검사 3종)
- 공개 샘플 구조·오류 분류 테스트와 개발 전용 CI.

집중 테스트: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43436162642  
결과: **전체 10건 중 9 PASS, 0 FAIL, 1 SKIP** (`pdftoppm` 실행 의존 테스트는 이번 러너에서 생략됨).

## 5. 수정 후 46쪽 실제 공개 HWPX 전체 복구

https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43436314260

수정 후 실제 결과:
- 기본 전문 PDF 변환: **4쪽 `FONT_GLYPH_MISSING`**, 여전히 전문 출력 실패.
- 브라우저 인쇄 경로: **46/46쪽 모두 Chromium PDF로 출력 성공** (4,702,361바이트).
- PDF.js 텍스트 추출: **68,813자**, 38,960개 text item.
- 페이지 미디어박스: 46쪽 모두 약 594.96 × 841.92pt.
- PDF.js image-paint operation 0 (완전한 벡터 정합성 보증이 아니라 테스트 수치).
- 인쇄용 SVG 프레임 생성·안전 보안 경계 이후 실제 PDF 바이트 생성과 페이지 수까지 검증.
- 실기검증 통과 판정: `RECOVERY_PATH_PASS`, **기본 전문 PDF 성공으로 오인하지 않도록 분리**.
- 사용자 원본 25개 중 지난밤 오류 8건의 해소 여부는 알 수 없음. 동일한 SVG 모양의 오류가 원본에도 존재하는 경우에만 이번 코드 변경이 직접 영향을 미침.

## 6. 현재 남은 위험과 다음 개발 우선순위

1. 전문 PDF의 `FONT_GLYPH_MISSING`은 이번 패치로 해결되지 않았다. 사용자 PC 설치 글꼴과 원본 HWP 글꼴 매칭 경로를 별도 실환경에서 점검해야 한다. 강제 대체 글꼴은 전문 경로에서 조용히 선택하지 않는다.
2. 브라우저 인쇄 프레임 → 독립 Chromium `printToPDF`는 실기검증했으나 실제 Windows OS 인쇄 대화상자에서 최종 저장을 확인한 결과는 아니다.
3. 인쇄용 SVG를 별도 페이지로 복제하는 과정에서 동적으로 등록한 `FontFace` 객체를 복제하지 않는다. 해당 시험으로 시각적/한컴 글꼴 동일성을 주장하지 않는다.
4. 원본 HWP/HWPX의 기준 한컴 출력과 비교한 글자폭·줄바꿈·표·그림·페이지별 시각 차이 시험은 남아 있다.
5. CI 및 공개 샘플 결과와 운영 데이터는 분리. 사용자 승인 전 GitHub main 병합 및 Cloudflare production 배포 없음.

**최종 판정: 개선한 보안 경계를 통한 46쪽 공개 HWPX 브라우저 인쇄 PDF 전체 출력 검증 성공 / 전문 PDF 글꼴 오류는 별개 / 실제 사용자 문서 및 한컴 출력 동일성 미입증 / 운영 배포 보류.**
