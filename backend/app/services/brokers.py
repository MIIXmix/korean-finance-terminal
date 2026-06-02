from __future__ import annotations

from typing import Any


BROKER_PROVIDERS: list[dict[str, Any]] = [
    {
        "id": "alpaca",
        "name": "Alpaca",
        "markets": ["US stocks", "ETF", "options depending on account"],
        "defaultMode": "paper",
        "requires": ["ALPACA_API_KEY", "ALPACA_SECRET_KEY", "ALPACA_BASE_URL"],
        "paperTrading": True,
        "liveTrading": "disabled_by_default",
        "docs": "https://docs.alpaca.markets/docs/trading-api",
    },
    {
        "id": "ibkr",
        "name": "Interactive Brokers",
        "markets": ["global stocks", "ETF", "options", "futures"],
        "defaultMode": "paper",
        "requires": ["IBKR OAuth or Client Portal Gateway credentials"],
        "paperTrading": True,
        "liveTrading": "disabled_by_default",
        "docs": "https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/",
    },
    {
        "id": "kis",
        "name": "한국투자증권 Open API",
        "markets": ["한국 주식", "미국 주식", "ETF/ETN", "채권"],
        "defaultMode": "paper_or_mock_when_available",
        "requires": ["KIS_APP_KEY", "KIS_APP_SECRET", "KIS_ACCOUNT_NO"],
        "paperTrading": True,
        "liveTrading": "disabled_by_default",
        "docs": "https://apiportal.koreainvestment.com/docs",
    },
]


def providers() -> list[dict[str, Any]]:
    return BROKER_PROVIDERS
