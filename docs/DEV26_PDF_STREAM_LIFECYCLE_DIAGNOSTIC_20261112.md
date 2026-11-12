# Sunrise PDF PRO(web) — DEV26 PDFKit 스트림 정체 유형 분석·자원 정리 보완

**일시:** 2026-11-12 KST  
**작업 소스:** `dev/dev26-final-integrated-source-20261112`  
**배포 상태:** 개발 브랜치 수정 및 CI 검증만 시행. `main` 병합·Cloudflare 운영 Worker 배포·D1 스키마 변경 없음.

## 1. 배경과 정확한 문제 범위

DEV26 운영 익명 텔레메트리에는 `PDF_STREAM_TIMEOUT` 7건이 확인됐으며,
기존 `svg-professional.js`는 `pdf.end()` 이후 `toBlob()` 완료를 기다리다가
120초 제한을 넘으면 정해진 오류를 반환한다. 과거 보고된 실문서 원본은
이번 개발에 제공되지 않아 **기존 특정 문서의 PDFKit 내부 교착/정체 원인은 아직 확정되지 않았다.**

이번 수정은 확인 가능한 공통 결함 두 가지를 제거/완화한다.

1. 스트림 정체가 바이트 0, 최종화 이전 바이트만 있음, 최종화 바이트 있으나 end 누락 중 어느 상황인지 구분할 수 없던 진단 정보 부족.
2. 실패 스트림의 `error` 이벤트 감시기가 기존 변환 콜백을 계속 참조할 수 있던 정리 경계.

## 2. 변경 파일 및 동작

### `browser-local/src/pdfkit-backend.js`

- 기존 `toBlob(pdf, signal, onByteProgress, maxOutputBytes)`에 선택적 내부 `streamProbe`를 마지막 인자로 추가.
- PDFKit의 수신 바이트 수, 청크 수, 마지막 바이트 시각, `end/error/abort` 이벤트 여부를
  **브라우저 탭 메모리에서만** 기록한다.
- 스트림 실패 시 기존 오류 콜백을 제거한 뒤 공유 무상태 감시기로 대체하여
  PDFKit 폐기 중 지연 발생한 `error` 이벤트를 처리하면서 클로저 보유를 방지.
- 일반 성공 시 `data/end/error` 감시기 정리와 PDF 무결성 검증은 기존과 동일하게 유지.

### `browser-local/src/svg-professional.js`

- `pdf.end()` 호출 시점의 생성 바이트/청크를 기준으로 최종화 중 새로 발행된 바이트를 별도 계수.
- `PDF_STREAM_TIMEOUT` 발생 시 사용자 표시 오류에 다음 비식별 정보를 추가:
  - `NO_BYTES`: 출력 바이트 없음
  - `NO_FINAL_BYTES`: `pdf.end()` 이전 바이트만 존재, 최종화 이후 새 바이트 없음
  - `FINAL_BYTES_NO_END`: 최종화 이후 새 바이트가 있지만 끝 이벤트 누락
  - `END_SEEN_NO_COMPLETION`: 끝 이벤트가 보였지만 최종 Promise가 아직 완료되지 않은 예외 경계
  - 총 바이트·최종화 바이트·청크 수·마지막 바이트 이후 유휴시간
- 기존 오류 문자열의 `PDF_STREAM_TIMEOUT` 토큰을 보존하므로 기존 명시적 파일별 호환 PDF 복구 정책과 호환.
- 원본 문서 내용·파일명·경로·글꼴 바이너리를 진단 메시지나 서버 텔레메트리에 포함하지 않음.

### 테스트

- 신규 `browser-local/tests/r66-pdf-stream-diagnostics.mjs`: 8개 테스트 추가
  (정상 출력, 오류/취소, late-error, 프로브 계약, 3개 정체 유형, 오류 분류·비식별).
- 기존 `browser-local/tests/r66-pdf-early-stream.mjs`: 콜백 수집 패턴만 변경된 호출 인자에 맞춤.
- `browser-local/package.json`: 신규 회귀 테스트를 `npm test`에 포함.

## 3. 검증 기록

- **최종 성공 GitHub Actions**:
  https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43223306349
- 변경 영향 Node 테스트 **59/59 PASS, FAIL 0, SKIP 0**.
- Node 24, `check:source`, Vite/WASM 번들, Worker 정적 자산 및 보안/라우팅 계약 **PASS**.
- Chromium에서 고정 공개 HWP + HWPX의 기본 `professional` 방식 변환과
  각 개별 PDF/ZIP 다운로드 **PASS**. 생성된 PDF 크기: HWP 8,383 bytes,
  HWPX 8,354 bytes. 브라우저는 동일 출처로만 네트워크 요청.
- 첫 QA
  https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43223072178
  는 **로컬 Vite 서버가 `/api/public/telemetry`를 제공하지 않아** 브라우저
  테스트의 `requestfailed` 검증이 실패. PDF 파일 생성 자체는 성공했으며
  이후 로컬 Worker `wrangler dev --local`로 다시 시험해 **최종 PASS**.
  첫 실패를 제품의 PDF 변환 성공으로 덮거나 테스트에서 무시하지 않았다.

## 4. 안전성·제약

- 기본 전문 벡터 PDF와 명시적 이미지 호환 PDF의 구분 유지, 자동 화질 강등 없음.
- 출력 바이트 상한(512 MiB), PDF 헤더/xref/trailer 무결성, 취소 시 미완성 PDF 미노출 유지.
- 테스트는 공개 고정 샘플 및 합성 이벤트에 한정. 사용자 실제 26.30 MB/12쪽 실패 문서는 포함되지 않음.
- 이 수정은 **관측 가능성과 실패 후 자원 정리의 근본 경계를 개선**했으나,
  실제 특정 PDFKit 내부 정체를 해결했다고 선언할 수 없다.
- Windows Chrome/Edge 최소화/장시간, PC 설치 서체, 한컴 원본 대비 조판 동일성도 별도 수락시험 대상.
- 운영 `sunrise-pdf-pro-web`과 관리자 D1, `sunrise-pdf-editor`에는 조작을 하지 않았다.

## 5. 후속 수락 게이트

실패 원본이 확보되면 **같은 파일·같은 브라우저**에서 코드별 생성 바이트,
최종화 이후 생성량, 누락된 `end` 여부를 비교하여 구체적 병목을 특정한다.
이후 PDFKit/이미지 디코딩/폰트 임베딩/브라우저 프리즈 중 어느 계층인지
실증된 원인에만 최소 수정 적용. 동일 원본의 PDF 무결성·페이지 수·객체/텍스트·
한컴 기준 시각 비교 및 3회 이상 반복 성공 후 문제 종료를 판정한다.

**최종 상태:** `DEVELOPMENT QA PASS` (stream diagnostic + teardown),
`USER DOCUMENT ROOT CAUSE UNVERIFIED`, `NO DEPLOY`.
