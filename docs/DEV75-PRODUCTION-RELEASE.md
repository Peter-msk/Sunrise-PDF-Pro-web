# DEV75 운영 출시 기록 · 2026-11-27

## 출시 기준
- 운영 배포 커밋: c2287ba8c51e3a46ba4e632fbf0718f362e81424
- 운영 보존 브랜치: release/dev75-production-20261127
- 개발 브랜치: fix/dev75-unrestricted-conversion-20261126
- 운영 배포: 2026-11-27 07:34:40 KST
- Cloudflare build: 62668f42-7bb7-49c2-aa91-7eed00bf177e (success)
- Worker: sunrise-pdf-pro-web / 1d3666a4-821e-48ab-b7c0-a8dcb91802c0 / 100%
- 롤백: dc6de856-c4a4-4589-aa21-44a173075708
- main 이전 기준은 backup/main-before-dev75-20261127에 보존.
- 내부 버전 표기는 0.41.0-dev1 유지.

## 변경 사항
DEV66~73 관리자 인증, 작업 ID 통계, 오류 추적, 문의·공지, 반응형 UI, 보안, DB 보존 및 배포 통합. DEV74 대량 셀 메모리 복사 감소, 선택 ZIP 및 미리보기. DEV75 주요 인위적 파일·SVG·이미지·벡터 처리 상한과 기본 시간 제한 해제, 원본 픽셀 보존 우선, JPEG 헤더 점진 읽기, 대형 엑셀 표 벡터 출력. 지원 범위와 파일 구조·보안·출력 무결성 검사는 유지.

## 실제 출시 검사
- 관리자 29/29, 변환 602/605, 고유 합계 631/634 (실패 0, 미실행 3).
- DEV75 신규 5건은 변환 시험에 포함. 추가 출시 20/20은 중복 집계 제외.
- 소스 연동 61모듈, 배포용 빌드, 정적 자산 검사, Worker 계약, Wrangler dry-run 및 실제 deploy 성공.
- 실제 사용자 대용량 HWP/HWPX/XLSX PDF 출력 및 관리자 브라우저 E2E 미확인. Poppler 필요 시험 3건 미실행.

## 운영 및 공지
- D1 변환 작업 테이블과 문의 인덱스 적용 확인, 기존 계정 1개와 ADMIN_SETUP_KEY 유지. 04:00 KST 보존 작업 유지.
- 공지사항: [공지] Sunrise PDF PRO(Web) DEV75 운영 업데이트 안내
- 업데이트: DEV75 업데이트 — 대용량 PDF 변환 제한 해제 및 운영 안정화
- 두 게시물은 2026-11-27 운영 D1에 published로 등록. 현재 사용자 피드는 게시일 포함 KST 7일 노출 정책.
- 프로그램의 인위적 상한 해제는 무한 메모리·무한 파일 크기 지원을 의미하지 않음. 브라우저/Canvas/WASM, PDF, ZIP32 및 압축 구조 안전 조건은 남음. 동기 엔진 정체는 탭 재시작 필요할 수 있음.
- 관리자 로그인 proof 재전송 방어 및 일부 진단 데이터 중복 위험은 후속 보안 개선 대상으로 유지.
- [운영 서비스](https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/) · [관리자](https://sunrise-pdf-pro-web.ko-pg.workers.dev/admin/)
- [운영 기준 소스 ZIP](https://github.com/Peter-msk/Sunrise-PDF-Pro-web/archive/c2287ba8c51e3a46ba4e632fbf0718f362e81424.zip)
