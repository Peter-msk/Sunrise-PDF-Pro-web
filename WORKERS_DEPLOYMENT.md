# Sunrise PDF PRO Web — Cloudflare Workers 배포

**실제 배포 대상:** Cloudflare Worker `sunrise-pdf-pro-web` (별도 프로젝트)

**보호 대상:** 기존 Worker `sunrise-pdf-editor` — 변경 금지

이 저장소의 `src/worker.js`는 R27 웹 UI를 Workers 런타임에서 직접 제공하는 안전한 시험판입니다. `public/`의 HTML·CSS·JS를 소스에 포함한 단일 Worker입니다. PDF 변환 엔진은 아직 연동되지 않았으므로 `GET /api/status`는 `rhwp_cli_available:false`를 반환하고 다른 `/api/*`는 HTTP 503으로 차단합니다.

## 관리

- [Workers 대시보드](https://dash.cloudflare.com/) → Workers & Pages → `sunrise-pdf-pro-web`
- 이름 혼동 금지: `sunrise-pdf-editor`는 기존 편집기입니다.
- Workers 코드 수정/배포: `npx wrangler deploy` (`wrangler.jsonc` 사용)

## 보안 및 미구현 범위

사용자 문서를 수신하지 않고, 세션·비밀번호나 실문서를 GitHub에 포함하지 않습니다. HWP/HWPX→PDF는 기존 FastAPI+rhwp CLI 변환 서버를 안전하게 연동한 뒤 개방해야 하며, Cloudflare Workers에 해당 CLI를 직접 올린 것으로 간주하지 않습니다.

이전 Cloudflare Pages 프로젝트는 신규 Worker를 실제 확인한 후 비활성화/삭제하는 대상입니다.
