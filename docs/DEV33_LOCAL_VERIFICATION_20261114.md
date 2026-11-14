# DEV33 로컬 검증 결과 — 2026-11-14

브랜치: fix/dev33-peer-engine-filter-hardening-20261114
기준: DEV32 SHA 1fe9957b27352e40592860171898e5faa6bdcd27
운영: 미배포 / GitHub Actions 비활성 상태 유지

## 실제 수행한 검증
1. 최신 GitHub 브랜치에서 browser-local/src/svg-safe-grayscale.mjs를 읽고,
   import/export를 제거한 평가본의 실제 두 순수 판정 함수를 실행:
   - identifyIdentitySvgFilter, isCssIdentityFilter
   - 14개 SVG 항목 + 10개 CSS 항목 = **24 PASS/24**
   - zero blur/offset, SourceGraphic, 비영 수치, SourceAlpha, 잘못된 속성,
     금지된 음수·변수 구문 등을 확인.
2. 최신 GitHub 브랜치의 browser-local/src/main.js에서 혼합 모드 클릭 핸들러를
   추출하고, 최소한의 DOM 이벤트 스텁으로 직접 호출:
   - HWP 대기 파일의 명시적 클릭은 hybrid-filter 선택 및 변환을 1회 시작
   - busy 차단 / not ready 차단 / 비HWP 차단 / 전부 완료 차단
   - **5 PASS/5**
3. 소스 파싱 및 정적 연결 점검: svg-safe-grayscale, main.js,
   r66-svg-filter-vector-safe, r66-hybrid-svg-filter, HTML 버튼·기본 선택값·
   개발 문서 연결을 확인. r66-hybrid 테스트 파일의 import.meta 구문은
   함수식 정적 파서에서 직접 지원하지 않으므로 전처리해 확인함.
4. main 브랜치 기존 SHA 10de9b51d96f21ac39d5daa05f7c83bde45228aa 보존;
   GitHub workflow 31개 모두 .paused임을 확인.

## 검증하지 않은 사항
- git clone + npm ci + 실제 jsdom/Node 전체 단위시험 **미실시**.
- Windows 사용자의 실제 25개 HWP/HWPX 파일 및 한컴 출력 PDF를 확보해
  변환·해상도·검색성·글꼴·쪽수 등 시각 비교 **미실시**.
- SHA가 아닌 원본 문서로 nonzero blur/drop-shadow 필터를 SVG-to-PDFKit에서
  처리할 수 있도록 하는 근본 해결 **미실시**.
- 새 Rust/svg2pdf WASM 브리지를 빌드·삽입·성능 검증 **미실시**.
- Cloudflare 운영 Worker 업데이트, 새 배포, GitHub Actions 실행 **미실시**.

## 최종 판정
DEV33는 명시적 최초 혼합 출력 UX 및 엄격한 무효과 필터 벡터 보존 개선.
부분적 소스/단위 계약 통과. 실제 25개 문서 수락 또는 운영 릴리스는 HOLD.
