# Sunrise PDF PRO (Web) — DEV26 Final Integrated Source

> **개발 후보 / NO DEPLOY.** 본 브랜치의 코드는 검증된 DEV26 누적 패치가 **실제 소스 파일에 적용된 상태**입니다. `main` 병합, Cloudflare 운영 배포 및 D1 변경은 이번 통합 범위에 없습니다.

## 기준 및 증거

| 항목 | 값 |
| --- | --- |
| 저장소 | `Peter-msk/Sunrise-PDF-Pro-web` |
| 원본 베이스 | R65 `2a11edbdb3d1413b3ef4a6eccb150dd442c2f7cf` |
| 검토된 QA 부모 | `8961f8fbf697fcdf5c1c9ce70734f48af11d2354` |
| 최초 실소스 통합 커밋 | `615e8a17016ed474cc0639d6f83f82a840ef7c84` |
| QA 근거 | [Chromium + font/hybrid 검사 PASS](https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43181829604) |
| 소스 통합 근거 | [누적 패치 + 전체 빌드 PASS](https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43189647119) |
| 기존 운영 URL | https://sunrise-pdf-pro-web.ko-pg.workers.dev/local/ |

### 엔진과 현재 기능

- 브라우저 내부 `@rhwp/core@0.8.7` WASM의 HWP/HWPX 페이지 SVG를 PDFKit으로 출력.
- 기본 `professional` 모드는 글자/도형 보존을 우선하고, 지원되지 않는 SVG/글꼴 오류를 **명시적으로 실패**시킴. 임의 이미지 출력 전환 금지.
- 사용자 선택 `hybrid-filter`: 지원되지 않는 SVG 필터가 있는 페이지에 한하여 이미지 출력. 이미지로 바뀐 페이지는 검색 가능 텍스트가 소실될 수 있음.
- 사용자 선택 `compat-raster`: 전체 페이지 이미지 PDF. 사용자 동의 후 실패한 HWP/HWPX 파일 하나만 복구 재시도 가능.
- 추가 입력 `xls`, `xlsx`, `jpg`, `jpeg`, `png`. **PPT/PPTX 미지원**.
- PC 설치 글꼴 접근은 브라우저 기능/사용자 권한에 의존. TTC는 PostScript 글꼴 이름을 식별하여 사용. 글꼴 검색 성공 자체가 PDF의 완전한 원문 동일성을 증명하지는 않음.
- 대량 문서 일괄 변환, 개별 PDF, ZIP, 취소, 진행 표시 및 진단 이벤트 지원. 원본 문서가 서버로 업로드되는 일반 변환 경로는 없음.

## 개발 브랜치에서 검증·빌드

Node.js 24 기준으로 검증됨. 저장소 루트에서:

```sh
npm run build
# 빌드와 테스트 후 결과물 및 Worker 정적 자산 검증
npm --prefix browser-local run verify:dist
node scripts/verify-browser-build.mjs
node scripts/test-worker-assets.mjs
```

**주의:** 이 브랜치에서는 `.release/build-dev26-cloudflare.sh`를 다시 실행하지 마세요. 이 스크립트는 R65 원본에 패치를 최초로 적용하기 위한 도구이며, 이미 패치가 반영된 소스에서 재실행하면 중복 적용 오류가 발생합니다.

`npx wrangler deploy`, `npm run deploy`, 배포 워크플로의 `workflow_dispatch`는 승인 전 실행하지 않습니다. 기본 워크플로의 실제 운영 배포 스텝은 이 개발 브랜치에서 사용하지 않습니다.

## 검증과 품질 승인을 구분

기존 QA에서 PASS인 것:
- 누적 패치 해시·적용 순서, Node 단위 테스트, PDF/WASM 정적 자산 빌드
- 공개 HWP/HWPX 샘플의 Chromium 기본 벡터·하이브리드 PDF 변환
- TTC 개별 서체 선택 및 PDFKit 임베딩, 브라우저 hidden/frozen-resume 실험
- 운영 health/WASM/번들 스모크(운영에 이미 배포된 이전 버전 대상)

**추가 확인이 필요한 것:**
- 실제 Windows Chrome/Edge의 글꼴 접근·원문 동일성, 장시간 최소화·절전·탭 폐기
- 고객의 다쪽 HWP/HWPX 표·도면·글꼴과 한컴 PDF 기준본의 페이지별 비교
- `SVG_FILTER_EFFECT_UNSUPPORTED`, `PDF_STREAM_TIMEOUT` 실제 실패 원본의 품질/장기 반복 검증
- 관리자 문서 오픈 오류 4건 재현과 관리자 인증·CSRF·권한·7개 화면 E2E
- 정식 한컴 엔진 연동 요구와 현재 browser-only 아키텍처의 제품 계약 간 차이

최종 출시에 대한 PASS는 위 증거가 추가되고 사용자의 명시적 승인이 있을 때만 선언합니다.

## 운영 보호

기존 Worker `sunrise-pdf-pro-web` 및 별도 `sunrise-pdf-editor`는 이번 개발 브랜치에서 변경되지 않았습니다. 운영 장애 시의 롤백 대상은 해당 PDF PRO Worker로 제한합니다. 운영 D1, 관리자 인증 비밀값 및 실사용 문서 정보는 형상관리 파일에 포함하지 않습니다.
