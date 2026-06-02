# 데이터 출처와 제한

## 기본 출처

| 데이터 | 현재 구현 | 제한 |
| --- | --- | --- |
| 미국 주식/ETF/지수 | yfinance | Yahoo Finance 공개 엔드포인트 기반. 상업용/실시간 보장 아님 |
| 한국 주식 | yfinance `.KS`, `.KQ` 심볼 | 종목별 누락 가능. KRX 정식 계약 아님 |
| KOSPI/KOSDAQ 종목 목록 | Naver Finance 시가총액 공개 페이지 | API 키 없이 조회. 공개 페이지 파싱이라 지연/구조 변경 가능 |
| 한국 종목 스냅샷 fallback | `data/korea_universe_screen_snapshot_2026-06-01.csv` | 이전 스크리닝 후보 829개. 전체 원장이 아니라 fallback 후보 목록 |
| 금리/원자재/환율 | yfinance 심볼 `^TNX`, `CL=F`, `GC=F`, `KRW=X` | 지연/누락 가능 |
| 뉴스 | Yahoo Finance RSS | 원문 중심. 로컬 번역은 규칙 기반 부분 번역 |
| SEC | `data.sec.gov/submissions` | 공개 API. User-Agent 필요 |
| DART | OpenDART | API 키 필요 |
| 옵션 | yfinance option chain | 종목별 옵션 만기 누락 가능 |

## 권장 상용 확장

- 미국 실시간/옵션: Polygon, Tiingo, Finnhub, Alpaca Market Data
- 한국 실시간: 한국투자증권 Open API, 증권사/거래소 정식 데이터 계약
- 뉴스/감성: Finnhub, NewsAPI, Benzinga, RavenPack 등
- 실적 캘린더: Finnhub, Polygon, Financial Modeling Prep 등

## 상태 표시 규칙

- `live`: 정식 실시간 계약/API로 확인된 경우만 사용
- `delayed`: yfinance, RSS, 공개 API처럼 지연 가능성이 있는 경우
- `api_required`: 기능은 있지만 키가 없어 조회하지 못한 경우
- `not_available`: 제공자 응답에 값이 없는 경우
- `error`: 네트워크, 파싱, 인증 등 오류

숫자 누락 시 임의 값, 샘플 값, 랜덤 값으로 대체하지 않습니다.

## 한국 종목 유니버스 정책

- `/api/market/korea/universe?market=KOSPI|KOSDAQ|ALL`은 기본적으로 네이버 금융 시가총액 공개 페이지를 읽어 종목 코드, 종목명, 현재가, 등락률, 시가총액, 거래량, PER, ROE를 반환합니다.
- 응답 `sourceMode=naver`, `coverage=full_public_page`이면 공개 페이지 기준 전체 목록입니다. 정식 실시간 피드가 아니므로 상태는 `delayed`입니다.
- 네이버 접근 실패 시 `sourceMode=snapshot`, `coverage=screened_snapshot`으로 전환합니다. 이 경우 프로젝트 내 `2026-06-01` 후보 스냅샷만 보여주며 전체 KOSPI/KOSDAQ 원장이 아닙니다.
- 운영 서비스에서 정확한 전체 종목 원장과 실시간 시세가 필요하면 KRX/증권사/상용 데이터 제공자 계약을 붙여야 합니다.
