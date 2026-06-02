# 로그인과 보안 설계

로컬 1인용 앱입니다. 외부 네트워크 노출이 없는 것을 전제로 하되, 다계정/공유 PC를 위한 방어도 포함합니다.

## 로그인 (단일 마스터 비밀번호)

- 이메일 없이 **마스터 비밀번호 하나**로 앱 전체를 잠급니다(최초 실행 시 설정).
- 비밀번호는 PBKDF2-HMAC-SHA256, 16바이트 랜덤 salt, **320,000 rounds**로 저장하고 비교는 상수시간(`hmac.compare_digest`).
- 세션 토큰은 HMAC-SHA256 서명 토큰이며 기본 TTL은 `TOKEN_TTL_MINUTES=240`(4시간). `token_version`을 두어 비밀번호 변경 시 기존 토큰을 모두 무효화합니다.
- 로그인 시도 제한(throttle): 5분 창에 8회 초과 시 429.
- **분실 시 복구 불가** — `.data` 폴더 삭제 후 재설정해야 합니다(저장 데이터 삭제).

## 앱 비밀(APP_SECRET)

- 최초 실행 시 `secrets.token_urlsafe(64)`로 **자동 생성**되어 `.data/secret.key`에 저장됩니다. placeholder 값은 거부합니다.
- Windows에서는 `icacls`로 현재 사용자만 접근하도록 ACL을 제한(`/inheritance:r /grant:r USER:F`), POSIX에서는 `chmod 600`.
- 이 비밀에서 **HKDF로 두 키를 분리 파생**합니다: 토큰 서명용(`kft:token-sign:v1`)과 API 키 암호화용(`kft:apikey-encrypt:v1`). 한 키가 노출돼도 다른 키는 드러나지 않습니다.

## API 키 저장

- 사용자별 Gemini/DART 키는 온보딩/설정에서 입력하며 DB에 원문 저장하지 않습니다.
- 위 암호화 키로 Fernet 암호화하여 저장하고, UI·목록 API에는 마스킹 값(`AIza...1234`)만 노출합니다.
- 호출 시점에 복호화하여 사용합니다(`get_api_key`). 복호화 실패는 조용히 env fallback/없음으로 처리합니다.

## 전체 잠금 / 하드닝

- 모든 데이터·AI·포트폴리오·설정 라우트가 인증을 요구합니다. 공개 라우트는 `/api/health`(상태만), `/api/auth/status|setup|login`, 정적 파일뿐입니다.
- `/api/health`는 보안 경고·키 설정 상태를 노출하지 않습니다(인증된 `/api/config-status`로만 제공).
- 보안 헤더: CSP(`default-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- CORS: localhost로 제한, `allow_credentials=False`, 메서드 제한(헤더 기반 Bearer 인증이라 쿠키 불필요).
- 입력 검증: 심볼/코드 길이·형식, `corp_code ^\d{8}$`(라우트+서비스 이중), 설정 키 allowlist(layout/prefs/onboarding) + 64KB 상한.
- 정적 파일 서빙은 경로 containment 가드로 디렉터리 탈출 차단.
- SQL은 전부 파라미터 바인딩.

## 배포 시 주의

- `.env`, `.data/`(DB·secret.key)는 `.gitignore` 및 `scripts/package_project.ps1`에서 제외됩니다. ZIP/공개 저장소에 절대 포함하지 마세요(스크립트가 포함 시 빌드를 실패시킵니다).
- 루프백(`127.0.0.1`) 바인딩 권장. 외부 노출/리버스 프록시 뒤에 둘 경우 throttle 키잉과 HTTPS를 재검토하세요.
- yfinance/네이버는 비공식·공개 지연 데이터입니다. 개인 용도 전제.

## 현재 한계

- MFA, 비밀번호 재설정/복구는 미구현(단일 로컬 사용자 모델).
- 브로커 실거래 어댑터는 의도적으로 비활성 골격만 제공(`LIVE_TRADING_ENABLED=false` 기본, 403/501 차단).
