# 브로커 연동 구조

## 안전 원칙

1. 기본 주문 경로는 `/api/orders/paper`
2. 실거래 경로 `/api/orders/live`는 `LIVE_TRADING_ENABLED=false`면 403
3. 실거래 어댑터가 없으면 501
4. UI에 `PAPER TRADING ONLY` 배지를 항상 표시
5. 실거래 활성화 시 브로커명, 계좌, 모드, 주문 전 확인 문구를 별도 표시해야 함

## Alpaca

- 문서: `https://docs.alpaca.markets/docs/trading-api`
- 기본 확장 포인트: paper endpoint와 live endpoint 분리
- 필요한 값: API key, secret, base URL

## Interactive Brokers

- 문서: `https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/`
- 개인 계정은 Client Portal Gateway/인증 제약이 있으므로 서버 배포 전 별도 설계 필요
- 2FA, 계정 활성화, 데이터 구독 조건 확인 필요

## 한국투자증권 Open API

- 문서: `https://apiportal.koreainvestment.com/docs`
- 국내/해외 주식, 선물옵션, 채권 등 기능 제공
- app key/secret, 계좌번호, 접근토큰 발급/갱신, 초당 호출 제한 반영 필요

## 다음 구현 순서

1. provider별 interface 작성: `get_positions`, `get_orders`, `place_order`, `cancel_order`
2. paper adapter를 기준 구현으로 고정
3. provider credentials 검증 endpoint 추가
4. 실거래는 계좌별 `live_enabled` 컬럼과 주문 전 이중 확인을 통과해야 실행
