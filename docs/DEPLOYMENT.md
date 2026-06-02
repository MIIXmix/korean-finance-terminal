# 실서버 배포

## Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

기본 포트는 `8000`입니다.

## 리버스 프록시

운영에서는 Nginx/Caddy/Traefik 앞단을 두고 HTTPS를 종료합니다.

예시 Nginx 개념:

```nginx
server {
  listen 443 ssl;
  server_name terminal.example.com;

  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## 운영 체크리스트

- `.env`의 `APP_SECRET` 교체
- `SEC_USER_AGENT` 실사용 연락처 반영
- `CORS_ORIGINS=https://terminal.example.com`
- 방화벽에서 8000 직접 노출 차단
- DB 볼륨 백업
- 로그에 API 키/주문 원문 남기지 않기
- 실거래 전 `LIVE_TRADING_ENABLED=false` 유지 상태로 Paper Trading 점검

## 빌드 구조

Dockerfile은 프론트엔드를 먼저 빌드한 뒤 `dist/`를 FastAPI 이미지에 복사합니다. FastAPI가 `/api/*`는 API로, 나머지는 React 정적 파일로 응답합니다.
