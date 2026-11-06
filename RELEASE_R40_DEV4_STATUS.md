# Sunrise PDF PRO Web — R40-DEV4 정식 배포 게이트 (2026-11-06)

- 저장소: `Peter-msk/Sunrise-PDF-Pro-web`
- 운영 브랜치: `main`; 기존 배포 커밋 `c26a64b5bff6ff465fbdfd148a78d13a89a2df67`
- 최신 로컬 기준본: `Sunrise_PDF_PRO_Web_R40_DEV4_Source_Checkpoint.zip` (GitHub 미반영)
- 이 브랜치는 **인수 및 배포 준비 브랜치이며, 최신 R40-DEV4의 실기 검증/배포를 완료했다는 뜻이 아님**.

## 필수 요구사항

1. 입력 HWP/HWPX **다중 파일** 처리, 개별 PDF/ZIP, 진행/취소/실패/재시도 및 자원 정리.
2. 기본 PDF는 rhwp 기반 글자/표/도형 보존 경로. 이미지 자동 대체 금지; 미지원 글꼴/SVG는 오류를 명시하고 작성 중인 PDF 폐기.
3. 실제 생성 PDF를 재열어 페이지 수, 추출 텍스트, 이미지 XObject 여부, 표/도형 위치 확인.
4. 한컴 COM PDF와 동일 문서 품질 대조. 미지원 문서의 성공률을 근거 없이 100%라고 표기하지 않음.
5. 메인 UI/변환기 UX 통합, 300dpi/페이지 정확도/웹 브라우저 접근성.
6. source 검사, lockfile 기반 빌드, 핵심 단위시험, 실제 Chromium PDF 다운로드/ZIP 다중파일 E2E.
7. 기존 `sunrise-pdf-editor` Worker 변경 금지; `sunrise-pdf-pro-web`만 배포.

## 2026-11-06 확인 사실

- Cloudflare Workers Builds의 GitHub 연결은 정상: 계정 내 `sunrise-pdf-pro-web`, main 자동 트리거.
- 기존 main 자동빌드 `84f9f335-8475-4d00-8e5b-df43106420af`은 2026-11-05 success. 버전 `7a789576-aa0d-4601-ac26-47f1e69f1e16`이 100% 배포됨.
- R40-DEV4 체크포인트 소스 단독 검사는 PASS. 현 컨테이너에 npm 의존성과 인터넷이 없어 전체 build/E2E는 이번 점검에서 수행하지 못함.
- R40-DEV4 개발 인수기록상 실제 다운로드된 PDF/ZIP을 확보해 품질을 재검증하지 못했고, 한글/다중 글자 폭 조정·COM 대조는 미완료.
- **운영 main에 R40-DEV4 머지는 금지**: 최신 소스 커밋, CI PASS 및 전문 PDF 실파일 검사 이후 승인.

## 배포 프로세스

최신 R40-DEV4 소스를 이 release 브랜치에 보존 → GitHub PR 및 CI 증거 첨부 → 실문서 PDF QA 확인 → main 병합 → Cloudflare Builds 자동 배포 → /local/health·WASM 해시·실문서 브라우저 PDF/ZIP·롤백 경로 확인.

이 문서는 배포 가능 여부의 사실 기록이며, 완료하지 못한 테스트를 PASS로 주장하지 않습니다.
