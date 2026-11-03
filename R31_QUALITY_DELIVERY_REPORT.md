# Sunrise PDF PRO (Web) — R31 PDF 품질 감사 및 배포 인수인계

- 2026-11-03 KST
- 기준 브랜치: `dev/r31-quality-static-assets-cicd`
- 브라우저 실변환 / Wrangler 구성 검증: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/41659618402

## 1. PC 대 Web 변환품질 실문서 6쪽 감사
사용자 제공 같은 원본 기반의 두 PDF 비교. 원본 문서에는 환경영향평가 대기질 저감방안·세륜/측면살수 시설 표/도면/사진이 포함되어 있음. 개인정보·실문서 바이트/이미지는 저장소에 커밋하지 않음.

| 지표 | PC/Hancom PDF | Web/rhwp WASM PDF |
|---|---:|---:|
| 페이지 | 6 | 6 |
| 파일 바이트 | 2,461,565 | 4,547,163 |
| 추출가능 PDF 문자 | 2,042자 | 0자 |
| 각 페이지 주요 구성 | 글꼴·텍스트 객체/선·사진 | 단일 페이지 PNG |
| A4 변환 페이지 래스터 | 대상 외 | 1,587 × 2,245 px |
| 표·지도·복잡 도면 | 글꼴 및 사진 원본/벡터 요소 보존 가능 | 페이지 전체가 이미지로 제한됨 |

- 101~102쪽: 작은 한글 글씨, 표 내부 조판/글자 획, 굵은 제목 선명도 차이.
- 103쪽: 현장 사진/구성도 이미지와 작은 라벨/주석 차이.
- 104~106쪽: 얇은 도면 선, 작은 치수·범례의 품질 차이.
- Web PDF에는 폰트 및 텍스트 객체 자체가 없으므로 해상도를 높여도 텍스트 선택·검색은 회복되지 않음.

## 2. R31 구현
1. `browser-local/src/converter.js`: A4 페이지 출력 목표 300 dpi(`300/96` 스케일), 페이지당 최대 9,000,000 픽셀로 메모리 한계 유지. 초고해상도/비정상적 페이지는 9MP 상한에 맞춰 축소.
2. `browser-local/scripts/copy-wasm.mjs`: 패키지 내 공식 `@rhwp/core@0.8.7` WASM 파일을 크기 11,821,756B 및 SHA256 `54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989`로 빌드 전 검증.
3. `wrangler.jsonc`: `browser-local/dist` 경로를 Cloudflare Workers Static Assets (`ASSETS`, Worker-first)로 바인딩.
4. `src/worker.js`: 예전 JS/HTML 임베딩(~543KB) 및 원격 jsdelivr WASM 프록시 제거, `/local/`, JS, WASM 요청에 `env.ASSETS.fetch` 사용. 바인딩이 없으면 503 fail-closed, 파일 업로드 경로 없음.
5. `package.json` 및 `scripts/verify-browser-build.mjs`, `scripts/test-worker-assets.mjs`: 항상 실제 브라우저 dist 빌드 결과/ASSETS 라우팅 검증. `dist/app.html`은 HTML canonical redirect 회피용.
6. `.github/workflows/r29-browser-local.yml`: 빌드·정적 E2E/브라우저 E2E 및 Wrangler dry-run, 중복 테스트 최소화, GitHub 기본 권한 읽기 전용.
7. `.github/workflows/r29-live-worker.yml`: 운영 URL E2E는 main 브랜치 변경에만 실행하도록 분리.

## 3. 실제 CI 검증
- PASS: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/41659618402
- WASM SHA-256 및 크기 검증, Worker ASSETS 계약, `npx wrangler@4 deploy --dry-run` PASS.
- 공식 HWP/HWPX 브라우저 실 PDF 생성: PASS.
- 공식 두 파일의 실 출력 첫 페이지: 2,480 × 3,508 px.
- 요청 origin 테스트: same-origin only.
- 실제 사용자 환경영향평가 문서 원본 HWP 파일로 **R31 전후 재변환 및 정밀 시각 비교는 미검증**. 사용자 제공 원본은 PC/Web PDF 두 벌뿐.

## 4. 릴리즈 및 추후 작업
- Cloudflare Workers Builds의 GitHub `Peter-msk/Sunrise-PDF-Pro-web` 저장소 자동배포 구성 별도 필요 (Cloudflare 계정 및 토큰 검증).
- 운영 배포 후 `/local/health`, `/local/rhwp_bg.wasm` 무결성, 실제 Chromium HWP/HWPX→PDF 테스트 재검증.
- PC와 동등한 PDF를 얻으려면 한컴 글꼴, 텍스트/벡터 PDF 출력, 고해상도 삽입 이미지 보존, 페이지 단위 서식/줄바꿈을 따로 개선해야 함.
- `sunrise-pdf-editor` Worker는 수정 금지, 기존 `/api/*` fail-closed 계약 유지.
