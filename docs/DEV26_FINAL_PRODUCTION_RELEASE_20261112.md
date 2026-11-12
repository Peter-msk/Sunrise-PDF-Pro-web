# Sunrise PDF PRO(web) DEV26 — 최종 운영 배포 결과

**날짜:** 2026-11-12 KST  
**대상:** 기존 Cloudflare Worker `sunrise-pdf-pro-web`  
**운영 주소:** https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/

## 1. 승인과 범위

사용자의 "최종 배포 진행하자"라는 명시적 지시에 따라, 앞선 운영 미배포 조건은 이번 DEV26 릴리스에 한하여 해제하였다.

- 배포 소스의 정확한 GitHub 커밋: `831e42e94166ffc25052b178c26be16ae965a149`.
- 운영 Worker 새 버전: `a8654fda-fc51-4395-be13-0600ccf2097e`.
- 운영 배포 ID: `197c49d1-21db-4e94-9ccc-750dc397d1a5`.
- 독립 Cloudflare API 확인: 새 버전이 트래픽 100% 처리.
- 이전 운영 버전(롤백 대상): `40308b40-262f-4a68-9023-41f002f2621b`.
- 코드·정적 자산: 기존 Worker와 D1 바인딩 유지. 별도 `sunrise-pdf-editor` 제품 미변경. 운영 데이터베이스 스키마 마이그레이션 없음.

## 2. 검증·배포 실측 근거

### 배포 전 전체 소스 QA
- GitHub Actions: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43236574175
- **전체 Node 테스트 451건 중 PASS 448 / FAIL 0 / SKIP 3.**
- 소스 계약, Vite/WASM 패키징, PDFKit, SVG 필터, 글꼴, 버전 정적 자산 및 Worker 라우팅 계약 PASS.
- Wrangler 배포 `--dry-run` PASS.
- 로컬 Worker에서 공개 고정 HWP/HWPX의 PDF 및 ZIP, PC 글꼴·벡터 품질 UI의 실제 Chromium E2E PASS.
- 해당 GitHub Actions 실행은 최종 단계에서 **저장소에 Cloudflare API secret이 없어 배포를 수행하지 않고 FAIL**로 종료되었다. 이는 전체 테스트 실패가 아니다.

### Cloudflare의 공식 연동 빌드 및 실제 배포
- 계정에 이미 등록돼 있던 GitHub 저장소 연결과 Workers Builds 배포 토큰을 사용했다.
- 기존 트리거에 일시적으로 **현 통합 브랜치 + `npm run build && npm --prefix browser-local run check:source`**를 적용했다.
- 클라우드 빌드 ID `a71eba22-f212-45f9-b5db-03f26a6d6e90`: **success**.
- Wrangler가 33개 자산을 읽고 신규 5개를 업로드, 기존 26개를 재사용하여 기존 Worker 배포 완료.
- 새 버전 100% 활성화 확인 후 기존 Cloudflare 빌드 트리거의 브랜치·빌드 명령·수동 경로 제한을 **기존 값으로 되돌렸다**. 자동 배포 루프를 남기지 않았다.

### 실제 운영 URL의 HTTP 및 브라우저 확인
- GitHub Actions: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43239081807
- 운영 HTTPS에서 `/local/health`: rhwp 0.8.7, WASM 크기/해시, 문서 업로드 금지 정책 확인 PASS.
- `/local/` UI, `/local/rhwp_bg.wasm`, 두 PDF.js worker, 명시적인 GET/HEAD 허용, POST 405 차단 PASS.
- 실제 운영 Chromium에서 공개 HWP/HWPX 각각 열어 전문 벡터 PDF 생성:
  - HWP: 1쪽, 8,383바이트, 기본 `professional` PASS.
  - HWPX: 1쪽, 8,354바이트, 기본 `professional` PASS.
  - 양쪽 모두 개별 PDF 다운로드, PDF 페이지 유효성, 페이지별 벡터 구조 확인, PDF 글꼴 포함 검사 PASS.
- 첫 운영 브라우저 QA는 연속 발생할 수 있는 진단 네트워크 요청 때문에 `networkidle` 조건을 충족하지 못했다. 이를 실제 `domcontentloaded` 및 변환 준비 완료 이벤트 기반으로 분리한 별도 **운영 전용 테스트**를 수행하여 최종 성공했다.
- 실제 사용자 또는 고객의 문제 문서는 GitHub/Cloudflare 빌드로 복사하지 않았다.

## 3. 실제 포함한 DEV26 개발 내용

1. HWP/HWPX 변환의 SVG 필터 검사 및 **사용자 명시적 혼합 출력에서만 해당 필터 페이지 이미지화**.
2. 나머지 페이지의 PDF 벡터 경로·도형·텍스트 보존.
3. PC 설치 TTF/OTF 및 TTC 정확한 face의 로컬 검사, PDF 글꼴 프로그램 임베딩 확인.
4. 탭 동결·복귀·BFCache와 취소/수동 재시도 처리를 개선한 Windows Chrome·Edge 검증본.
5. 실제 PDF.js 출력 구조 검사: 페이지 기준 벡터 보존율, 이미지화 번호, 벡터 경로, 텍스트 추출 수 및 이미지 명령 검증.

## 4. 유보사항

**배포 성공과 한컴 정식 PDF 대비 완벽한 원문 조판 일치는 별개이다.**
실제 오류 원본(대용량/복잡 서식)과 한컴 기준 PDF의 페이지별 시각 비교, Windows 사용자 상용 글꼴, 장시간 절전·탭 완전 폐기 상태는 아직 미검증이다.

기본 전문 출력은 미지원 필터를 자동으로 이미지화하지 않고 오류로 표시하며, 사용자가 해당 파일만 혼합/이미지 출력으로 복구하도록 안내한다.

## 5. 장애 대비

운영 새 버전: `a8654fda-fc51-4395-be13-0600ccf2097e` (100%).
기존 정상 버전: `40308b40-262f-4a68-9023-41f002f2621b`.

필요 시 Cloudflare 대시보드 또는 Wrangler의 `versions deploy <기존-version-id>@100 --yes`를 통해 이전 코드를 복구할 수 있다. D1 스키마/데이터는 코드 롤백과 별개이므로 DB 상태 보존 여부를 독립적으로 확인해야 한다.

**최종 상태:** DEV26 통합본 배포 SUCCESS, 운영 신규 버전 100%, 공개 서비스 실기 PASS.
