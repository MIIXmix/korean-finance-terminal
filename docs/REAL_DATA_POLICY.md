# 실제 데이터와 가짜 데이터 구분 정책

## 절대 금지

- 네트워크 오류 시 랜덤 가격 표시
- API 키가 없는데 실적/배당/옵션/뉴스를 샘플 숫자로 대체
- Paper Trading 주문을 실제 주문처럼 표현
- 지연 공개 데이터를 실시간처럼 표현

## 허용

- UI 스켈레톤/로딩 문구
- `데이터 없음`, `API 필요`, `지연 데이터`, `오류` 상태 배지
- 사용자가 직접 입력한 포트폴리오 수량/평단
- 로컬 규칙 기반 AI 요약. 단, `LOCAL RULE SUMMARY`로 표시

## API 응답 예시

```json
{
  "symbol": "005930.KS",
  "price": 349000,
  "status": "delayed",
  "message": "지연 데이터",
  "source": "yfinance Yahoo Finance public endpoints"
}
```

```json
{
  "status": "api_required",
  "message": "DART_API_KEY 필요",
  "items": []
}
```
