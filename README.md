# Sunrise PDF PRO Web

## Cloudflare Workers — 실제 테스트 주소

**https://sunrise-pdf-pro-web.ko-pg.workers.dev**

- 실행 유형: **Cloudflare Workers** (별도 Worker, Pages 아님)
- Worker 이름: `sunrise-pdf-pro-web`
- 보호 대상 기존 PDF Editor: `sunrise-pdf-editor` (코드·배포 유지)
- GitHub: `Peter-msk/Sunrise-PDF-Pro-web-`
- Worker 코드: `src/worker.js`
- Wrangler 설정: `wrangler.jsonc`
- 과거 동일 이름의 Pages 프로젝트: Worker 전환 후 삭제 완료

## 현재 검증 범위

Cloudflare Workers에서 PC/모바일 웹 UI를 제공합니다. HWP/HWPX 파일 선택, 확장자·기본 헤더 검사는 클라이언트에서 가능하나, **실제 HWP/HWPX→PDF 변환 엔진은 아직 연결되지 않았습니다.**

- `GET /api/status`: 엔진 미연결임을 표시합니다.
- 다른 `/api/*`: HTTP 503 `BACKEND_NOT_CONNECTED`를 반환합니다.
- 사용자 문서를 변환 서버로 전송하지 않고, 가짜 PDF 결과를 만들지 않습니다.
- 최종 사용자는 한컴/Python/Java/rhwp 설치가 필요하지 않습니다.

## 관리 및 배포

1. Cloudflare **Workers & Pages**에서 `sunrise-pdf-pro-web` **Worker**를 선택합니다. `sunrise-pdf-editor`를 변경하지 마세요.
2. Worker 소스는 `src/worker.js`에 있습니다. HTML·CSS·JS는 해당 Worker 코드에 포함된 스냅샷입니다. 참고용 원본은 `public/`이며, **`public/`만 수정해도 Worker가 자동 갱신되지 않습니다.**
3. Wrangler CLI를 사용하는 경우 저장소 루트에서 `npx wrangler deploy`를 실행합니다. Cloudflare 연결/인증은 개발자에게만 필요합니다.
4. 현재 GitHub push와 Cloudflare Workers 간 자동배포는 아직 연결하지 않았습니다. 수동/연결된 CI에서 배포할 수 있습니다.

자세한 안내는 [WORKERS_DEPLOYMENT.md](WORKERS_DEPLOYMENT.md)를 참고하세요.

## 다음 단계

별도의 안전한 Linux 변환 서버(FastAPI + 공식 rhwp CLI)를 연결하고, PDF 출력 품질 및 실제 브라우저 E2E 시험을 완료해야 합니다. Cloudflare Workers에 Linux 실행파일을 직접 설치하는 방식은 사용하지 않습니다.
