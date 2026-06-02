# 레이아웃 커스터마이징

## 동작

- 위젯 헤더를 드래그해서 같은 탭 안의 좌/중앙/우 컬럼으로 이동할 수 있습니다.
- 위젯 하단을 세로로 리사이즈할 수 있습니다.
- 좌/중앙/우 패널 사이 구분선을 드래그해서 폭을 조절할 수 있습니다.
- `레이아웃 저장` 버튼을 누르면 로컬 저장소에 저장됩니다.
- 로그인 상태에서는 `/api/settings/layout`에 사용자별 레이아웃도 저장됩니다.

## 저장 구조

```json
{
  "panels": { "left": 260, "right": 360 },
  "tabs": {
    "markets": {
      "left": ["marketPulse", "watchGrid"],
      "center": ["symbolHeader", "chart"],
      "right": ["order", "filings"]
    }
  },
  "widgetHeights": { "chart": 520 }
}
```

## 복구

브라우저 로컬 레이아웃을 초기화하려면 개발자도구 콘솔에서:

```js
localStorage.removeItem('kft_layout')
```
