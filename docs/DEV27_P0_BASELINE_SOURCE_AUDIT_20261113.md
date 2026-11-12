# Sunrise PDF PRO(Web) — DEV27 P0 기준본·코드 감사 (2026-11-13 KST)

## 판정
- 상태: **P0 소스 무결성 PASS / 최신 운영 기준 식별 PASS / 근본 원인 재현 NOT VERIFIED**.
- 대상 저장소: Peter-msk/Sunrise-PDF-Pro-web.
- 개발 브랜치: dev/dev27-p0-baseline-audit-20261113 (현 운영과 격리, 배포 트리거 변경 없음).
- 최신 GitHub main 기준 커밋: 79c1ffdc0cd1f93b6307a97cb4d04a8949b5cb6b.
- 실제 배포 소스 커밋: 831e42e94166ffc25052b178c26be16ae965a149. 두 커밋 사이 변경 파일은 GitHub Actions 워크플로, 운영 테스트, 릴리스 보고서이며 애플리케이션 소스 변경은 비교 결과에 나타나지 않는다.
- Cloudflare Workers 운영 배포: 197c49d1-21db-4e94-9ccc-750dc397d1a5, 버전 a8654fda-fc51-4395-be13-0600ccf2097e, 트래픽 100%; 직전 롤백 참고 버전 40308b40-262f-4a68-9023-41f002f2621b.
- 확인 근거: Cloudflare deployments/versions 읽기 전용 조회, GitHub main 및 commit 비교, DEV26 정식 배포보고.

## 1. 인수 ZIP 검사 — 완료
- 입력: Sunrise_PDF_PRO_DEV26_FINAL_HANDOVER_20261112.zip (13,592,888 bytes).
- 검사: 패키지 내 실행도구/verify_integrity.py 실행.
- 결과: **439/439 manifest-listed files SHA-256 PASS**. SOURCE_PRODUCTION_DEPLOYED 200개, SOURCE_NEXT_QA_VERIFIED_NOT_DEPLOYED 204개 파일 모두 일치.
- ZIP 경로 안전성 검사: 절대경로 또는 부모경로 이탈 항목 없음.
- 주의: ZIP의 SHA-256 검사는 패키지 내부 기록과 실제 압축 해제 파일 사이의 무결성 확인이며, 외부 신뢰 주체가 서명한 원본 인증을 의미하지 않는다.
- **ZIP은 11월 12일 과거 시점의 기준본이다.** 현재 운영 통합 이후 최신 main과 동일한 소스라고 가정하거나 ZIP의 누적 patch를 main에 재적용하지 말 것.
- 확인 예: 보관 ZIP QA 사본의 browser-local/src/svg-professional.js Git blob은 361c832c9a10...이며 최신 main의 GitHub blob은 beba56ec7bb8...이다. local-fonts.js는 QA 사본과 main의 blob 3eddbbe2467c...가 일치한다. 버전 혼재를 임의로 합치지 않는다.

## 2. 실행 경로 및 단일 소유권 감사 (현재 main 소스 읽기 전용 확인)
| 영역 | 현재 소유 모듈 | 관측된 계약 | 판정 |
|---|---|---|---|
| UI/큐/수명주기 | browser-local/src/main.js, batch.js | 완료 파일 보존, 파일별 재시도, visibility/freeze/resume/BFCache 상태 안내 | 소스 확인; 사용자 PC 미수락 |
| HWP/HWPX 파싱 | browser-local/src/converter.js | HwpDocument 재사용, 1~120쪽 한계, WASM 자원 finally 정리, professional 기본값 | 소스 확인 |
| PC 서체 | local-fonts.js, pdf-fonts.js | 원본 SVG 지정 이름→로컬 후보→바이트/face→측정용 FontFace→PDFKit 등록/선택; 일부 서체 시간 예산에 따라 스킵 가능 | Windows 실제 서체 미수락 |
| 전문 PDF | svg-professional.js, pdfkit-backend.js | 전문 벡터 우선, 미지원 필터 fail-closed, pdf.end 후 data/end 수집, 출력 상한 512 MiB | 사용자 실패 문서 재현 필요 |
| 전체/부분 이미지 대체 | raster-compat-pdf.mjs, svg-filter-hybrid.mjs, conversion-recovery.mjs | 자동 강등 금지, 파일별 사용자 명시적 재시도 | 소스 확인 |
| PDF 무결성 | pdf-output-integrity.mjs | 헤더/xref/trailer/EOF 구조 검사; 완전한 PDF 파서·시각 정확성 검사는 아님 | 소스 확인 |
| 익명 진단 | pro-telemetry.js | 파일명·원문·글꼴 바이트 없이 허용된 코드·단계·기간만 전송 | 소스 확인; 작업별 연결성 제한 |

## 3. 오류 관련 사실과 미해결 구분
1. PDF_STREAM_TIMEOUT: svg-professional.js는 기본 finalizeTimeoutMs=120000으로 pdf.end 이후 PDFKit 종료를 기다린다. streamProbe는 NO_BYTES/NO_FINAL_BYTES/FINAL_BYTES_NO_END/END_SEEN_NO_COMPLETION을 구분하도록 개선되었다. 실제 실패 원본에서 PDFKit 내부 정체가 재현·해결된 것은 아니다. 시간 연장이나 예외 삼키기로 종결하지 않는다.
2. SVG_FILTER_EFFECT_UNSUPPORTED: 기본 professional 실패 경로 유지. 사용자 선택 hybrid-filter에서는 해당 페이지만 래스터 대체한다. 이 우회는 원문 SVG 필터의 무손실 벡터 지원 확대가 아니다.
3. PC 글꼴: local-fonts.js는 문서 전체 페이지 SVG의 서체를 먼저 조사하고 후보를 빈도순으로 읽는다(전체 읽기 예산 22초, 후보 읽기/파싱 각 최대 4초). 일부 폰트가 예산 초과·권한·컬렉션 문제로 빠질 가능성은 설계상 존재한다. 이 예산 자체가 사용자 실패의 원인이라고 단정하지 않는다. 서체 후보 준비, 실제 PDF 선택, PDF 내 FontFile embed, Hancom 기준 조판을 서로 다른 결과로 기록한다.
4. 백그라운드: cooperative-yield.mjs는 scheduler.yield/MessageChannel 우선으로 타이머 클램핑 영향을 줄인다. frozen/discarded에서 JS 지속 수행이나 자동 복원은 보장하지 않는다.
5. 텔레메트리: 오류/시작 로그는 현재 문서별 안정된 트랜잭션 키가 없어 단순 이벤트 건수로 성공률을 산출할 수 없다. 사용자 정보·내용 해시를 새로 서버에 수집하는 변경은 사전 별도 승인 없이는 금지.

## 4. 기존 검증 증거 — 재사용, 새 PASS로 과장 금지
- 최종 DEV26 릴리스 보고: docs/DEV26_FINAL_PRODUCTION_RELEASE_20261112.md.
- GitHub Actions 43236574175: Node 451건 중 PASS 448 / FAIL 0 / SKIP 3. 배포 단계의 GitHub secret 부재로 워크플로 전체 conclusion은 failure였으며 테스트 실패와 구별.
- Cloudflare 공식 빌드 a71eba22-f212-45f9-b5db-03f26a6d6e90 success.
- 운영 공개 Chromium QA: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43239081807 PASS (공개 1쪽 HWP/HWPX).
- Windows Chrome/Edge 최소화 관련 CI: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43230870968 PASS. Windows Server 2025 호스티드 러너 실험이지 사용자의 Win10/11 장시간 최소화, 실제 discard와 글꼴 동일성 보증이 아님.
- P0 현장에서는 Node 22.16.0과 의존성 미설치 상태를 확인. 요구 Node24 기준 전체 npm 빌드와 Windows 실사용 E2E는 **본 단계에서 재실행하지 않음**.
- 과거 운영 익명 이벤트: convert_start 36, success 18, failure 17 중 SVG 필터 10, 스트림 7 (시점별 조회 범위가 한정된 이벤트 건수). 성공률 산출 금지.

## 5. 다음 단계별 재현 입력·수락조건
- TASK-01: 사용자 허용된 비식별화 실패 HWP/HWPX, 기준 Hancom PDF, 페이지 수, Windows 버전, Chrome/Edge 버전, 필요한 서체 목록(문서에 필요한 이름만). 원문/파일명/원문 해시를 D1/CI 업로드 금지.
- TASK-02: 실제 데스크톱 탭 전환 / 다른 창 활성 / 네이티브 최소화 3회 / 10분 장시간 숨김 / 브라우저 폐기 각각 분리. UI 상태와 PDF 무결성·취소·복귀를 확인. frozen/discarded의 지속 실행을 기대하지 않음.
- TASK-03: TTF/OTF/TTC 서체별 found/readable/matched/selected/embedded/used/substituted/missing 표, 글꼴 권한, 줄바꿈·자간·표 셀·페이지 수와 Hancom 기준 PDF 대조.
- TASK-04: 같은 실패 페이지의 SVG 필터 유형과 professional/hybrid/compat 결과, 텍스트 검색 가능 여부, 시각 비교.
- TASK-05: pdf.end 전후 data/end/error/abort 바이트 카운터·최종 상태로 최소 재현. 근본 코드 수정 후 동일 원본 3회 이상 반복 성공 + xref/trailer/PDF 페이지 수/폰트 구조 점검.
- TASK-06: 기존 정상 기능 불변, targeted regression 후 필요한 릴리스 게이트만 재실행. 사용자 승인 전 운영 배포 금지.

## 6. P0 종료 상태
- DONE: 인수 패키지 내용물/무결성 확인, GitHub/Cloudflare 최신 운영 기준 재정립, 실행 경로 및 알려진 오류 경계 감사, 신규 격리 개발 브랜치 준비.
- BLOCKED/NOT VERIFIED: Windows 실제 사용자 오류 원본 재현, 한컴 PDF 시각 동일성, 장시간 최소화·discard 실기, 상용 글꼴 실제 설치/임베딩, PDFKit 내부 타임아웃 근본 원인.
- PROD 변경: **없음**. D1 읽기/쓰기/스키마 변경: **없음**. 별도 sunrise-pdf-editor 변경: **없음**.
