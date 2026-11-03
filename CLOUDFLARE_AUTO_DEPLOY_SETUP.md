# Cloudflare Workers Builds — Sunrise PDF PRO Web 자동배포 인수인계

## 2026-11-03 현재 상태
- GitHub 저장소: `Peter-msk/Sunrise-PDF-Pro-web` (repository ID `1444115303`), 브랜치 `main`.
- Cloudflare Worker: `sunrise-pdf-pro-web` (기존 `sunrise-pdf-editor`와 별도).
- `wrangler.jsonc`: Worker main `src/worker.js`, browser assets `browser-local/dist`, binding `ASSETS`.
- `npm run build`: HWP/HWPX Web 소스 설치, 핵심 검사, Vite build, pinning SHA 검증, Worker 자산 라우트 회귀시험 실행.
- GitHub Actions: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/41660549318 실제 로컬 Wrangler Worker ↔ 브라우저 HWP/HWPX PDF E2E **PASS**.
- **Cloudflare ↔ 이 GitHub 저장소의 Builds 연결은 미완료**. API 요청은 404, 오류코드 `8000012`, 메시지 `The project is linked to a repository that no longer exists`.
- 같은 계정 `sunrise-pdf-editor` Worker는 이미 `Sunrise-PDF-Editor-Web` GitHub 저장소와 정상 연결돼 있으나, `sunrise-pdf-pro-web` GitHub 저장소는 별도로 접근 권한을 추가해야 하는 상태로 추정됨.
- 이 저장소 이름이 과거 `Sunrise-PDF-Pro-web-`에서 현재 `Sunrise-PDF-Pro-web`으로 변경된 것을 확인함.
- 기존 PDF Editor Worker/연결은 변경하지 않았고 Cloudflare Workers Builds에 잘못된 설정을 생성하지 않았음.

## 사용자에게 필요한 GitHub App 권한 승인
1. GitHub `https://github.com/settings/installations` → Cloudflare GitHub App(표시명은 계정에 따라 다를 수 있음) → `Configure`.
2. `Repository access`가 `Only select repositories`이면 `Peter-msk/Sunrise-PDF-Pro-web`을 추가하고 저장. GitHub 사용자/조직이 다르면 그 소유자 화면에서 승인.
3. Cloudflare Dashboard → `Workers & Pages` → `sunrise-pdf-pro-web` → `Settings` → `Builds` → `Connect` → GitHub → 해당 저장소를 선택.

## 정확한 Build 설정
- Repository: `Peter-msk/Sunrise-PDF-Pro-web`
- Production branch: `main`
- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Preview builds: 우선 끔(운영 안정화 뒤 선택적으로 활성화)
- Node.js: 22 (Github E2E 검증 환경; Cloudflare 빌드 환경도 호환성 확인)
- API Token: 배포 가능한 Cloudflare Workers Build token 사용. 계정에 이미 저장된 토큰의 권한 범위를 점검하거나 최소권한 토큰을 생성.
- 이 연결은 Cloudflare 빌드가 `main` push를 감지해 Worker를 자동 배포하게 됨.

## 운영 수락 시험
1. `GET https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/health`: `quality_target_dpi=300`, `wasm_delivery=cloudflare-static-assets`, `document_upload=false`.
2. `/local/rhwp_bg.wasm`: 크기 `11821756` bytes, SHA-256 `54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989`.
3. `/local/`: 실제 Chromium HWP/HWPX→PDF 저장/구조 확인. GitHub Actions `R29 LIVE Cloudflare Worker Browser-Local PDF Acceptance`를 **수동 실행**해 인증.
4. 기존 `/` 및 `/api/*`는 기존 정책대로 동작; `sunrise-pdf-editor`는 배포하지 않음.
5. 문제가 발생하면 Cloudflare Workers → Deployments에서 직전 안정 버전으로 rollback.

## 주의
- GitHub App이 이 저장소에 접근을 허용하지 않으면 Cloudflare API를 통해 우회 연결할 수 없음.
- 저장소 코드 `main` 병합이 곧 실제 운영배포 성공을 의미하지 않음.
- 기존 R29 LIVE 공개 사이트는 그대로 유지한 채 R31 자동배포 연결을 기다림.
