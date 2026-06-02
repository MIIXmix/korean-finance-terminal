from __future__ import annotations

from collections import defaultdict
from typing import Any

from ..db import get_db, row_to_dict
from .market_data import quote, usd_to_krw


def list_holdings(user_id: int) -> list[dict[str, Any]]:
    with get_db() as con:
        rows = con.execute(
            """
            SELECT id, symbol, name, quantity, average_cost, currency, market, sector, country, target_weight, updated_at
            FROM holdings
            WHERE user_id = ?
            ORDER BY market, symbol
            """,
            (user_id,),
        ).fetchall()
    return [row_to_dict(row) for row in rows if row]


BASE_CURRENCY = "KRW"


def _to_base(value: float | None, currency: str, rate: float | None) -> float | None:
    """보유 통화 금액을 기준통화(KRW)로 환산. USD는 환율 적용, KRW는 그대로."""
    if value is None:
        return None
    cur = (currency or "").upper()
    if cur in ("KRW", ""):
        return value
    if cur == "USD":
        return value * rate if rate else None
    # 그 외 통화는 환율 미지원 — 그대로 둠(경고로 표시)
    return value


def portfolio_summary(user_id: int) -> dict[str, Any]:
    holdings = list_holdings(user_id)
    if not holdings:
        return {
            "status": "not_available",
            "message": "포트폴리오 보유 입력 없음",
            "holdings": [],
            "totals": {
                "marketValue": 0,
                "cost": 0,
                "pnl": 0,
                "pnlPercent": None,
                "currency": BASE_CURRENCY,
            },
            "allocations": {"sector": [], "country": [], "currency": []},
            "baseCurrency": BASE_CURRENCY,
            "fxRate": None,
        }
    rate = usd_to_krw()
    enriched = []
    total_value_base = 0.0
    total_cost_base = 0.0
    warnings = []
    if rate is None:
        warnings.append("USD/KRW 환율 조회 실패 — 통화별 금액을 단순 합산했습니다")
    for holding in holdings:
        q = quote(holding["symbol"])
        price = q.get("price")
        # 보유 통화: 입력값 우선, 없으면 시세 통화
        currency = (holding.get("currency") or q.get("currency") or BASE_CURRENCY).upper()
        qty = float(holding["quantity"])
        avg = float(holding["average_cost"])
        value = qty * price if price is not None else None  # 보유 통화 평가액
        cost = qty * avg  # 보유 통화 매입액
        value_base = _to_base(value, currency, rate)
        cost_base = _to_base(cost, currency, rate)
        total_cost_base += cost_base or 0
        if value_base is not None:
            total_value_base += value_base
        else:
            warnings.append(f"{holding['symbol']} 가격 데이터 없음")
        if currency not in ("KRW", "USD") and value is not None:
            warnings.append(f"{holding['symbol']} {currency} 환율 미지원 — 단순 합산")
        pnl = value - cost if value is not None else None  # 보유 통화 손익
        pnl_pct = (pnl / cost) * 100 if pnl is not None and cost else None
        enriched.append(
            {
                **holding,
                "quote": q,
                "currency": currency,
                "currentPrice": round(price, 4) if price is not None else None,
                "marketValue": round(value, 2) if value is not None else None,
                "cost": round(cost, 2),
                "marketValueBase": round(value_base, 0) if value_base is not None else None,
                "costBase": round(cost_base, 0) if cost_base is not None else None,
                "pnl": round(pnl, 2) if pnl is not None else None,
                "pnlPercent": round(pnl_pct, 2) if pnl_pct is not None else None,
            }
        )
    for holding in enriched:
        value_base = holding.get("marketValueBase") or 0
        holding["weight"] = round((value_base / total_value_base) * 100, 2) if total_value_base else None
        target = holding.get("target_weight")
        if target is not None and holding["weight"] is not None:
            drift = holding["weight"] - float(target)
            holding["rebalance"] = "점검 필요" if abs(drift) >= 5 else "정상"
            holding["targetDrift"] = round(drift, 2)
        elif holding["weight"] is not None and holding["weight"] >= 40:
            holding["rebalance"] = "집중도 점검"
            holding["targetDrift"] = None
        else:
            holding["rebalance"] = "정상"
            holding["targetDrift"] = None
    allocations = _allocations(enriched, total_value_base)
    pnl_base = total_value_base - total_cost_base
    return {
        "status": "delayed",
        "message": "보유 수량은 사용자 입력, 시세는 공개 지연 데이터. 총액은 원화(KRW) 환산.",
        "holdings": enriched,
        "totals": {
            "marketValue": round(total_value_base, 0),
            "cost": round(total_cost_base, 0),
            "pnl": round(pnl_base, 0),
            "pnlPercent": round((pnl_base / total_cost_base) * 100, 2) if total_cost_base else None,
            "currency": BASE_CURRENCY,
        },
        "allocations": allocations,
        "baseCurrency": BASE_CURRENCY,
        "fxRate": round(rate, 2) if rate else None,
        "warnings": list(dict.fromkeys(warnings)),
    }


def _allocations(holdings: list[dict[str, Any]], total: float) -> dict[str, list[dict[str, Any]]]:
    buckets = {"sector": defaultdict(float), "country": defaultdict(float), "currency": defaultdict(float)}
    for holding in holdings:
        value = holding.get("marketValueBase") or 0
        buckets["sector"][holding.get("sector") or "미분류"] += value
        buckets["country"][holding.get("country") or "미분류"] += value
        buckets["currency"][holding.get("currency") or "미분류"] += value
    result = {}
    for key, bucket in buckets.items():
        result[key] = [
            {"name": name, "value": round(value, 0), "weight": round((value / total) * 100, 2) if total else 0}
            for name, value in sorted(bucket.items(), key=lambda item: item[1], reverse=True)
        ]
    return result
