# Sunrise PDF PRO — 브라우저 로컬 HWP/HWPX 변환 (R32)

- 공식 엔진: [edwardkim/rhwp](https://github.com/edwardkim/rhwp) v0.8.7 (MIT), `@rhwp/core@0.8.7`.
- PDF 엔진: `pdf-lib@1.17.1` + `@pdf-lib/fontkit@1.1.1`.
- 검색 계층용 글꼴: `@fontsource/nanum-gothic@5.3.0` (NHN Corporation / Sandoll Communication, [SIL OFL 1.1](https://fontsource.org/fonts/nanum-gothic/about)).
- 원본 HWP/HWPX는 브라우저에서만 읽고 서버 업로드·외부 유료 변환 API를 사용하지 않음.
- 정적 WASM과 검색용 웹폰트는 `Cloudflare Workers Static Assets`에서 같은 오리진으로 제공.

## PDF 출력 모드

- 기본: 최대 300dpi / 페이지당 9,000,000픽셀 / 최대 120쪽.
- 도면·표 정밀: 최대 360dpi / 페이지당 16,000,000픽셀 / 최대 30쪽.
- 검색·복사(기본 선택): rhwp SVG의 위치가 확정된 텍스트 요소에 대하여 PDF에 투명 한글 Unicode 텍스트 계층을 추가. 글자 좌표/폰트 메트릭이 불일치하거나 복잡하게 변형된 요소는 누락될 수 있으며 UI에 누락 개수를 표시함.
- 검색 계층을 끄면 기존 이미지 PDF 출력.

**중요:** R32는 텍스트 검색이 가능한 *hybrid PDF*입니다. 화면에 보이는 글자와 도면은 여전히 래스터 배경이므로 **전체 벡터 PDF가 아니며 한컴 PC PDF의 폰트·표·도면 조판과 동등하지 않습니다.** PDF는 검색 가능한 텍스트의 정확한 선택 순서/복사 띄어쓰기까지 모든 문서에서 보장하지 않습니다. 다음 게이트는 SVG 그림·선·표의 직접 벡터 PDF 출력 및 유효 글꼴 메트릭/텍스트 조판 일치 검증입니다.

## 검증

```bash
npm install --no-audit --no-fund --ignore-scripts
npm test
npm run build
npm run preview
```

저장소 루트의 `npm run build`는 browser-local 빌드, WASM 무결성, Worker 정적 자산 라우팅 테스트를 수행합니다. GitHub Actions는 실제 Wrangler Worker ↔ Chromium ↔ HWP/HWPX → PDF 다운로드와 `pypdf` 한글 텍스트 추출까지 확인합니다.

소스 문서·계측자료를 리포지토리에 업로드하지 마세요. 실무 문서 검증은 사용자 로컬 PC에서 민감정보 보호 상태로 진행합니다.
