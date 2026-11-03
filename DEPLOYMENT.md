# Sunrise PDF PRO Web — Cloudflare Pages 검증 배포

Cloudflare Pages에서는 `public/` 디렉터리의 웹 UI를 서비스합니다. 웹 화면과 서버 변환 기능은 서로 다른 배포 대상입니다.

## 현재 상태

- **검증 가능:** 반응형 화면, 파일 선택, HWP/HWPX 파일의 기본 헤더 검사, 서버 준비상태 표시, 변환 버튼 안전 차단.
- **아직 불가:** 실제 rhwp PDF 변환, 로그인, 변환 이력, 사용자 문서 업로드.
- **고정된 안전 계약:** `GET /api/status`는 엔진 미연결 상태를 알리며, `/api/*`의 다른 요청은 HTTP 503을 반환합니다. 가짜 PDF를 생성하지 않습니다.

## GitHub → Cloudflare Pages

- 저장소: `Peter-msk/Sunrise-PDF-Pro-web-`
- 브랜치: `main`
- 빌드 명령: 없음
- 빌드 출력 폴더: `public`
- 루트: 프로젝트 루트

## 실변환 연결 기준

기존 R27 FastAPI 웹 API는 Linux 격리 워커에서 `rhwp` CLI로 변환합니다. Pages는 이 CLI 실행을 직접 대체할 수 없습니다. 별도 백엔드를 구성한 뒤 같은 출처의 API 프록시/인증 연결이 필요합니다. 현재 Pages의 API 차단 함수를 조용히 제거하거나, 공개 사용자 문서를 검증되지 않은 서버로 전달해서는 안 됩니다.

## 보안

민감한 문서, 데이터베이스, 계정·API 토큰, 자격증명, 시험용 실제 사용자 파일은 Git에 올리지 않습니다. `public/_headers`에서 기본 CSP를 적용합니다. 현재 공개 Pages URL에서는 백엔드 미연결 사실을 화면에 명시합니다.
