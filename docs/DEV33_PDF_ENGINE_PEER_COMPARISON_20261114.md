# DEV33 — 다른 PDF 변환 저장소 교차 비교 및 엔진 보완 결정
작성일: 2026-11-14 KST
프로젝트: Sunrise PDF PRO(Web)
상태: 개발 브랜치. 운영 배포 미실행, GitHub Actions 재활성화 금지.

## 1. 비교 목적 및 제품 불변조건
사용자 25개 HWP/HWPX 실기에서 SVG_FILTER_EFFECT_UNSUPPORTED 실패가 8건 기록되었다.
이 결과는 익명 D1 이벤트 22 시작, 13 성공, 8 실패를 근거로 하며, 25개 원본
전체 파일별 확정 성공/실패 수는 아니다. 단위시험 460 PASS가 실사용 성능·충실도를
증명하지 않는다는 문제가 반복되었다.

불변조건:
- 원본 HWP/HWPX와 글꼴 바이트는 사용자 브라우저에서 처리. 원격 업로드 금지.
- 기본 professional 모드는 글자·벡터 객체 보존, 불확실하면 fail-closed.
- raster / hybrid는 사용자가 명시적으로 선택한 경우에만 실행.
- 성공한 다른 파일은 실패 파일의 재시도 중 변경하거나 다시 만들지 않음.
- 유효하지 않거나 불완전한 PDF를 성공으로 노출하지 않음.

## 2. 비교한 관련 GitHub 저장소

| 저장소 | 실제 역할과 방식 | Sunrise에 적용 가능한 점 | 채택 결론 |
|---|---|---|---|
| Peter-msk/Sunrise-PDF-Pro-web | RHWP 0.8.7 WASM → SVG → SVG-to-PDFKit/PDFKit; 호환 PDF는 pdf-lib | 글자·객체, PDF 구조 검증, 파일별 복구 | 유지하되 실제 실패 회귀 필요 |
| Peter-msk/Sunrise-PDF-Editor-Web | PDF.js/pdf-lib 기반 편집·이미지→PDF·PDF 비교 | PDF 구조·이미지 품질 비교, 수락시험 설계 재사용 | 구현 패턴만 참고; HWP 입력 대체 아님 |
| Peter-msk/Sunrise-PDF-Editor | 공개 저장소는 README/latest.json 위주 | 별도 PDF 업데이트 메타데이터 | 대체 렌더러 없음 |
| Peter-msk/Sunrise_PDF-PRO | 공개 저장소는 README/latest.json 위주 | Windows 제품 릴리스 메타데이터 | 웹 WASM 대체 아님 |
| edwardkim/rhwp | 0.9.0 개발계열: PageLayerTree, Canvas/CanvasKit, native Skia PDF | 향후 파서·레이아웃 업데이트 및 검증 자료 | 브라우저 WASM PDF 직접 출력 API가 존재하는지 별도 확인 전 무조건 업데이트 금지 |
| sanguneo/rhwptopdf | 구형 rhwp fork + Rust/svg2pdf/pdf-writer WASM, local 브라우저 전용 | 브라우저 내 PDF bytes 생성과 객체별 래스터의 가능성 | 유력 PoC, 단 parser 옛 버전/텍스트 glyph outline의 검색성 상실 |
| typst/svg2pdf | SVG 필터 객체만 raster, 기타 SVG 벡터; Rust SVG→PDF | 지원되지 않는 효과 처리 시 전체 페이지 손실을 방지 | 최우선 엔진 대안 PoC. WASM 빌드·폰트·보안·검색성 입증 필요 |
| alafr/SVG-to-PDFKit | 현재 사용하는 SVG-to-PDFKit 계열 | 기존 문제 재현, fontCallback, 렌더 warnings | 기본 유지; 임의 필터 무시 금지 |
| yWorks/svg2pdf.js | jsPDF를 이용한 브라우저 SVG→PDF, 제한적인 SVG 지원 | 이중 후보 비교 및 브라우저 PDF 벡터 경로 | 복합 SVG 충실도 검증 전 교체 불가 |
| canvg/canvg | SVG→Canvas 렌더(픽셀화) | 이미지 호환 출력의 비교 기준 | 벡터 전문 출력 대체 아님 |
| thx/resvg-js | Rust resvg, Node·WASM SVG→PNG | 높은 품질의 명시적 호환 이미지 출력 | PDF 텍스트층 보존엔 직접 도움 없음 |
| Hopding/pdf-lib | 브라우저 PDF 생성·수정 | 바이트·페이지 재구성 및 출력 유효성 | 이미 사용, SVG 전체 렌더러는 아님 |
| parallax/jsPDF | 브라우저 PDF 생성 | 독립 브라우저 출력 대조 | HWP 파서와 SVG 필터 호환 보장 없음 |
| pdfme/pdfme | JSON 템플릿 PDF 생성 | 정형 서식 렌더 참고 | 임의 HWP 문서 수입·재현 엔진 아님 |
| gotenberg/gotenberg | Chromium/LibreOffice Docker 서버 API, HWP 포함 문서 업로드 기반 | 로컬 실험환경에서만 비교 PDF 생성 가능 | 현재 서버 미전송 계약 때문에 웹 운영 백엔드로 채택 금지 |
| Stirling-Tools/Stirling-PDF | 데스크톱/서버 PDF 편집·변환·처리 | 검증 및 후처리 개념 참고 | 별도 HWP 웹 네이티브 직접 대안 아님 |

공개 소스:
- https://github.com/edwardkim/rhwp
- https://github.com/sanguneo/rhwptopdf
- https://github.com/typst/svg2pdf
- https://github.com/alafr/SVG-to-PDFKit
- https://github.com/yWorks/svg2pdf.js
- https://github.com/canvg/canvg
- https://github.com/thx/resvg-js
- https://github.com/Hopding/pdf-lib
- https://github.com/parallax/jsPDF
- https://github.com/pdfme/pdfme
- https://github.com/gotenberg/gotenberg
- https://github.com/Stirling-Tools/Stirling-PDF

## 3. 근본 원인과 개선 전략
1. 기본 professional은 실제 비영(非零) SVG filter를 PDFKit에서 충실히 재현하지 못하며
   의도적으로 실패한다. 검증 성공과 실제 문서 성공을 동일하게 표기하지 않는다.
2. Rust svg2pdf는 필터가 붙은 객체만 래스터화하고 나머지를 벡터로 남기는 구조를 제공한다.
   다만 svg2pdf는 Rust 라이브러리이며 직접 JS 전환이 불가능하므로, 원본 파일을
   업로드하지 않는 검증용 WASM 번들 구성·글꼴·ToUnicode 확인을 선행한다.
3. rhwptopdf는 브라우저 전용 실행을 증명하지만 업스트림 파서 세대가 다르고
   텍스트를 경로로 변환해 검색/복사 조건을 충족하지 않는다. 곧바로 핵심 엔진 교체 금지.
4. RHWP 0.9.0 PDF native/Skia는 CLI/natively 문서화됐고, 브라우저 WASM 직접 PDF
   출력을 동일하게 제공한다는 증거는 없다. 현재 버전 핀을 유지한다.
5. 어떤 엔진도 원본 25개와 비교용 정답 PDF 없이 100% 시각 충실도를 보장하지 못한다.

## 4. DEV33 즉시 적용
- 기본 professional의 무손실 벡터 의미를 유지한다.
- 단일 leaf에 적용되는 정확히 0인 SVG Gaussian blur, offset 및 CSS blur(0)는
  필터 영역/입력/불투명도/합성 등을 엄격 검사한 뒤 제거할 수 있다.
  실제 흐림·그림자·비영 이동 효과는 그대로 오류 처리한다.
- 기존 필터 복구 계획(사용자 확인 후 hybrid-filter)을 유지한다.
- 기존 SVG 필터 테스트에 반례(0 vs 비0/SourceAlpha/자체 필터 영역/그룹/투명도)를 추가한다.

## 5. 후속 PoC 채택 게이트
A. 현재 렌더러가 생성한 SVG를 변경 없이 Rust/svg2pdf WASM 입력에 제공 가능한가?
B. 외부 URL, 스크립트, CSS, 대용량 메모리 및 CPU 제약과 SVG 보안 경계가 유지되는가?
C. 필터 객체만 raster되는가, 나머지 한국어 텍스트가 선택·검색·복사 가능한가?
D. PDF 구조 완전성, 25개 HWP/HWPX 쪽수 및 원본 배치와 100% 대응하는가?
E. Chrome/Edge 최소화, 글꼴 권한 거부, 취소, 오류, 장시간 변환에도 원본/성공파일 보호?
F. 실제 25개 원본과 정답 PDF를 로컬 Windows Chrome에서 동일 문서별 비교하며,
   판정 수치·이미지 diff·예외 목록을 남기는가?

모든 게이트에 실물 근거가 생긴 뒤에만 별도 opt-in 엔진으로 시험한다.
운영 기본 엔진 전환/배포는 사용자 명시 승인 전까지 금지한다.
