# DEV37 — 제공 안심글꼴 전수조사 보류와 8종 문장부호 글리프 보완

기준: 2026-11-16 KST · 기반: DEV36 `ee8827d727ec02814d2bce6cf181f5533d708839`

## 앞선 결론의 정정
- 사용자가 제공한 '365종'을 모두 글리프별 확인한 것이 아니었다.
- 2026-11-15 `Sunrise_PDF_ZIP_실파일검사_20261115.md`에는 ZIP 2개에 **548개 글꼴 파일**(TTF 351, OTF 191, WOFF 2, WOFF2 2, EOT 2)이 있었다고 기록돼 있다. 파일 수와 사용자 설명의 '서체 365종'은 동일한 개념이 아니다.
- DEV36의 '8종 미지원'은 **선택된 5개 번들 글꼴**의 합집합에서의 미지원이지, 전체 365종에 관련 글꼴이 없다는 뜻이 아니다.
- 인수 세션의 보관 ZIP은 목록에는 존재하나 원본 바이트 재반출이 차단됐다. 따라서 이번 DEV37 작업에서 **제공 ZIP 548개에 대한 신규 전체 문자표 검사는 실제 미수행**이다. 완료로 표시하지 않는다.

## 원래 보고된 8개 문자 실제 cmap 검사

**교정:** 원래 PDF 분석 기록의 하이픈은 ASCII `-` (U+002D)이며 `‑` (U+2011)가 아닙니다. DEV37 이전의 도구와 테스트가 두 문자를 혼동했으므로 원래 8종을 정정했습니다. U+2011은 별도 추가 검사 항목이며 본 8종에 포함해 성공으로 계산하지 않습니다.
공개 Noto GitHub 저장소의 정확한 바이너리 TTF를 조회하고 SFNT cmap format 4/12로 다음을 확인했다.

| 문자 | 코드포인트 | 보완 글꼴 |
|---|---|---|
| ‧ | U+2027 | NotoSans-Regular.ttf |
| - | U+002D | NotoSans-Regular.ttf |
| ｢ | U+FF62 | NotoSansYi-Regular.ttf |
| ｣ | U+FF63 | NotoSansYi-Regular.ttf |
| ․ | U+2024 | NotoSans-Regular.ttf |
| ･ | U+FF65 | NotoSansYi-Regular.ttf |
| ⁀ | U+2040 | NotoSans-Regular.ttf |
| ‿ | U+203F | NotoSans-Regular.ttf |

소스 commit `ffebf8c1ee449e544955a7e813c54f9b73848eac`, Noto repo `LICENSE`는 SIL OFL 1.1.
- `unhinted/ttf/NotoSans/NotoSans-Regular.ttf`: **393200 bytes**, Git blob `c6cc9855aa3a615219f7864840e9c27a957201ed`
- `unhinted/ttf/NotoSansYi/NotoSansYi-Regular.ttf`: **182784 bytes**, Git blob `f789f1b2c25ddeaae39fe86c2a2e7bbfda5a6ae1`

NotoSansYi의 CJK 문장부호 외관이 원본과 완전히 동일하다는 보장은 없다. **cmap 존재**는 PDF 실제 글리프 렌더·검색·복사·한컴 조판 동일성 증명이 아니다.

## 이번 DEV37 코드
1. `install-safe-fonts.mjs`: 검증된 두 글꼴을 기존 다섯 파일에 추가. 고정 commit + 크기 + Git blob 검증 실패 시 중단, 빌드 시에만 가져오기.
2. `bundled-fonts.js`: 7개 로컬 번들, 새 글꼴을 Noto Sans Symbols 2라고 허위 alias하지 않도록 분리.
3. `src/worker.js`: 추가 두 정적 폰트 경로만 명시 허용. 원본 문서 업로드 없음.
4. `verify-engine-contract.mjs`, `verify-local-build.mjs`: 정확히 동일한 승인 manifest 기반 7개 바이너리 필수 검증.
5. `dev36-safe-fonts.mjs`, `r66-engine-contract.mjs`: 새 글꼴 바이너리·8자 코드포인트·선택 로직을 포함하는 회귀 검사.
6. `README.md`: DEV37 후보 수와 검증 상태 구분.

## 완료/미완료
- **확인**: 신규 공용 원본 2개를 GitHub에서 실제 조회; 각각의 바이트 길이·Git blob SHA 및 Unicode cmap 8문자 분담 확인.
- **확인**: 비공개 원본 대신 OS에 있는 공개 Noto 두 파일만 넣은 *합성 ZIP*으로 로컬 Python `fontTools` 분석기 동작 확인(8/8 코드포인트 커버, 2개 후보).
- **미실행**: 새 DEV37 버전 실제 `npm ci`/`npm run test:local`/`npm run build`/`npm run verify:dist`, 신규 7개 글꼴의 실제 브라우저 PDF 생성 및 임베딩 검사.
- **미실행**: 사용자 원본 안심글꼴 365종/548파일 전체 스캔; 사용자 HWP/HWPX 25개 실기; 원본 124페이지 품질 대조; 모바일.
- **변경 금지 유지**: GitHub Actions 재활성화, main 병합, Cloudflare 운영 배포, 문서·폰트 파일의 D1/외부 업로드.

## 후속 수락 게이트
1. 사용자가 이미 제공한 보관 글꼴 ZIP 2개의 raw-byte 접근을 복구하고 **전체 폰트 실제 cmap·라이선스·fsType**을 다시 스캔. 확인 가능한 유사 사용자 서체가 있으면 원본 재현성이 높은 안심글꼴로 우선 교체한다.
2. 로컬 Node 의존성 설치·타깃 회귀·전체 빌드·dist 해시 검사. Actions는 활성화하지 않는다.
3. 테스트 HWP/HWPX에서 8글자 포함 PDF 실제 생성→ToUnicode 검색/복사와 embedded font 확인, 모바일 포함.
4. 사용자 25개 실제 문서 및 124페이지 수락시험 후 명시적 승인으로만 배포.

**판정:** 개발 보완 코드 반영. 8문자 바이너리 cmap 증거 확보. 실PDF 품질/전체 사용자 글꼴 검사/운영 배포는 PENDING.

## 2026-11-16 후속 개발 검증 기록

- 기존 글꼴 메타데이터 검사 `f.size>600000`는 신규 NotoSans 393200바이트 및 NotoSansYi 182784바이트를 잘못 불합격 처리하므로 실제 자산 크기에 맞춰 하한 수정.
- Noto Symbols 패밀리 정규식 내 불필요한 역슬래시를 제거해 정확한 패밀리 이름을 검사.
- DEV37 등록 테스트 `tests/dev37-mixed-font-run-qa.mjs`: 원래 Unicode 8개, 한글/특수문자 혼합 구간, 명시적 로컬 서체 우선, 미지원 코드포인트 fail-closed 네 가지를 본래 `pdf-fonts.js`에 직접 연결해 평가. **선별된 순수 JS 함수 실행 4/4 PASS**; 전체 npm test 실행은 아님.
- 사용자용 Python 글꼴 ZIP 검사기는 원래 U+002D를 복원하고 WOFF/WOFF2를 검사 대상으로 확대. EOT 형식은 조용히 제외하지 않고 미지원 항목으로 기록. 공개 글꼴 2개를 넣은 합성 ZIP에서 원래 8개 포인트 8/8 탐색 PASS. 이 합성 TTF는 배포용 고정 SHA 원본과 **다른 버전**이므로 실제 DEV37 번들 설치·빌드 합격을 의미하지 않음.
- User 제공 ZIP 바이트 접근은 현재 불가하며 전체 365서체/548개 파일의 재검증은 진행되지 못함. 이 사실과 배포 미실시 상태 유지.
