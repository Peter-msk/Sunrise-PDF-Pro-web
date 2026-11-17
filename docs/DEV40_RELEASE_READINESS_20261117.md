# Sunrise PDF PRO(web) DEV40 — 2026-11-17 정식 배포 요청과 실제 출고 게이트

## 사용자 승인 및 실제 처리 현황

사용자는 2026-11-17 정식 배포를 명시적으로 요청했다. **출고 의사는 확인되었지만 실제 배포는 실행하지 않았다.** 최신 코드의 정상 빌드 산출물을 안전하게 만들 환경이 준비되지 않았기 때문이다.

| 항목 | 확인된 사실 |
|---|---|
| 연결된 Cloudflare Account | 연결 확인 (Worker `sunrise-pdf-pro-web`) |
| 운영 Worker 최신 배포 | `2026-11-14T16:19:14.994795Z`, version `5a8f74e4-319a-4e2e-8b15-a0841d802d57`, 100% |
| 운영 Worker 바인딩 | ASSETS, PRO_ADMIN_DB(D1), 3개 인증 secret(값은 조회/저장하지 않음) |
| Worker Cloudflare Builds | 빌드 구성 없음, 트리거 없음, 빌드 이력 없음 |
| DEV36→DEV40 PR | #35~#39 모두 Draft / OPEN / 미병합, 이어지는 개발 브랜치 기반 |
| DEV40 원본 SHA (배포 준비 전) | `00be908c77e9744e363665974ebe0e43aad3bab0` |
| GitHub 커밋 상태검사 | DEV36 및 DEV40 성공 CI status 없음 |
| npm/Node 개발 실행 컨테이너 | Node 22/npm 10 존재, 해당 프로젝트의 npm 패키지/캐시 없음, registry.npmjs.org DNS 실패 |
| 필수 문서 수락 | HWP/HWPX 25개 실기, PDF 8개·124쪽 원본대조 미완료 |

## 이번 턴 새로 완료한 배포 준비

1. `scripts/Release-SunrisePDFProWeb.ps1` (PowerShell) 작성/커밋. **기본 실행은 빌드 검증만**, `-Deploy` 옵션을 명시했을 때만 빌드 PASS 이후 `wrangler@4 deploy` 실행.
2. 안전조건: Worker 이름, Worker 코드 entrypoint, 웹 assets 디렉터리, 개발 브랜치, clean worktree, Node 22+, lockfile 유무를 배포 전 확인.
3. 의존성 설치(`npm ci`) → `check:source` → `check:engine` → 전체 `npm test` → Vite build → `verify:dist` → WASM 해시/자산/Worker 경로 검사 순서. 실패 시 배포 중단.
4. 실제 추가된 2개 Noto 서체의 Worker GET/HEAD 경로가 기존 `scripts/test-worker-assets.mjs`에서 누락된 것을 수정함. Worker `src/worker.js`의 기존 allowlist에는 두 경로가 이미 있었으므로 **운영 코드 변화 없음**.
5. 정적 검사: PowerShell 배포 게이트 선언과 순서 10개/10개 충족(구문을 Windows PowerShell 엔진에서 실행한 것은 아님). Worker route test JS 구문 파싱 PASS, Worker allowlist와 테스트 경로 3종 대응 확인.

## Windows 개발 PC에서 실제 출고 진행 명령

```powershell
git fetch origin
git switch fix/dev40-original-pdf-acceptance-20261116
git pull --ff-only origin fix/dev40-original-pdf-acceptance-20261116
# 25문서 및 124쪽 수락 자료/실물 비교를 담당자가 먼저 확인할 것
# 빌드·검증만 원하는 경우 (배포하지 않음)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Release-SunrisePDFProWeb.ps1
# 위 명령 대신, 실제 수락 후 최종 배포할 때는 한 명령으로 검사와 배포 실행
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Release-SunrisePDFProWeb.ps1 -Deploy
```

두 명령을 순차 실행하면 불필요하게 모든 테스트를 두 번 수행하므로 **목적에 맞는 하나만 선택**한다.

위 스크립트의 GitHub 경로는 `scripts/Release-SunrisePDFProWeb.ps1`. 이전 버전의 `scripts/verify-browser-build.mjs`와 `scripts/test-worker-assets.mjs`를 재사용하고 기존 테스트 게이트를 우회하지 않는다. `wrangler.jsonc` 구조 유지, GitHub Actions 설정 변경·D1 migration·secret 교체·main 병합 없음.

## 배포 차단 사유와 다음 전제 조건

- 최신 DEV40 전체 테스트 및 WASM/글꼴 포함한 정식 Vite dist를 실제로 생성하지 못했으므로, Cloudflare Workers API로 Worker 코드만 업로드하면 **지금 운영 중인 ASSETS 기반 서비스를 훼손할 수 있음**.
- 실제 HWP/HWPX 변환 품질 25/25와 PDF 124쪽 원본 정합성은 미확인. 사용자의 배포 요청 자체가 이런 기술적 검증을 통과시켜 주는 것은 아님.
- 연결된 Cloudflare API는 기존 프로덕션의 배포/계정 상태를 **읽기**로만 확인했다. Cloudflare upload/version/deployment를 생성하지 않았다.
- 실제 Windows 빌드/검증 성공 증거가 생기면 이 배포 스크립트로 **새로 생성된 정적 자산과 Worker 코드를 함께** 배포해야 한다.

**최종 상태: 출고 준비 스크립트 및 대상/검증 경로 확인 완료. 운영 프로덕션 배포 미실행.**
