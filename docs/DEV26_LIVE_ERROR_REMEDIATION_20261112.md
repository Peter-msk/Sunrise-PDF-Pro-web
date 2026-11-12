# Sunrise PDF PRO(web) — 2026-11-12 실기 오류 웹 진단·개발 수정 보고

> **개발 소스 보완/부분 QA 완료. 운영 배포·main 병합·운영 D1 쓰기 없음.**
>
> 시점: 2026-11-12 18:50 KST / 대상 브랜치: `dev/dev26-final-integrated-source-20261112`

## 1. 실제 Cloudflare 운영 D1 기록(읽기 전용)

D1 `sunrise-pdf-pro-admin`의 공개 변환 진단 이벤트를 집계하였다.
2026-11-12 00:00~18:38 KST에 저장된 HWP 이벤트는 아래와 같다.

| 이벤트 | 건수 |
| --- | ---: |
| `convert_start` | 36 |
| `convert_success` | 18 |
| `convert_failure` | 17 |
| `SVG_FILTER_EFFECT_UNSUPPORTED` (`image_filter`) | 10 |
| `PDF_STREAM_TIMEOUT` (`pdf_stream`) | 7 |

기록은 이벤트 건수이며, 성공·실패·시작을 파일별 정확히 대응시키는 트랜잭션 수가 아니다.
종료 이벤트가 없는 시작 건은 성공으로 계산하지 않는다.
마지막 진단 이벤트는 16:53:57 KST. 오전 09·10·11시대뿐 아니라 16시대에도
SVG 필터 오류 3건, PDF 스트림 오류 2건이 기록됐다.
이전에 14:13에 수행한 운영 배포가 해당 오류를 모두 제거했다는 주장은 성립하지 않는다.

오늘 후반 17:19 QA 통과한 개발 변경과 이때 운영 중이던 14:13 배포본은 다르다.
운영 DB 접근은 오직 `SELECT`/스키마 읽기였으며 기록을 수정하지 않았다.
현재 직접 연결된 브라우저 탭 컨텍스트가 없어 사용자의 페이지 DOM/콘솔을
원격 열람하지는 못했다. 공개 웹 검색 도구도 해당 URL을 열지 못했다.

## 2. 소스 수정과 불변 조건

### 2.1. 실제 SVG 필터 오류 10건에 대한 복구 품질 개선

기존 `conversion-recovery.mjs`는 SVG 필터 오류에도 즉시 전체 페이지
`compat-raster`로 재시도하도록 했다. 이는 이미 구현돼 있는
`hybrid-filter`의 부분 페이지 이미지화 기능을 이용하지 못했고
원래 벡터 텍스트가 더 많이 소실될 수 있었다.

- `professional` + `SVG_FILTER_EFFECT_UNSUPPORTED` -> 사용자 명시 클릭 시 **선택된 파일만 `hybrid-filter`로 복구**.
- `professional` + `PDF_STREAM_TIMEOUT` -> 사용자 명시 클릭 시 **선택된 파일만 독립 `pdf-lib` `compat-raster` 작성 엔진으로 복구**.
- `hybrid-filter` 자체가 실패한 뒤 재복구 -> **동일 혼합 방식을 무한 재시도하지 않고 `compat-raster`**.
- 원래 고품질 벡터 출력 기본값과 성공된 다른 파일은 유지. 오류를 자동으로 이미지 PDF로 묵시 강등하지 않음.
- UI 버튼과 결과 경고는 혼합/전체 이미지 전환의 차이 및 텍스트 검색 제한을 명시.

### 2.2. PC 글꼴 접근 결과 재조회

`main.js`가 이미 허가받은 FontData 배열을 캐시하는 경로에서
`verifiedPcFontData?.length` 검사 대신 `!==null`을 사용한다.
PC 글꼴 0개가 확인된 경우도 결과를 다시 조회하지 않는다.
실제 Windows Chrome/Edge의 글꼴 동일성·접근 권한과 PDF 인쇄 결과는
추가 실기 검증이 필요하며 이 변경이 원본 서체 보존을 보증하지 않는다.

### 2.3. 백그라운드 호환 PDF 복구

`raster-compat-pdf.mjs`에 남아 있던 0ms `setTimeout` 양보
2곳을 기존 공통 `cooperativeYield({signal})`로 교체했다.
Chrome/Edge에서 백그라운드 timer clamping 영향을 완화하고 취소를
공통 경로로 처리한다. 브라우저가 탭 자체를 freeze/discard하면 JS 실행을
보장할 수 없는 점은 변경되지 않는다.

## 3. 검증 증거

- 기존 QA: <https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43181829604> (2026-11-12 17:19 KST, PASS).
- 이번 보완의 최종 집중 QA:
  <https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43194905234> (PASS, **NO DEPLOY**).
- Node 테스트: **45/45 PASS**, FAIL 0, SKIP 0.
- `check:source`, Vite 빌드, WASM/Worker 정적 자산 검증: **PASS**.
- Chromium 복구 브라우저 E2E: **PASS**. `filter.hwp`는 전문→혼합, `stream.hwpx`는 전문→호환, 성공했던 `completed.xlsx`는 변경 없음, 기본 `professional` 출력 설정 유지.
- 첫 QA <https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43194724890>의 실패는 **테스트 스텁이 최초 실패 호출을 기록하기 전에 예외를 던져 생긴 테스트 자체의 가정 오류**. 테스트 스텁을 교정한 후 동일 검증이 성공했다.
- 이 45건 및 브라우저 E2E는 회귀 범위의 모의·공개 테스트이며, 사용자의 실제 문제 HWP 원본에 대한 종단 재현이 아니다.

## 4. 남은 구체적 수락 조건

- 실제 문제가 발생한 HWP 원본의 SVG 필터를 눈으로 확인하여
  혼합 출력 PDF에서 필터 효과가 보존됐는지 페이지별 비교.
- `PDF_STREAM_TIMEOUT` 실제 문제 문서를 다시 실행하여 전체 이미지 PDF
  저장/열기/쪽수/페이지 보존을 실측. 원천 PDFKit의 긴 스트림 작성
  문제는 완전 해결로 선언하지 않는다.
- PC 글꼴 실제 Windows 설치·TTC 변종/권한 팝업·숨김/최소화·절전 복귀 시험.
- 과거 보고된 관리자 문서 오픈 오류 4건은 이번 D1 집계에서
  원문/실패 HTTP 응답/콘솔 로그가 확인되지 않아 해결 선언 불가.
- PPT/PPTX는 아직 브라우저 변환 지원 형식이 아니다.

## 5. 안전·릴리스 경계

`main`, 운영 Cloudflare Worker, D1 데이터, 별도 Sunrise PDF Editor는
이번 수정으로 변경하지 않았다. 한 번 실행한 QA 증거는 GitHub에 유지하고
임시 자동 QA 트리거는 삭제하여 반복 실행되지 않도록 정리한다.

**판정:** 실제 웹 오류를 확인해 변경 소스에 복구 품질 및 백그라운드
취소 대응을 보완했고 변경 영향 QA는 통과했다. 다만 사용자 실문서에서
동일 오류가 재현되지 않는지 확인하기 전에는 '운영 장애 전부 종결'
또는 '실기검증 최종 PASS'라 주장하지 않는다.
