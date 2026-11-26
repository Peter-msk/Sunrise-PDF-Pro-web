# Sunrise PDF PRO (Web) — DEV75 운영 출시

> PRODUCTION DEPLOYED · 2026-11-27 07:34:40 KST

- 운영 배포 소스: `c2287ba8c51e3a46ba4e632fbf0718f362e81424`
- 운영 보존 브랜치: `release/dev75-production-20261127` (실제 배포 코드 고정)
- 기본 브랜치 `main`: DEV75 운영 코드 및 최신 문서
- 운영 Worker: `1d3666a4-821e-48ab-b7c0-a8dcb91802c0` (100%)
- 이전 Worker 롤백 기준: `dc6de856-c4a4-4589-aa21-44a173075708`
- 내부 패키지 버전 `0.41.0-dev1` 유지; DEV75는 개발/출시 단계 명칭입니다.
- [PDF 변환](https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/) · [관리자](https://sunrise-pdf-pro-web.ko-pg.workers.dev/admin/)
- Cloudflare 필수 회귀 시험 631/634 PASS, 실패 0, 환경에 따른 미실행 3; 배포 및 운영 전환 성공. 추가 출시 검사 20/20 PASS는 중복 집계 제외.
- [DEV75 출시 및 인수인계 기록](docs/DEV75-PRODUCTION-RELEASE.md)

## 구현 범위

| 단계 | 개발 내용 |
|---|---|
| DEV66 | 관리자 계정 최초 설정, 인증, 세션, 입력 및 예외 처리 |
| DEV67 | 방문 통계 기간 경계, 공통 데이터 보존 정책 |
| DEV68 | 개별 변환 작업 UUID, 종료 상태 및 중복 방지, 통계 API |
| DEV69 | 작업과 오류 추적 연결, 오류 분류, 명시적 복구 |
| DEV70 | 문의 접수 제한, 게시 종료일 보존, 검색·상태 필터 |
| DEV71 | 관리자 대시보드, 그래프, 반응형 CSS, 화면 전환 보호 |
| DEV72 | 로그인 실패 원자적 기록, JSON 요청 제한, 보안 헤더, 문의 인덱스 |
| DEV73 | 통합 시험 결함 수정, 브라우저 시험 보완, 인수 절차 정리 |
| DEV74 | 대용량 복합문서 처리, 메모리 복사 및 선택 ZIP 개선 |
| DEV75 | 주요 고정 변환 상한 및 기본 시간 제한 해제, 원본 이미지 보존, 대형 표 출력, 운영 출시 |

## 제품 계약

- 브라우저 내부 `@rhwp/core@0.9.0` WASM 기반 HWP/HWPX 및 XLS/XLSX/JPG/JPEG/PNG → PDF. PPT/PPTX 미지원.
- 기본 professional 출력은 원본 글자·도형 보존 우선. 지원되지 않는 경우 명시적 실패; 자동 이미지 변환 금지.
- 혼합·이미지 PDF는 사용자의 명시적 선택으로만 실행. 원본 글꼴 누락(FONT_FAMILY_OR_VARIANT_UNAVAILABLE)은 자동 복구 대상이 아니며 원본 글꼴을 추가한 뒤 재시도.
- 원본 문서, 파일명, 경로, 본문은 일반 변환·익명 진단 전송 대상이 아님.
- 기존 관리자 계정, ADMIN_SETUP_KEY, 운영 D1 보존. PDF Editor와 별도 서비스.

## Windows CMD 인수 및 빌드

Node.js 22.16.0 환경을 권장합니다. Git과 npm이 필요합니다.

```cmd
git clone --branch release/dev75-production-20261127 --single-branch https://github.com/Peter-msk/Sunrise-PDF-Pro-web.git
cd Sunrise-PDF-Pro-web
npm run build:release
```

`build:release`는 기존 잠금 파일 기준 의존성 설치와 배포용 Vite 빌드만 수행합니다. 전체 검증이 포함된 기존 `npm run build`도 유지됩니다. 출력 디렉터리는 `browser-local/dist`입니다.

## 사용자 최종 검증 (필요할 때 직접 실행)

```cmd
npm test
npm run test:unrestricted
npm --prefix browser-local run verify:dist
node scripts/verify-browser-build.mjs
npm --prefix browser-local exec -- playwright install chromium
npm run test:browser
```

PDF 문자·색상 검증 3개는 Poppler의 pdftotext, pdftoppm이 PATH에 있어야 실행됩니다. 미실행은 PASS가 아닙니다. 사용자 실제 HWP/HWPX는 로컬에서만 검증하세요.

```cmd
npm --prefix browser-local run test:hwp -- "C:\QA\sample.hwpx" "C:\QA\reference.pdf"
```

기존 DEV73 워크플로는 이 후보 브랜치에서 수동 실행 전용으로 변경되었습니다. GitHub UI의 workflow_dispatch는 기본 브랜치에서 워크플로가 등록되어야 사용할 수 있으므로 검증은 위 CMD 방식으로도 가능합니다.

## 향후 재배포 절차 (자동 실행하지 않음)

DEV68/DEV72 마이그레이션은 운영 DB에 이미 적용되었으며, DEV75 운영 배포 및 100% 트래픽 전환은 확인되었습니다. 아래는 신규 환경 구성 또는 향후 재배포 시 참고 절차입니다.

1. Cloudflare Dashboard에서 실제 활성 Worker 버전, D1 백업 또는 Time Travel 복구 지점, 관리자 비밀키 존재 여부를 확인합니다. 비밀값을 복사하거나 새로 생성하지 않습니다.
2. 아래 두 추가형 마이그레이션을 **정확한 PDF PRO D1**에 순서대로 적용합니다. 이미 존재하는 경우에도 재적용할 수 있도록 IF NOT EXISTS를 사용합니다.
3. 신규 테이블과 인덱스 존재 및 기존 관리자 계정 보존을 확인한 후 배포합니다.
4. 후보 브랜치에서 빌드한 산출물을 사용합니다. main은 DEV75 운영 코드를 기준으로 최신화되었습니다. 재현 가능한 배포에는 고정된 커밋을 사용합니다.
5. 실제 운영 서비스와 관리자 7개 메뉴의 동작, 로그인, 고객 문의, 공지 및 변환을 확인합니다. 문제가 있으면 배포 직전 확보한 Worker 버전으로 롤백하고 추가형 DB 스키마를 삭제하지 않습니다.

```cmd
npx wrangler whoami
npx wrangler d1 execute sunrise-pdf-pro-admin --remote --file=migrations/dev68-operation-telemetry.sql
npx wrangler d1 execute sunrise-pdf-pro-admin --remote --file=migrations/dev72-inquiry-index.sql
npx wrangler d1 execute sunrise-pdf-pro-admin --remote --command="SELECT name,type FROM sqlite_master WHERE name IN ('pro_conversion_operations','idx_pro_inquiries_email_time')"
```

위 명령은 운영 DB 변경을 포함하므로 최종 검증 승인 전에는 실행하지 않습니다. 배포 또한 명시적으로 별도 수행합니다. 기존 비밀키 및 환경 변수 보존을 확인하고 `wrangler.jsonc` 대상 Worker에만 배포합니다.

**남은 수락시험:** 실제 Windows Chrome/Edge, 모바일 해상도 및 실제 기기, 공개 HWPX E2E, 실제 사용자 문서의 원본 대비 출력 품질, 운영 화면의 실제 브라우저 기능 확인. 최근 150건 범위의 문의·공지 검색, 관리자 메모 중심 회신(자동 메일 발송 미구현), 고정 proof 재전송 방어 고도화는 별도 후속 범위입니다.

DEV75는 운영 배포가 완료되었으나 실제 사용자 복합문서의 출력 품질 및 브라우저 E2E는 별도 검증이 필요합니다. 인위적인 주요 상한 제거는 브라우저 메모리·WASM·파일 형식의 물리적 한계 제거를 뜻하지 않습니다.
