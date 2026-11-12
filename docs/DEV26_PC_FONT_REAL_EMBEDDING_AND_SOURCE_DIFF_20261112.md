# Sunrise PDF PRO(web) DEV26 — PC 설치 글꼴 실제 임베딩·원문 지정 서체 차이 검증 보고

**날짜:** 2026-11-12 KST  
**개발 기준:** `dev/dev26-final-integrated-source-20261112`  
**배포:** 금지·미실시, `main` 병합 없음, D1 스키마/기록 수정 없음.

## 1. 소스 감사 결론

기존 DEV26은 사용자가 설치한 `FontData`에서 한국어·영어 서체명에 대응하는 후보를 찾고,
SVG→PDFKit의 `fontCallback`에서 선택한 PC 글꼴 개수를 결과 메시지에 표시했다.
그러나 **이 선택 횟수는 실제 PDF `FontDescriptor`에 해당 글꼴 프로그램이 포함됐다는 증거가 아니다.**
또한 일반 TTF/OTF까지 `fontkit.create(bytes, postscriptName)`을 호출해,
TTC 컬렉션 전용 selector를 단일 SFNT 글꼴에 전달하므로 해당 실제 글꼴 파싱이 실패할 수 있었다.
고정 공개 OFL `NanumGothic-Regular.ttf` 및 로컬 `FontData` 모의 객체로
이 실경로의 `unreadable=1` 실패를 재현한 뒤 수정했다.

## 2. 실제 수정

| 파일 | 변경 |
| --- | --- |
| `browser-local/src/pdf-fonts.js` | TTF/OTF는 `parser.create(bytes)`로 로드하고 실제 PostScript 이름이 OS 메타데이터와 다르면 `PC_FONT_SINGLE_FACE_MISMATCH`로 거부. TTC는 계속 정확한 `postscriptName`을 지정하며 첫 face 추측 금지. 로드된 PS identity를 선택 기록으로 유지 |
| 동일 파일 / `installMeasureFonts` | **TTC 전체 바이트를 단일 CSS `FontFace`로 등록하지 않음**. 이 API에는 TTC face 선택 인자가 없어 PDFKit과 다른 face로 조판 측정할 위험이 있다. OS 설치 글꼴 해석을 유지하고 `ttcMeasurementUnverified` 경고를 제공 |
| `browser-local/src/pdf-font-audit.mjs` | 새 로컬 전용 PDF 분석 모듈. `pdf-lib`으로 생성된 PDF의 페이지별 `Font` 리소스, `BaseFont`, `Subtype`, `FontDescriptor`, 실제 `FontFile/FontFile2/FontFile3` 포함 여부를 조회. 48MiB 기본 상한, 취소 지원, 외부 네트워크 없음 |
| `browser-local/src/svg-professional.js` | PDFKit 콜백에서 선택된 PC 서체의 family/PostScript/style을 독립 `fontSelections.local`로 보존. **선택 ≠ 임베딩** 계약 유지 |
| `browser-local/src/converter.js` | HWP 원문 지정 서체 목록, PC 등록 face, 미등록 서체를 로컬 `sourceFontInventory`에 보존. TTC 조판 오차 가능성과 실제 PDF 글꼴 검사 필요성을 결과 경고에 명시 |
| `browser-local/src/main.js` | 생성 완료된 HWP/HWPX의 전문/혼합 PDF에서 **‘PDF 글꼴 확인’** 버튼 제공. 클릭하면 로컬 PDF 리소스를 분석해 **원문 요청 → PC 후보 → PDFKit 선택 → 실제 PDF 글꼴 프로그램 포함**을 구분 표시. 파일 제거 시 검사 중단; 자동 서버 전송 없음 |
| `browser-local/tests/r66-pdf-font-embedding-audit.mjs` | 실제 한글 TTF를 PDFKit에 임베딩하고 PDF 내부 글꼴 프로그램을 확인, Helvetica처럼 리소스는 있지만 미임베딩인 경우 구분, 이름 유사 오판 차단, PC TTF 파서 회귀, TTC 측정 보장 차이, 원문 한/영 별칭, 비식별 계약 등 11건 |
| `browser-local/tests/r66-pc-font-audit-browser.mjs` | Chromium에서 실제 공개 HWP 변환 후 새 글꼴 확인 버튼을 눌러 PDF 내부 글꼴 분석 및 외부 네트워크 요청 금지를 검증 |
| `browser-local/tests/r66-local-font-fidelity.mjs` | 기존 테스트의 실제 OS와 불일치하는 가짜 PostScript fixture를 교정. 제품의 엄격한 PS 검증은 완화하지 않음 |
| `browser-local/package.json` | 새 임베딩 검증 테스트를 정규 `npm test`에 포함 |

## 3. GitHub QA 근거

- **최종 PASS:** https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43227183406
- Node 24 대상 관련 테스트 **52 PASS/0 FAIL/0 SKIP**, 추가 실제 2-face TTC PDFKit 임베딩 테스트 **1 PASS**.
- 합계 관련 테스트 **53 PASS**.
- `check:source`, Vite/WASM 빌드, Worker 라우팅/정적 자산 검사 PASS.
- Chromium 로컬 Worker에서 고정 공개 HWP/HWPX 기본 전문 벡터 PDF 개별 출력 및 ZIP 다운로드 PASS.
- 같은 Chromium에서 생성된 HWP PDF를 대상으로 **‘PDF 글꼴 확인’** 동작 PASS; 외부 요청 및 페이지 JS 오류 없음.
- 초기 실패 CI는 (1) 실제 단일 TTF의 TTC selector 오용을 찾은 사례와 (2) 모의 fixture의 상호 불일치한 PS metadata 발견 사례였으며, 수정·교정 후 최종 PASS. 기록을 숨기지 않음.
- **실제 Windows 사용자 PC에 설치된 상용 글꼴이나 한컴 정식 PDF 원본 대조는 수행하지 못했다.** 공개 OFL 글꼴과 고정 HWP/HWPX 테스트만 검증.

## 4. 정확한 결과의 의미와 제한

1. `FontData` 접근 허용 및 family 매칭은 **검색 성공**만 나타낸다.
2. PDFKit의 `fontCallback`가 face를 반환했으면 **렌더러에서 선택**된 상태이다.
3. PDF 페이지의 Font resource 및 `FontDescriptor.FontFile2/3` 확인 시 **글꼴 프로그램 포함**을 확정할 수 있다.
4. 이 결과만으로 **페이지 모든 텍스트의 실제 글리프 사용, 줄바꿈, 자간/행간, 한컴 PDF와 동일한 조판**을 증명할 수는 없다. 특히 TTC는 CSS 측정 face의 동일성을 보장하지 못한다.
5. PostScript 이름 비교는 부분접미사 일치를 허용하지 않고 정확한 정규화 일치만 인정하므로, 결과가 '미확인'이면 PDF 내부 이름과 본문 스타일을 직접 대조해야 한다.
6. 변환된 문서/폰트 바이트·원문 문자열·파일명은 GitHub 또는 Cloudflare D1에 올리지 않았다.

## 5. 실사용 수락시험

- Windows 10/11 Chrome/Edge에서 정확한 사이트 권한으로 글꼴 API 확인.
- HWP 문서의 요청 글꼴 목록(한/영 이름, 볼드, 기울임)을 수집하여 변환 결과의 `PDF 글꼴 확인` 클릭.
- TTF/OTF 10종 이상, TTC 2종 이상에서 각 PS face, PDF FontDescriptor, PDF 텍스트, 원문 지정 이름 비교.
- 한컴에서 내보낸 기준 PDF와 **페이지 수, 동일 글꼴 명칭, 줄바꿈/글자 위치, 표 셀 크기, 벡터·그림 위치**를 각각 대조.
- 실패 원본 없이 모든 Windows 설치 글꼴의 완전 적용 또는 한컴과 100% 동일성을 선언하지 않음.

**최종 상태:** 개발 코드 수정 및 타깃 QA PASS. Windows 사용자 글꼴/한컴 기준 동일성 ACCEPTED 아님. **운영 배포 미실시**.
