# Sunrise PDF PRO (web) DEV26 — SVG filter 유형별 소스 감사·벡터 안전 확장

**작성:** 2026-11-12 KST (DEV26 미배포 소스)  
**소스 기준:** `dev/dev26-final-integrated-source-20261112`  
**불변 조건:** 기본 `professional` 자동 이미지 강등 금지, 미지원 효과는 오류 반환/사용자 선택 `hybrid-filter`; 외부 SVG 자원 차단, 문서 업로드 금지. 운영 배포 금지.

## 1. 근거와 범위

- 인수 ZIP의 8개 패치가 반영된 DEV26 최신 QA 소스를 기초로 GitHub의 이후 개발/실기 오류 복구 수정까지 유지한다.
- 사용자 실패 원본 HWP/HWPX, 해당 SVG, 한컴 기준 PDF는 이 작업에 제공되지 않았다. **실제 실패 원본의 재발 방지나 원문과의 시각적 동일성을 증명한 검증은 아니다.**
- 라이브 운영 텔레메트리 과거 표본: `SVG_FILTER_EFFECT_UNSUPPORTED` 10건, `PDF_STREAM_TIMEOUT` 7건. 이는 오류 유형의 존재 근거일 뿐 구체적인 `feGaussianBlur` 등 사용자 원본의 필터 유형까지 판정하지 못한다.
- 표준: W3C Filter Effects 1 <https://www.w3.org/TR/filter-effects/>, MDN `grayscale()` <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/filter-function/grayscale>, `saturate()` <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/filter-function/saturate>.
- 기존 PDF 렌더러 `svg-to-pdfkit@0.1.8` 일반 필터 미지원: <https://github.com/alafr/SVG-to-PDFKit>.

## 2. 필터 유형별 결과

| 유형 | DEV26 변경 후 | 품질·보안 조건 |
|---|---|---|
| CSS `grayscale(1)`, `grayscale(100%)` | 기존 회색조 정규화 재사용 | 벡터 색상/글꼴·그림은 기존 검증 경계로만 처리 |
| CSS `grayscale()` | **신규 지원** | 인자 생략 기본 100% 회색조 |
| CSS `saturate(0)`, `saturate(0%)` | **신규 지원** | sRGB 완전 탈채도 = 기존 회색조 행렬, 단색·그라디언트는 벡터 유지 |
| SVG `feColorMatrix` 타입 `saturate` 값 0 또는 기존 검증된 회색조 `matrix` | 기존 회색조 정규화 유지 | 상속색·스타일·필터 범위·복합 효과는 fail closed |
| CSS `grayscale(0)`, `saturate(1)`, `brightness(1)`, `contrast(1)`, `opacity(1)`, `invert(0)`, `sepia(0)`, `hue-rotate(0)` 및 최대 8개 정적 항등 함수 체인 | **신규 제한적 벡터 보존** | 오직 효과 없는 엄격한 값, 불투명한 비혼합 단일 벡터 leaf; 그룹·외곽선·클리핑·혼합 제외 |
| SVG 단일 `feColorMatrix` 항등 행렬, `saturate(1)`, `hueRotate(0)` | **신규 제한적 벡터 보존** | 단일 SourceGraphic 입력, 명시적 filter 영역·변형 없음, 엄격한 leaf 대상 |
| SVG 단일 `feComponentTransfer`, RGBA 4개 `type=identity` | **신규 제한적 벡터 보존** | 모든 채널의 명시적 항등 전달만 허용 |
| 복수의 URL/href가 있는 '미사용' 필터 | **보안 보완** | 참조가 하나라도 남으면 임의 삭제하지 않고 명시 오류 |
| `feGaussianBlur`, `feDropShadow`, `feOffset`, `feBlend`, `feComposite`, 부분 채도·색상변경, 임의 CSS·SVG 합성 | **여전히 미지원** | 기본 모드: fail closed; 사용자가 명시 선택한 혼합 모드: 해당 쪽만 이미지, 나머지는 벡터 |
| 필터 영역 `x/y/width/height` 커스터마이징 | **원칙적으로 거부** | 필터 적용 범위의 잘림 효과가 삭제로 사라지면 원본과 달라질 수 있기 때문 |
| 래스터 `<image>` 위의 항등 SVG 필터 | **원칙적으로 거부** | 색상 공간 왕복·픽셀 반올림 차이를 무손실이라고 단정하지 않음 |

**주의:** 이 구현은 SVG 필터를 PDFKit 자체가 직접 그리도록 지원한 것이 아니다. 완전히 무채색으로 정규화할 수 있는 경우 색상을 변환하거나, 참으로 항등인 필터를 **제한된 벡터 요소에 한해서** 제거한다. 모든 필터에 이를 적용하지 않는다.

## 3. 코드 및 검증

- `browser-local/src/svg-safe-grayscale.mjs`: CSS 완전 회색조 추가, 색상 행렬/함수별 identity 판정, 오염 가능한 그룹·영역/알파·외곽선/복합 효과 배제, URL·href 참조 정밀 검사.
- `browser-local/tests/r66-svg-filter-vector-safe.mjs`: 유형·실패·보안·취소·실제 PDFKit PDF 유효성을 포함한 **23개** 신규 결정적 회귀 케이스.
- `browser-local/package.json`: 정규 `npm test` 실행에 신규 회귀 파일 등록.
- GitHub Actions 원샷 QA:
  <https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43209997465>.
  1차 결과 **52/52 PASS, FAIL 0, SKIP 0**. 최종 정밀감사에서 근사 항등/16진수 SVG 수치 방지 회귀 1개를 추가해 별도 검증한다; Vite/WASM, 소스 검사 및 Worker 정적 파일 검사 PASS.
- 신규 검증 중 PDFKit으로 작성한 PDF가 PDF 파서에 열리고, 벡터 콘텐츠에서 불필요한 이미지 XObject가 발생하지 않는지 점검.
- 기존 명시적 `hybrid-filter`와 `compat-raster`를 자동 수행하지 않으며, 그 UI/엔진·텔레메트리 설정과 Worker/관리자 소스는 건드리지 않았다.

## 4. 후속 실기 수락 기준

1. 실제 실패 HWP/HWPX에서 문제가 발생한 SVG 필터의 **원래 primitive·속성·페이지**를 민감정보 없이 로컬에서 확인.
2. 기본 벡터에서 신설된 안전 유형인 경우 변환 후 글꼴·도형 유지 및 한컴 기준 PDF와 페이지·표·그림 위치 비교.
3. 블러·그림자·혼합 계열이면 기본의 명시 오류가 유지되고, 사용자가 선택한 `hybrid-filter`에서 **해당 페이지만** 이미지 대체되는지 검사.
4. 사용자 문제 문서가 확보되기 전에는 '운영 반복 10건 해결'이나 '실사용 품질 최종 수락'이라고 주장하지 않는다.
5. 운영 배포·`main` 병합·D1 쓰기·별도 `sunrise-pdf-editor` 수정은 없음.

**판정:** DEV26 SVG 필터의 정적·수학적으로 검증 가능한 벡터 보존 범위를 확대하고, 잘못된 필터 정의 제거를 차단한 변경 영향 QA 통과. 실문서 원본 일치도는 미검증.
