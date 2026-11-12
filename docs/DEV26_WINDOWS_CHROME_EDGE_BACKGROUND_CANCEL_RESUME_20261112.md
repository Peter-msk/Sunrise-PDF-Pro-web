# Sunrise PDF PRO(web) — DEV26 Windows Chrome/Edge 백그라운드·취소·복귀 개선

**날짜:** 2026-11-12 KST  
**작업 브랜치:** `dev/dev26-final-integrated-source-20261112`  
**릴리스 안전 경계:** 운영 Cloudflare Worker 배포 없음 / `main` 병합 없음 / 운영 D1 쓰기 없음

## 1. 실제 확인된 소스 문제

1. 기존 `main.js`의 `pagehide` 이벤트 핸들러는 `event.persisted`를 구별하지 않고 변환을 취소하며 완성 PDF의 object URL과 미리보기를 정리했다. BFCache 방문 복귀에서도 정상 PDF 다운로드가 사라질 위험이 있다.
2. 단순 `visibilitychange` 복귀만 처리하여 Chrome/Edge `freeze`·`resume` 및 BFCache `pageshow`가 상태 표시·경과시간·ETA와 통합되지 않았다.
3. 백그라운드 전환 시 가시성 제한을 반영하지 않은 남은 시간 추정이 지속될 수 있었다.
4. 사용자 취소 버튼의 즉시 피드백과 연속 클릭 차단이 부족했다.
5. `runBatch`가 성공 파일 다음의 협력적 양보(`cooperativeYield`) 중 취소되면 예외가 상위 UI로 불필요하게 전파될 수 있었다.

## 2. 개발 수정

| 소스 파일 | 수정 내용 |
| --- | --- |
| `browser-local/src/main.js` | `visibilitychange`, `freeze`, `resume`, BFCache `pageshow`를 단일 `refreshBrowserLifecycle()` 처리로 연결. `pagehide.persisted === true`일 때 종료 정리를 수행하지 않아 완료 PDF와 파일 상태 유지. 반면 일반 종료에서는 기존 취소·정리 유지. `document.wasDiscarded` 로드 시 이전 작업 자동복구 불가 안내. 취소 버튼은 즉시 사용자 안내/중복 차단 |
| `browser-local/src/conversion-clock.js` | 백그라운드 및 동결 중 ETA 보류, 해제 시 실제 경과시간과 진행상태로 재평가. 20초 이상 갱신 지연 시 완료시각을 무리하게 제시하지 않음 |
| `browser-local/src/batch.js` | 완성 파일 다음 `cooperativeYield`에서 AbortError가 발생하면 정상적인 사용자 취소로 큐를 중단. 완료 PDF와 대기 파일을 유지 |
| `browser-local/tests/r66-windows-lifecycle.mjs` | 새 수명주기/ETA·정지 상태·파일별 수동 재시도·BFCache 소스 경계 테스트 5건 |
| `browser-local/tests/r66-windows-background-browser.mjs` | 실제 Windows 호스티드 러너 Chrome, Edge headed 모드에서 새 탭 전환, 네이티브 최소화/복귀, CDP 강제 freeze/active, 공개 HWP 변환 PDF 유효성, BFCache 모의 이벤트, 취소 후 HWPX 명시적 재시도 검증 |
| `browser-local/package.json` | 신규 Node 회귀검사를 정규 테스트 스크립트에 등록 |

중요: browser `freeze` 상태에선 JS가 실행되지 않으며 `discard`에서는 이전 브라우저 메모리 작업을 복원할 수 없다. **자동으로 중복 변환하지 않고** 브라우저가 돌아오면 같은 실행을 계속 진행할 수 있는 경우에만 이어진다. 사용자가 취소한 파일은 원본 파일 객체가 살아 있는 동일 페이지에서 명시적으로 `전체 PDF 변환`을 다시 누르면 재시도한다.

## 3. 실제 Windows Chrome/Edge QA 증거

**최종 성공 GitHub Actions:** https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43230870968

- GitHub-hosted **Windows Server 2025**에서 시스템에 설치된 실제 Chrome과 Edge 채널을 각각 Playwright `headless:false`로 실행.
- 관련 Node 테스트 **31 PASS / 0 FAIL / 0 SKIP**.
- Vite/WASM 빌드, 정적 자산·라우팅 계약 PASS; `wrangler dev --local`에서만 앱 서비스 실행.
- 공개 고정 HWP에서 Chrome 및 Edge 각각 출력 PDF를 생성하고 `pdf-lib`으로 실제 PDF 페이지가 1쪽 이상인지 확인.
- Chrome 및 Edge 모두 **`Browser.getWindowBounds`가 `windowState='minimized'`을 반환**한 OS 창 최소화 제어 확인.
- 두 브라우저 모두 탭 복귀·CDP `frozen→active` 이후 작업 완주 PASS; 글꼴 메타데이터 재조회는 1회.
- 두 브라우저 모두 `pagehide.persisted/pageshow.persisted` **합성 이벤트를 사용한 BFCache 정리 계약**을 통과. 실제 브라우저 BFCache 히스토리 복귀를 직접 관찰한 것은 아니다.
- 두 브라우저 모두 대기 중 사용자 취소 후 완료된 PDF가 없음을 확인하고, 명시적 재시도로 문서 변환 PASS.
- UI JavaScript 예외 없음.
- 인수 ZIP에서 재현이 필요한 실제 26.30MB·12쪽 실패 HWP/HWPX 원본은 제공되지 않아 이번에 포함하지 않았다.

**제약(매우 중요):** Windows CI 러너는 `headless:false`와 실제 창 최소화에도 `document.hidden=false`, CDP freeze/active 전환에도 `freeze/resume` DOM 이벤트 쌍이 관측되지 않았다. 따라서 자동화에서 창 상태 변환과 실제 PDF/취소·재시도 동작은 증명했지만, **사용자 Windows 데스크톱에서 발생하는 가시성 이벤트·장시간 최소화 중 OS 절전·실제 탭 discard·원본 문서 조판 동일성은 미검증**이다. 이 제한을 PASS의 의미와 분리한다.

중간 실패 기록:
- https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43229661579 — 새 ETA 테스트에서 진행률 25%의 30초 경과 시 잔여시간이 90초여야 한다는 테스트 산식 오류.
- https://github.com/Peter-msk/Sunrise-PDF-Pro-web/actions/runs/43230264500 — CDP 강제 수명주기 전환이면 페이지 `freeze/resume` DOM 이벤트가 반드시 둘 다 기록된다는 잘못된 시험 가정. 이는 Windows 자동화 환경에서 이벤트 발생이 보장되지 않음을 확인했으므로 이벤트 개수 대신 실제 작업/데이터 결과를 수락 조건으로 수정. 두 기록은 삭제하지 않음.

## 4. Windows 사용자 수락 시험

1. Windows 10/11 최신 Chrome·Edge에서 **실제 26.30MB·12쪽 사용자 오류 문서**를 각각 선택.
2. 1~2쪽 이후 다른 탭 전환 → 복귀, 창 최소화 → 복귀, 반복 3회. 복귀 후 진행 표시가 낡은 ETA를 유지하지 않는지 확인.
3. 최소화 상태가 10분 이상 지속될 때 메모리/CPU/OS 절전/탭 `discard` 결과 기록. 완전히 폐기된 탭은 자동 복구를 기대하지 않음.
4. 여러 파일 변환 중 취소 시 이미 완료된 PDF 보존·미완료 파일 대기/취소 상태·사용자 명시적 재시도 확인. 동일 PDF가 중복 생성되지 않아야 함.
5. 브라우저 히스토리 실제 BFCache 진입·복귀 시 기존 PDF 다운로드 동작 확인. 캐시에 진입하지 않은 경우에는 '미검증'으로 표기.
6. 사용자 PC 글꼴 권한/Windows 설치 폰트·한컴 기준 PDF의 글자 및 표 조판 차이는 PC 글꼴 수락시험으로 별도 추적.

## 5. 출처 및 결론

수명주기 근거: Chrome for Developers, Page Lifecycle API  
https://developer.chrome.com/docs/web-platform/page-lifecycle-api

**최종 판정:** DEV26 소스의 BFCache/백그라운드 상태 표시·취소·수동 재시도 관련 변경 영향 테스트와 Windows Chrome/Edge 로컬 브라우저 E2E PASS. `discard` 복원, 실제 일반 PC 장시간 최소화, 사용자 특정 실패 원본 수락시험은 미완료. 운영 Worker 및 `main`은 미변경.
