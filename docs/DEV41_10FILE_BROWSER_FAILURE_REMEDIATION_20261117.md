# Sunrise PDF PRO(web) DEV41 — 실제 10개 HWP 검증 오류 보완

작성일: 2026-11-17 KST  
기준 브랜치: `fix/dev40-original-pdf-acceptance-20261116` / HEAD `11254fd2bf01a9e810396654586763f6f68f3baa`  
개발 브랜치: `fix/dev41-real-10file-qa-remediation-20261117`

## 1. 실제 브라우저 실기 증거 (사용자 개인 파일 내용은 수집/커밋하지 않음)

연결된 현재 운영 웹앱 `https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/`의 브라우저 탭 **읽기 전용 화면 텍스트**에서 HWP 총 10개, 완료 7개, 실패 3개를 확인했다. 운영 Worker는 DEV35 계열로, 이번 DEV41 코드는 운영에 배포되지 않았다.

| 항목 | 대상 파일의 표시 크기 | 관측 오류 | 관측 소요 시간 | 판정 |
|---|---:|---|---:|---|
| 파일 #5 | 약 171.10 MB | `SVG_RENDER_SOURCE_CHARS_LIMIT` | 01:24 | 페이지 SVG의 64Mi 문자 보호 한도 초과 |
| 파일 #8 | 약 847.5 KB | `PDF_STREAM_TIMEOUT (FINAL_BYTES_NO_END, emitted=628831B, final=44018B/99chunks, idle=119998ms)` | 02:12 | PDFKit 최종 청크 출력 후 종료 이벤트 없이 대기 |
| 파일 #10 | 약 78.01 MB | `페이지 수 제한: 1~120쪽` | 00:02 | 사용자 문서의 분량이 120쪽 초과 |

위 오류 코드와 크기는 **현재 브라우저 화면의 실제 표시값**이며, 사용자 원본 HWP 바이트를 이 도구로 읽거나 업로드하지 않았다. 실패 파일의 본문·전체 파일명은 이 기록에 넣지 않는다.

## 2. 세 오류에 대한 개발 수정

### A. 120쪽 차단 → 최대 200쪽, 독립 안전 한도 유지
- 공통 `browser-local/src/page-limit.mjs`: `MAX_CONVERSION_PAGES=200`, `MAX_NATIVE_PRINT_PAGES=120`.
- `converter.js`: 기본 벡터/혼합/호환 이미지 HWP 변환 200쪽까지 허용. 로컬 글꼴 탐색에서도 같은 한도 사용.
- `raster-compat-pdf.mjs`: 200쪽까지 호환 PDF 생성 허용.
- `pdf-output-integrity.mjs`: 결과물 페이지 수 검증이 120쪽에서 다시 차단하지 않도록 200쪽으로 맞춤.
- **200쪽은 무조건 성공 보장이 아님**: PDF 출력 512MiB, 페이지 이미지 픽셀 상한, SVG 복잡도 제한, 브라우저 가용 메모리 및 취소 검사는 유지.
- 전체 SVG 페이지를 한꺼번에 보관하는 **인쇄 준비**는 기존 120쪽 제한을 계속 적용.

### B. 대용량 SVG 오류는 명시적 한 파일 호환 복구
- `conversion-recovery.mjs`: `SVG_RENDER_SOURCE_CHARS_LIMIT`을 파일별 복구 대상 코드에 추가. 자동 변환 모드 또는 다른 파일의 상태는 변경하지 않음.
- `main.js`: 해당 오류가 발생한 HWP에만 **사용자가 누르는 호환 이미지 PDF 복구 버튼**을 표시.
- 기본 글자·도형 보존 모드의 64Mi SVG 문자 제한은 **유지**. 조용히 이미지를 대체하거나 검사 한도를 무한대로 늘리지 않음.
- 이미지 복구에서도 메모리 부족 가능성과 글자 검색 불가를 사용자에게 알림. 실제 171MB HWP의 복구 성공은 아직 검증되지 않았음.

### C. PDFKit `FINAL_BYTES_NO_END` — 구조 검증 후에만 예외적 완료
- `pdf-output-integrity.mjs`의 `finish`는 PDF 헤더·실제 xref·`startxref`·`%%EOF`가 검증된 경우에만 최종 완료로 표시. 마지막 데이터 수신 전 조기 검사에 실패해도 추가 청크가 도착하면 다시 확인 가능.
- `pdfkit-backend.js`: 기존 `toBlob` API에 **옵션성 내부 terminalProbe**를 추가. 잘린 PDF, 조작된 xref, EOF 누락은 성공으로 인정하지 않음.
- `svg-professional.js`: `pdf.end()`가 호출된 뒤, 2.5초 이상 데이터가 새로 오지 않은 상태에서만 terminalProbe를 확인. xref/EOF가 완전하면 종료 이벤트 누락만 복구하고, 미완성이면 기존 120초 timeout 및 명시적 호환 PDF 재시도 절차 유지. 주기적 검사 타이머는 정상 완료·취소·오류 시 정리.
- 종료 이벤트 없이 구조적으로 복구된 PDF는 사용자에게 **원본 페이지 수·내용·줄바꿈 재검토 경고**를 표시. 구조 검증을 시각적 동일성으로 과장하지 않음.

## 3. 추가된 회귀검증
- `tests/dev41-real-qa-regressions.mjs`: 132쪽 결과 메타데이터, 201쪽 차단, 132쪽 호환 출력 mock, 대용량 SVG explicit per-file retry, PDFKit 미종료 상태에서 완성/미완성/손상된 PDF 구별, 정상 end 이벤트, PDF integrity guard 재시도 등 **8개 신규 node:test 시나리오**.
- `tests/r66-real-failure-compat.mjs`: 초과 페이지 기준 121쪽 → **201쪽**으로 업데이트.
- `tests/r66-pdf-early-stream.mjs`: 실제 함수 호출 인자 계약을 optional terminal probe와 맞춤.
- `package.json`: 기존 전체 `npm test`에 신규 테스트 파일 등록, 별도 `npm run test:dev41` 추가.

### 이번 도구에서 실제 실행한 결과
- GitHub의 **수정된 함수 소스를 V8에 직접 로드해 실행**: 132/201 페이지 경계, 실 PDF 구조 guard, verified no-end 복구, 분할된 PDF 바이트 재결합, 손상 EOF 차단 및 취소, 기존 end, 대용량 SVG 복구 계획, 132쪽 mock 호환 변환이 모두 예상 결과.
- 코어 함수 9개 표적 조건 중 8개는 첫 호출에 PASS했고, 나머지 한 개는 V8 격리 환경에 `AbortController` 전역이 없는 탓에 실행할 수 없었으며, **동일 코드를 주입된 AbortController로 별도 재실행하여 PASS**.
- 신규 소스·기존 테스트·package.json 12개 파일에 대한 JS 구문/JSON 파싱 및 테스트 연결 검사 PASS. 
- **미실행**: 실제 저장소 `npm ci`, `npm run test:dev41`, 전체 `npm run test:local`, Vite build, Windows Chrome HWP 원본 3개 변환. 연결 GitHub에서 소스 수정은 가능하지만 현재 실행 컨테이너에 npm 의존성/네트워크가 없음.

## 4. 남은 최종 수락 게이트

1. Windows 개발 브랜치에서 `npm ci` 후 `npm run test:dev41`, 전체 `npm run test:local`, `npm run build`, `npm run verify:dist` **실행**.
2. 사용자가 실기검증한 10개 HWP를 그대로 DEV41 개발본에 넣고 동일 순서로 변환. 7개 기존 성공 파일의 회귀 여부와 실패 3개의 원인을 대조.
3. 파일 #5의 원본이 실제로 호환 이미지 복구 가능한지 확인. 기본 벡터 변환은 64Mi 안전 상한을 그대로 유지하므로 해당 파일은 추가적인 자료 기반 성능 최적화가 필요할 수 있음.
4. 파일 #8의 PDF 스트림에서 실제 trailer가 존재했는지 로컬 구조 확인. trailer가 없다면 검증 후 복구는 수행되지 않으며, 추가 원인 분석 필요.
5. 파일 #10의 실제 문서 132쪽 전부 생성·페이지 수·내용 누락 없이 완성되는지 확인.
6. 실제 PDF 8개/124쪽 원본 비교, HWP/HWPX 25개 품질 수락, UI 단위 확인이 완료되어야 배포 적격 판정.
7. GitHub Draft PR을 임의 병합하지 않고, GitHub Actions 재활성화·Cloudflare 운영 Worker 및 관리자 DB/인증 설정 변경 없음.

**판정: DEV41 소스 보완 및 선별 함수 검증 완료. 사용자 실문서 3개 재실기/통합빌드/정식 배포는 미완료.**
