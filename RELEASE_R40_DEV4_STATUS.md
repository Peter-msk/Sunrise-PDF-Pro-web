# Sunrise PDF PRO Web — R40-DEV4 배포 이력 및 수락 범위

## 배포 대상

- GitHub: `Peter-msk/Sunrise-PDF-Pro-web`, release branch `release/r40-dev4-20261106`.
- 대상 Cloudflare Worker: `sunrise-pdf-pro-web` — 다른 `sunrise-pdf-editor` Worker 변경 금지.
- 대상 UI: `/local/`; 원본문서 브라우저 처리, 서버 업로드 없음.
- 기본 PDF 방식: rhwp WASM `print` SVG → PDFKit 글자/도형 보존. 미지원 처리 시 이미지로 자동 대체하지 않고 오류·부분 PDF 폐기.
- 다중 HWP/HWPX 선택, 개별 PDF 및 ZIP, 재시도/취소/임시 URL 정리.

## 검증 증거

- Release code commit: `2cb9b68a82be044fc8ed3ac6a80855e3c1df3be6`.
- GitHub Actions: <https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/42243867213>, 전체 성공.
- `npm ci` / 단위시험 / Vite WASM 패키징 / Wrangler dry-run / Worker 경로 + CSP 검사: PASS.
- 실제 Chromium에서 공식 HWP + HWPX 동시 선택 → 개별 PDF 2건 + ZIP 다운로드: PASS.
- PDF 구조(pypdf strict), 글자 추출, 이미지 XObject 부재: PASS.
  - HWP: PDF 1쪽, 8,383 bytes, 추출 문자 102자, 이미지 객체 0.
  - HWPX: PDF 1쪽, 8,354 bytes, 추출 문자 19자, 이미지 객체 0.
- ZIP: `genuine.pdf`, `genuine (2).pdf` 2개.
- 브라우저 입력 원문의 외부 전송 관찰 없음(동일 출처 정적 자산만 요청).

## 남은 품질 제한 — PASS로 주장하지 말 것

- 동일 원본에 대한 Windows 한컴 COM PDF와 다쪽 표/도면/글꼴/줄바꿈 시각·배치 대조: 미실시.
- 드문 폰트 및 HWPX 다중 글자 `textLength` 처리: 제한적 지원/일부 실패 가능.
- 공식 1쪽 샘플의 성공이 임의의 업무용 HWP/HWPX 전부의 품질을 보증하지 않음.
- 운영 배포 후 실제 외부 URL 접속/업로드 없이 변환 시험, 요청 실패 감시, 롤백 준비 필요.

## 배포 결정

기능을 제한 없이 한컴 COM과 동일하다고 광고하지 않는다. 사용자 지시에 따른 R40 기능 공개는 **지원하지 않는 문서는 명시적으로 실패하고 자동 이미지 대체하지 않는다**는 계약을 전제로 진행한다. Cloudflare 빌드 결과 및 최신 Worker 버전 확인 후 운영 적용 여부를 최종 기록한다.
