# API 키 설정

## `.env`

`.env.example`을 `.env`로 복사한 뒤 필요한 키만 채웁니다.

```env
APP_SECRET=change-this-long-random-secret
SEC_USER_AGENT=KoreanFinanceTerminal/0.1 your-email@example.com
DART_API_KEY=
GEMINI_API_KEY=
LIVE_TRADING_ENABLED=false
```

## Gemini

- 변수: `GEMINI_API_KEY`
- 모델: `GEMINI_MODEL`, 기본 `gemini-2.5-flash`
- 키가 없으면 로컬 규칙 기반 요약/감성/부분 번역으로 작동합니다.
- 브라우저 번들에 Gemini 키를 넣지 않습니다. 서버에서만 호출합니다.

## DART

- 변수: `DART_API_KEY`
- 6자리 한국 종목코드 또는 `.KS/.KQ` 심볼을 입력하면 OpenDART `corpCode.xml`을 내려받아 `corp_code`를 자동 매핑합니다.
- 예: `005930.KS`, `005930`
- 매핑 파일은 서버 프로세스 메모리에 캐시됩니다.

## SEC

- 키는 필요 없습니다.
- 자동 접근 정책을 위해 `SEC_USER_AGENT`를 실사용자 연락 가능한 값으로 설정하세요.

## 브로커

- Alpaca: `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_BASE_URL`
- IBKR: Client Portal Gateway 또는 Web API 인증 구성이 필요합니다.
- 한국투자증권: `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_ACCOUNT_NO`
- 앱 DB에 사용자별 키를 저장할 때는 `APP_SECRET` 기반 Fernet으로 암호화하고, UI에는 마스킹 값만 표시합니다.
