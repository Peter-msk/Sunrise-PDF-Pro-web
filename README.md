# Sunrise PDF PRO Web

**공식 rhwp 오픈소스 기반 · 별도 유료 변환 API 불필요**

## 현재 공개 변환 사이트

- **[브라우저 로컬 HWP/HWPX → PDF 변환기](https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/)**
- [기존 메인 화면](https://sunrise-pdf-pro-web.ko-pg.workers.dev/) — 무료 로컬 변환기로 연결되는 안내 링크 포함
- Cloudflare Worker `sunrise-pdf-pro-web` (기존 PDF Editor `sunrise-pdf-editor`와 별도)
- 실제 공개 사이트 Chromium 실변환 검증: [GitHub Actions 41643648944 — PASS](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41643648944)

## 소스 직접 통합

- 오픈소스: `edwardkim/rhwp` **MIT**, 태그 `v0.8.7`
- 원본 Rust 소스 고정 참조: Git 서브모듈 `vendor/rhwp-upstream/` (커밋 `1a76570e833917d15817415a53c09ad61ab3203f`)
- 브라우저 WASM: `@rhwp/core@0.8.7`, 의존성 직접 패키징: `browser-local/`
- 브라우저 PDF 생성: `pdf-lib@1.17.1`
- 컴파일된 자체 JS: `worker-assets/local-bundle.js`
- 배포 Worker: `src/worker.js`
- MIT 저작권: `THIRD_PARTY_RHWP_LICENSE.txt`

## 데이터 처리 방식

원본 HWP/HWPX 파일은 **사용자 브라우저 안에서만 처리**합니다. 변환 서버에 업로드하거나 유료 변환 API로 보내지 않습니다. Worker는 초기화에 필요한 공개 `rhwp_bg.wasm` 정적 실행 바이너리만, **고정 버전 npm CDN에서 SHA-256 검증 후** 전달합니다. 정적 바이너리를 받는 작업과 사용자 원본 문서를 업로드하는 작업은 다릅니다.

### 반드시 알아야 할 PDF 품질 제한

현재 PDF는 렌더링된 SVG 페이지를 이미지화하여 조립한 **이미지 기반 PDF**입니다. 따라서 PDF 텍스트 선택·검색이 되지 않습니다. 문서 글꼴, 서식, 이미지, 특수 개체에 따라 출력 품질 차이가 생길 수 있습니다. 복잡한 실무문서의 조판·페이지 나눔 품질평가는 별도 단계입니다.

## 검증 상태

- 기존 공식 Linux rhwp CLI 실변환 (HWP/HWPX): PASS
- 브라우저 로컬 WASM HWP/HWPX 실변환: [PASS](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41641674622)
- **실제 Cloudflare 공개 사이트에서 Chromium PDF 다운로드 및 구조검사: [PASS](https://github.com/Peter-msk/Sunrise-PDF-Pro-web-/actions/runs/41643648944)**
- 동일한 브라우저 접속 경로에서 문서 원본의 외부 업로드 요청: 없음
- 기존 PDF Editor Worker: 수정하지 않음

## 배포 구조

`src/worker.js`는 기존 API 사용 가능성을 보존하면서 `/local/`에 별도 브라우저 변환기를 추가합니다. `/local/rhwp_bg.wasm`은 공식 WASM 정적 자산의 SHA-256 확인 후 서빙하며, 변환 API 및 상시 Linux 서버 구독은 필요하지 않습니다. 서버 백엔드 관련 `backend/` 코드는 연구·선택적 고품질 변환 확장용으로 유지합니다.

개발용 안내는 `browser-local/README.md` 및 `R29_CLOUDFLARE_BROWSER_ROUTE.md`를 참고하세요.
