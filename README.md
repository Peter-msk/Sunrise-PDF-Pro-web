# Sunrise PDF PRO Web

## 웹 검증 사이트

- **Cloudflare Pages:** https://sunrise-pdf-pro-web.pages.dev
- **GitHub 저장소:** https://github.com/Peter-msk/Sunrise-PDF-Pro-web-
- **Pages 배포 방식:** Cloudflare API를 통한 직접 배포 (GitHub 자동연동 권한 설정 대기)
- **배포 소스:** `public/` 및 `functions/api/` (R27 기반 브라우저 UI 스테이징)

이 사이트는 **웹 화면 검증 단계**입니다. HWP/HWPX 파일 선택과 기본 서명 검사는 브라우저에서 수행하지만, 변환 백엔드가 준비되지 않아 PDF 생성은 비활성화됩니다. API는 엔진이 없는 상태를 알리고 변환 요청을 HTTP 503으로 거부합니다. 가짜 결과나 사용자 문서 업로드를 생성하지 않습니다.

### 핵심 제품 아키텍처

- **웹 화면:** Cloudflare Pages — PC/모바일 브라우저
- **PDF 변환:** 기존 R27 Python FastAPI + 공식 `rhwp` CLI (별도 안전한 Linux 변환 워커 필요)
- **원본 보기:** 공식 `@rhwp/core` WASM 정적 자산의 검증 후 탑재 예정
- **사용자 PC:** 한컴·Python·Node·Java·rhwp 설치 불필요

### Cloudflare Pages 정적 사이트 배포

- 배포 브랜치: `main`
- 빌드 명령: 없음
- 출력 디렉터리: `public`
- Pages Functions: `functions/api/`

Cloudflare의 비공개 GitHub 저장소 접근 권한이 연결되면 Git 기반 자동배포로 전환할 수 있습니다. 지금은 Pages 프로젝트 자체는 직접 배포되어 있습니다.

자세한 내용은 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요.

### 현재 제한 및 보안

R27 FastAPI 원본 전체는 아직 이 저장소에 업로드되지 않았습니다. Cloudflare Pages가 Python·native rhwp CLI를 직접 실행한다고 간주해서는 안 됩니다. 백엔드 인증, 작업 격리, 실제 HWP/HWPX→PDF 변환과 품질검증 완료 전에는 변환 서비스를 공개하지 않습니다. 비밀번호·토큰·사용자 문서는 저장소에 올리지 않습니다.
