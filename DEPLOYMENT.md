# Cloudflare Workers 배포 안내 — Sunrise PDF PRO Web

## 현재 배포 상태

- **Cloudflare Worker:** `sunrise-pdf-pro-web`
- **웹 주소:** https://sunrise-pdf-pro-web.ko-pg.workers.dev
- **별도 유지:** 기존 `sunrise-pdf-editor` Worker
- **GitHub:** https://github.com/Peter-msk/Sunrise-PDF-Pro-web-
- **Pages:** 기존 테스트용 Pages 프로젝트 `sunrise-pdf-pro-web`는 Worker 배포 검증 후 삭제했습니다.

## 개발·관리

Cloudflare 대시보드의 Workers 목록에서 새 Worker를 선택하거나 저장소의 `wrangler.jsonc`로 관리하세요.

```bash
npx wrangler deploy
```

`src/worker.js`는 `public/index.html`, `public/style.css`, `public/app.js`를 문자열로 포함한 Workers용 통합 스냅샷입니다. `public/` 파일만 수정해도 자동으로 Worker에 반영되지 않는다는 점에 주의하십시오.

## 테스트

- `/`: 웹 화면 표시
- `/style.css`와 `/app.js`: 정적 UI 리소스
- `/api/status`: 엔진 미연결 상태를 표시하는 JSON
- `/api/jobs` 등: HTTP 503 반환

실제 문서 변환은 현재 비활성화되어 있으며, 사용자 파일은 업로드하지 않습니다. **실제 HWP/HWPX→PDF 품질 검증은 미완료입니다.** Cloudflare Workers는 외부에서 Linux rhwp CLI를 실행하는 안전한 백엔드와 연동해야 합니다.

## 사전 주의

기존 PDF Editor와 새 PDF PRO의 이름이 비슷하므로 배포 대상 문자열을 반드시 확인하십시오. GitHub 액세스 토큰·Cloudflare 토큰·사용자 실문서는 Git에 커밋하지 않습니다.
