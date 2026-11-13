# Sunrise PDF PRO(Web) DEV27 — 25개 파일 야간 작업의 오류 조사와 실패 파일 일괄 복구 개선

- 기준일: 2026-11-13 KST.
- 소스 브랜치: `dev/dev27-p0-baseline-audit-20261113`.
- 사용자 보고: 2026-11-12 밤에 25개 파일 변환 수행. D1의 익명 이벤트는 파일 원본이나 이름이 없으므로 사용자 세션과 25개 입력 파일 전부를 1:1로 증명하지 못함.
- 조치 범위: Cloudflare D1 읽기 전용 SQL, 재현 가능한 UI/큐/복구 계획 수정, 변경 영향 Node24 QA. 운영 배포·D1 스키마/데이터 쓰기·관리자 Secrets 수정 없음.

## 1. 실제 야간 운영 기록 — 판정 가능한 사실

2026-11-13 00:00:22~00:04:49 KST에 단일 익명 세션으로 묶이는 HWP/HWPX 변환 이벤트:
| 유형 | 시작 | 성공 이벤트 | 실패 이벤트 |
|---|---:|---:|---:|
| HWP | 11 | 6 | 4 |
| HWPX | 11 | 7 | 4 |
| 합계 | 22 | 13 | 8 |

- 실패 **8/8 이벤트가 `SVG_FILTER_EFFECT_UNSUPPORTED`**. 진단 단계 `image_filter`, Trace v2의 `module_id=svg_professional`, `callsite_id=render_svg`, `phase=render`, 브라우저 분류 `chrome`로 관측.
- 이 세션에는 `PDF_STREAM_TIMEOUT` 실패 이벤트가 없음. 이전 날짜의 PDF 스트림 오류와 혼동하지 않음.
- 시작 22건 대비 성공/실패 종료 21건: 한 건은 종료 이벤트가 보이지 않음. 브라우저 폐기·중단·텔레메트리 미전송 중 어느 원인인지 미확정.
- 별도 익명 세션의 23:37경 성공 이벤트(HWP 1/HWPX 1)가 있지만 25개 파일 배치에 속하는지 근거 부족. 25개 중 성공/실패의 최종 비율로 계산하지 말 것.
- HWP/HWPX 사용자 파일 원문, 파일명, 실제 필터 원형, 비교할 한컴 PDF는 D1에 없음. 따라서 범용 SVG 필터의 무손실 벡터 근본 지원을 완료했다고 해석하지 않음.

## 2. 코드 원인 경계

- `svg-safe-grayscale.mjs`: 안전하게 증명할 수 있는 identity/일부 회색조 SVG 필터만 벡터 색상으로 정규화. 나머지 복잡 필터는 정확성 보장을 위해 fail closed.
- `svg-filter-hybrid.mjs` + `svg-professional.js`: 사용자가 선택한 `hybrid-filter`일 경우 미지원 필터가 있는 페이지에 한정해 이미지 출력, 다른 페이지는 벡터 유지.
- `conversion-recovery.mjs`/UI: 이전에는 오류 난 **파일마다** 별도 복구 클릭이 필요했음. 다수 파일에 같은 오류가 발생하면 8번 등 반복 수동 조작이 필요.
- 상위 계약: 기본 `professional`의 자동 이미지 품질 강등 금지. 서버로 문서 바이트/글꼴 전송 금지.

## 3. 구현한 개선 (운영 미배포)

1. `browser-local/src/conversion-recovery.mjs`: `planBulkRecovery(items)` 신규 함수. 이전 복구 대상과 동일한 `canRecoverFile` 판정 재사용, 실패한 HWP/HWPX만 큐 구성. 각 파일은 원인별로 `SVG_FILTER_EFFECT_UNSUPPORTED: professional→hybrid-filter`, `PDF_STREAM_TIMEOUT: professional→compat-raster`, 이미 혼합 실패→`compat-raster` 판정. 정상·대기·취소·미지원 실패는 제외.
2. `browser-local/src/main.js`: 실패한 파일이 존재할 때만 `실패 파일 N개만 복구` 버튼 노출. 사용자가 클릭해야만 작동하며, 파일별 엔진을 별도로 적용. 기본 PDF 엔진 선택값은 변경하지 않음. 기존 성공 PDF와 ZIP 후보는 보존, 복구 완료 결과만 추가.
3. `browser-local/index.html`: 명시적 일괄 복구 버튼과 해당 페이지/전체 페이지 이미지 출력 시 텍스트 검색·선택 불가 경고를 tooltip과 상태문에 표시.
4. `browser-local/tests/r67-bulk-recovery.mjs`: 25개 대기열(13 성공, 8 SVG 실패, 4 일반 대기) 합성 시나리오 포함 총 6건 추가. 혼합 원인/엔진 구분, 미지원 실패 제외, 정상 변환 기본 경로 보존, UI 명시적 클릭 계약 확인.
5. 기존 `r66-real-failure-retry.mjs`의 구현 변수명에 결합된 정적 단언을 `itemEngine`에 맞게 변경. 제품의 기존 개별 복구 동작은 유지.
6. `browser-local/package.json`: 신규 타깃 시험 정규 `npm test` 목록 등록.

## 4. 실제 검증

- 첫 집중 QA: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43321615103 — 17개 중 기존 정적 단언 1건 실패. 새 테스트 6건 PASS, 제품 JS 구문 PASS. 기존 시험의 `item.lastEngine=engine` 텍스트 기대와 파일별 `itemEngine`의 차이로 발생.
- 수정 후 최종 QA: https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43321787619 — Node 24 JS syntax PASS, 기존 복구 + 신규 일괄 복구 총 **17/17 PASS**, FAIL 0.
- CI는 설치형 의존성 빌드·실제 HWP/HWPX 브라우저 변환을 수행하지 않은 **변경 영향 단위/소스 계약 집중검증**. 실제 25개 사용자 파일을 이번 개발 브랜치에서 재실행하거나 각 파일의 PDF 품질을 수락한 것은 아님.
- 자동 트리거는 `.github/workflows/dev27-bulk-recovery-qa.yml` 경로 자체 변경에만 실행되도록 제한하였고 배포 단계는 없음.

## 5. 미검증 및 후속 수락

- 동일 문제가 재발하는 실제 HWP/HWPX 파일 중 개인정보 제거 가능한 1~2건, 한컴 기준 PDF가 있으면 SVG 필터 종류를 특정하고 전문 벡터에서 안전하게 지원할 수 있는 항목만 선별 수정.
- 이번 수정은 **8건의 공통 오류에 대한 사용자 명시적 일괄 우회/복구 개선**으로, 일반 SVG 필터의 무손실 벡터 렌더링을 해결한 것이 아님.
- 실제 Chrome/Edge 배치에서 `professional` 실패→명시적 일괄 혼합 복구→PDF 페이지/검색/문서 내용/글꼴 검증, 순차 취소, 기존 성공 파일 보존을 확인해야 릴리스 READY.
- 사용자 승인 전 `main` 병합, Cloudflare 운영 배포, D1 데이터/스키마 변경 금지.

**현재 판정:** DEV27 TARGETED QA PASS / USER SOURCE DOCUMENT E2E NOT VERIFIED / NO PROD DEPLOY.
