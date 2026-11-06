# Sunrise PDF PRO Web R40-DEV1 통합 결과

기준일: 2026-11-06 KST. 사용자 요청 순서: 남은 작업표 작성 → R38 통합 상태 확인 및 개발.

## 결론

운영 main c26a64b5bff6ff465fbdfd148a78d13a89a2df67을 기준으로 R38/R39 로컬 엔진을 선택 통합했다. 이 패키지는 **미배포 로컬 개발 변경 묶음**이다. 별도 PDF Editor 프로젝트의 소스나 진행률은 포함하지 않는다.

## 실제 수정

1. 전문 출력: PDFKit 0.20.2 브라우저 ESM과 Helvetica 별도 등록을 연결. Node Writable을 전제로 한 blob-stream 의존을 제거하고 data/end 이벤트의 Uint8Array를 Blob으로 수집한다. 취소·오류·지연 완료 때 초안이 게시되지 않도록 한다.
2. 배포 연결: 기존 ./ base와 local-bundle.js, local-chunk-[hash].js 이름 유지. Worker에서 허용된 분할 JS만 GET/HEAD로 제공하고 CSP에 동일 출처 frame과 로컬 폰트 사용을 명시한다. 임의 경로는 공개하지 않는다.
3. 공통 SVG 경계: root 이벤트·상대/외부 자원·활성 SVG/다른 namespace·doctype/처리 지시문을 차단한다. 완전한 CSS 주석은 제거 후 검사하고 일반 주석은 허용한다. 이미지 변환·전문 출력·인쇄가 같은 검사를 거친다.
4. 글꼴/용지: 선택 폰트를 rhwp 측정과 PDF 임베딩에 함께 사용. SVG의 물리 용지 mm/pt와 내부 viewBox를 구분. 표준 모드에서는 글꼴 파싱이 발생하지 않는다.
5. 인쇄: 브라우저 인쇄용 문서를 격리 frame에 구성. 사용자 글꼴은 페이지 이미지 준비 전에 로드. 혼합 용지 보호 출력은 무손실 PNG를 사용하고 취소/폐기 때 URL을 해제한다.
6. 화면: 운영 3단계 사용법을 유지하고 출력 옵션은 접이식 영역으로 제공. 기본은 이미지 PDF. 전문 출력 결과는 벡터/이미지 페이지와 대체 사유를 표시한다. 출력 방식 변경 시 이전 완료 상태와 다운로드 주소를 폐기한다.

## 수행한 검증

| 검사 | 결과 | 의미와 한계 |
|---|---|---|
| 기존 통합 집중 Node 검사 | 48개 PASS | 폰트·변환 대체·취소·용지·운영 가이드·어댑터 |
| 신규 SVG 경계 검사 | 7개 PASS | root 이벤트·외부/상대 URL·CSS 우회·namespace·애니메이션·안전 주석 |
| 실제 PDFKit 브라우저 라이브러리 | 1개 PASS | 실제 패키지로 PDF 바이트 생성; 모의 엔진만 사용한 검사가 아님 |
| 독립 PyMuPDF PDF 검사 | PASS | 1쪽, 1691바이트, A4, 영문 텍스트 추출, 벡터 도형 1개, 이미지 0개 |
| Worker 경로·보안 정책 | PASS | GET/HEAD entry+chunk+WASM, POST 거부, 임의 자산 404 |
| 실제 의존성/잠금파일 | PASS | 선언된 직접 의존성 7개 버전 일치, package-lock 포함 |
| 통합 Vite 빌드 | PASS | 244모듈, entry JS + 분할 JS 5개 생성 |
| 공식 WASM | PASS | 11,821,756바이트, 고정 SHA256 일치 |
| 실제 브라우저 초기화 | 확인 | 화면에 초기화 완료·초기 버튼 상태 확인 |
| 공식 genuine.hwp 기본 출력 | 화면 확인 | 1쪽, 77.0KiB, 이미지 PDF 생성 표시 |
| 공식 genuine.hwp 전문 출력 | 화면 확인 | 1쪽, 205.7KiB, 폰트 미일치로 이미지 대체 사유 표시 |
| 공식 genuine.hwp 인쇄 준비 | 화면 확인 | 벡터 1쪽·PNG 0쪽 준비, 인쇄 버튼 활성화 |
| 공식 genuine.hwpx 기본 출력 | 화면 확인 | 1쪽, 35.9KiB, 이미지 PDF 생성 표시 |
| 앱 결과 PDF 다운로드·재열기 | 미확인 | 시험 브라우저의 다운로드 이벤트/반환 경로 제한시간 초과 |
| 사용자 한글 글꼴 실제 임베딩 | 미검증 | 글꼴을 지정한 실문서 시험 필요 |
| PC와 동일 원본 다쪽 품질 비교 | 미검증 | 표·도면·서체·줄바꿈·용지 비교 필요 |
| 원격 커밋·PR·CI·배포 | 미실시 | 이번 작업 범위는 로컬 통합 개발 |

48+7+1은 영역별로 실행한 서로 다른 자동검사 56개다. 이미 통과한 전체 검사를 단순 반복하지 않고 변경된 SVG 경계는 수정 후 다시 검사했다. 실제 PDFKit 시험 PDF는 합성 영문/도형 문서이며 HWP 변환이나 한글 보존 성공을 대신하지 않는다.

공식 WASM SHA256: 54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989.

## 적용

변경 ZIP은 main c26a64b5 기준 저장소에 적용할 오버레이다. 전체 별도 프로그램이나 설치파일이 아니다. 현재 작업본에 수정사항이 있다면 MANIFEST.json의 before_sha256와 대조 후 병합한다. 삭제 파일은 없다. node_modules, dist, WASM, Git 메타데이터와 브라우저 화면 캡처는 포함하지 않는다. 원본 upstream 서브모듈과 기존 backend 바이너리는 기준 저장소에서 유지한다.

Node 22.12+ 또는 24에서:

```bash
npm --prefix browser-local ci --ignore-scripts --no-audit --no-fund
npm test
npm --prefix browser-local run test:pdfkit-real
npm --prefix browser-local run build
node scripts/verify-browser-build.mjs
npm --prefix browser-local run dev
```

새 변화가 없다면 이번에 PASS한 검사는 반복하지 않는다. 자동화 브라우저 시험은 도구가 준비된 별도 로컬 환경에서 실행한다. 브라우저 인쇄는 대화상자를 통해 PDF로 저장하며, 준비 완료를 디스크 저장 완료로 계산하지 않는다.

## 다음 우선순위

1. 한글 원문 글꼴을 지정한 실제 HWP의 전문 PDF 출력·텍스트 추출 검사.
2. 같은 HWP의 PC PDF와 다쪽 표·도면·줄바꿈·용지 크기 비교.
3. Chrome/Edge 실제 다운로드·재열기 및 혼합 용지 인쇄 확인.
4. 위 결과 보완 후 별도 지시에 따라 운영 반영.

## 확인에 사용한 기준

- GitHub main: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/commit/c26a64b5bff6ff465fbdfd148a78d13a89a2df67
- 이전 로컬 소스: Sunrise_PDF_PRO_Core_Stream_Cancel_Fix_20261105.zip
- PDFKit 브라우저 계약: https://pdfkit.org/docs/getting_started.html
- SVG-to-PDFKit: https://github.com/alafr/SVG-to-PDFKit
- Vite 상대 경로/동적 chunk: https://vite.dev/guide/build
