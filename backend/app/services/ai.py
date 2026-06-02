from __future__ import annotations

import re
from typing import Any

import httpx

from ..auth import get_api_key
from ..config import settings


NEGATIVE_WORDS = ("miss", "probe", "lawsuit", "falls", "cut", "weak", "risk", "delay", "loss", "downgrade")
POSITIVE_WORDS = ("beats", "surge", "gain", "record", "upgrade", "growth", "raises", "strong", "profit")


def sentiment_for_text(text: str) -> dict[str, Any]:
    lower = text.lower()
    positive = sum(1 for word in POSITIVE_WORDS if word in lower)
    negative = sum(1 for word in NEGATIVE_WORDS if word in lower)
    if positive > negative:
        label = "긍정"
        score = min(0.95, 0.55 + 0.1 * positive)
    elif negative > positive:
        label = "부정"
        score = max(-0.95, -0.55 - 0.1 * negative)
    else:
        label = "중립"
        score = 0
    return {"label": label, "score": round(score, 2), "method": "local_rules"}


def local_translate_title(title: str) -> str:
    replacements = {
        "stocks": "주식",
        "stock": "주식",
        "market": "시장",
        "markets": "시장",
        "earnings": "실적",
        "revenue": "매출",
        "profit": "이익",
        "shares": "주가",
        "rises": "상승",
        "falls": "하락",
        "beats": "예상 상회",
        "misses": "예상 하회",
        "fed": "연준",
        "rate": "금리",
        "inflation": "인플레이션",
        "ai": "AI",
        "chip": "칩",
        "chips": "칩",
    }
    translated = title
    for english, korean in replacements.items():
        translated = re.sub(rf"\b{re.escape(english)}\b", korean, translated, flags=re.IGNORECASE)
    if translated == title:
        return f"로컬 요약 번역: {title}"
    return translated


def local_summary(payload: dict[str, Any]) -> dict[str, Any]:
    symbol = payload.get("symbol") or payload.get("ticker") or "선택 종목"
    quote = payload.get("quote") or {}
    news = payload.get("news") or []
    chart = payload.get("chart") or {}
    points = chart.get("points") or []
    latest = quote.get("price")
    change = quote.get("changePercent")
    news_count = len(news)
    chart_note = "차트 데이터 없음"
    if len(points) >= 2:
        start = points[0].get("close")
        end = points[-1].get("close")
        if start and end:
            chart_note = f"선택 기간 종가 변화 {round(((end - start) / start) * 100, 2)}%"
    return {
        "status": "ok",
        "provider": "local_rules",
        "summary": (
            f"{symbol} 로컬 규칙 기반 분석입니다. 현재가={latest if latest is not None else '데이터 없음'}, "
            f"등락률={change if change is not None else '데이터 없음'}%, 관련 뉴스 {news_count}건. {chart_note}. "
            "Gemini API 키를 설정하면 공시/뉴스/차트 문맥을 더 긴 한국어 분석으로 확장합니다."
        ),
        "riskNotes": [
            "실시간 데이터가 아니라 지연 또는 공개 데이터일 수 있습니다.",
            "API 키가 없는 항목은 분석에서 제외했습니다.",
            "투자 조언이 아니라 정보 정리용 출력입니다.",
        ],
    }


async def gemini_generate(prompt: str) -> dict[str, Any]:
    key = get_api_key("gemini")
    if not key:
        return {"status": "api_required", "message": "Gemini API 키 필요"}
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent?key={key}"
    )
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
    text = ""
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception:
        text = "Gemini 응답을 해석하지 못했습니다."
    return {"status": "ok", "provider": "gemini", "summary": text}


async def gemini_translate_titles(titles: list[str]) -> list[str]:
    if not titles or not get_api_key("gemini"):
        return []
    numbered = "\n".join(f"{index + 1}. {title}" for index, title in enumerate(titles))
    prompt = (
        "다음 영어 금융 뉴스 제목들을 한국어로 자연스럽고 간결하게 번역해라. "
        "각 줄은 '번호. 번역문' 형식으로만 출력하고, 설명·원문·따옴표는 쓰지 마라.\n\n"
        f"{numbered}"
    )
    try:
        result = await gemini_generate(prompt)
    except Exception:
        return []
    if result.get("status") != "ok" or not result.get("summary"):
        return []
    output = [""] * len(titles)
    for line in result["summary"].splitlines():
        match = re.match(r"\s*(\d+)[.)]\s*(.+)", line)
        if not match:
            continue
        index = int(match.group(1)) - 1
        if 0 <= index < len(output):
            output[index] = match.group(2).strip()
    return output


async def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    if not get_api_key("gemini"):
        return local_summary(payload)
    prompt = (
        "너는 한국어 금융 터미널의 보조 분석 엔진이다. "
        "투자 권유가 아니라 데이터 요약, 리스크, 확인해야 할 공시/뉴스만 정리한다. "
        "데이터 없음, API 필요, 지연 데이터 상태를 절대 숨기지 마라.\n\n"
        f"입력 JSON:\n{payload}"
    )
    try:
        return await gemini_generate(prompt)
    except Exception as exc:
        fallback = local_summary(payload)
        fallback["provider"] = "local_rules_after_gemini_error"
        fallback["geminiError"] = type(exc).__name__
        return fallback
