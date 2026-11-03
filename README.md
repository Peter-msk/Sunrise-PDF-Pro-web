# Sunrise PDF PRO Web — Cloudflare Workers

**[웹 테스트 사이트](https://sunrise-pdf-pro-web.ko-pg.workers.dev)** · Cloudflare Worker `sunrise-pdf-pro-web` (기존 `sunrise-pdf-editor`와 완전 별개)

## R28 구현·실검증 상태

| 검증 단계 | 결과 |
|---|---|
| Cloudflare Worker 웹 UI 배포 | 완료 |
| Worker ↔ Linux FastAPI HMAC 프록시 코드 | 배포 및 로컬 검증 완료 |
| 공식 rhwp v0.8.7 **실제 HWP → PDF** | [GitHub Actions PASS](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41636542190) |
| 공식 rhwp v0.8.7 **실제 HWPX → PDF** | [동일 실행 PASS](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41636542190) |
| 공식 Linux rhwp 포함 백엔드 Docker 빌드 | [GitHub Actions PASS](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41637866326) |
| **Docker 이미지 내부 실제 HWP/HWPX→PDF** | [GitHub Actions PASS](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41638389696) |
| FastAPI 보안/기존 기능 회귀시험 | 312 PASS / 1 SKIP |
| 로컬 실제 HTTP Edge 인증검증 | 9/9 PASS |
| Cloudflare Worker → 상시 Linux 원본 서버 → PDF 다운로드 | **미완료** |

공식 rhwp 변환 시험은 upstream의 HWP와 HWPX 원본을 PDF로 직접 변환했습니다. 각 1쪽이며 PDF 구조·SHA-256 검증이 통과했습니다. **사용자 웹사이트에서의 변환 성공을 의미하지는 않습니다.**

## 배포 소스

- `src/worker.js` — 브라우저 UI 및 보안 프록시
- `public/` — 웹 UI 소스
- `backend/r28_backend_runtime.tar.gz` — 실제 R27 FastAPI 업무 로직 + R28 HMAC 보안 게이트, 무결성 고정
- `backend/Dockerfile` — 공식 rhwp Linux x86_64 실행파일 SHA-256 검증, Debian 13 기반
- `backend/docker-entrypoint.sh` — 원본 서버 비밀값 확인 및 FastAPI 실행
- `.github/workflows/r28-real-rhwp.yml` — 실제 CLI HWP/HWPX→PDF 검증
- `.github/workflows/r28-backend-build.yml` — 실제 Docker 빌드 검증
- [R28 상세 개발 현황](R28_RELEASE_STATUS.md)

## 웹사이트 PDF 변환 기능이 아직 비활성화된 이유

현재 Cloudflare 계정의 **Containers API가 Workers Paid 플랜 필요 오류로 거부**됩니다. Workers V8 자체에서는 Linux 네이티브 rhwp CLI를 직접 실행할 수 없습니다. 따라서 Linux 컨테이너를 가동할 별도 호스트가 현재 없습니다.

Worker는 `SUNRISE_BACKEND_ORIGIN`(HTTPS 주소)와 `SUNRISE_EDGE_HMAC_SECRET`(Cloudflare secret) 모두 없으면 문서 업로드를 차단하고 HTTP 503 `BACKEND_NOT_CONNECTED`로 응답합니다. 사용자 문서를 가짜 PDF로 처리하지 않습니다.

상시 Linux 서버가 확보되면 [백엔드 배포 안내](backend/README.md)에 따라 원본을 실행하고, Cloudflare Worker에 두 비밀값을 입력한 후 브라우저 E2E 검증을 수행합니다.

**기존 PDF Editor Worker `sunrise-pdf-editor`를 변경하지 않습니다.**
