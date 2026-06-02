from __future__ import annotations

import asyncio
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import quote_plus

import httpx

from ..auth import get_api_key
from .ai import gemini_translate_titles, sentiment_for_text

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KoreanFinanceTerminal/0.1"
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _tickers(text: str) -> list[str]:
    return sorted(set(re.findall(r"\b[A-Z]{1,5}(?:\.[A-Z]{1,3})?\b", text)))[:8]


def _importance(title: str, summary: str) -> str:
    lower = f"{title} {summary}".lower()
    text = f"{title} {summary}"
    if any(word in lower for word in ("earnings", "guidance", "sec", "lawsuit", "fed", "rate", "merger")) or any(
        word in text for word in ("실적", "공시", "합병", "금리", "유상증자", "감자", "소송")
    ):
        return "높음"
    if any(word in lower for word in ("upgrade", "downgrade", "launch", "sales", "chip", "ai")) or any(
        word in text for word in ("목표주가", "신제품", "수주", "계약", "투자")
    ):
        return "중간"
    return "보통"


def _strip_source(title: str) -> tuple[str, str]:
    # Google News titles look like "Headline - Source"
    if " - " in title:
        head, _, source = title.rpartition(" - ")
        head = head.strip()
        source = source.strip()
        if head and source:
            return head, source
    return title.strip(), ""


def _norm_key(title: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"[^0-9a-zA-Z가-힣]+", "", title.lower()))[:60]


def _sort_key(pub: str) -> datetime:
    try:
        parsed = parsedate_to_datetime(pub)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return _EPOCH


def _parse_rss(xml_text: str, korean: bool, default_source: str, normalized: str, limit: int) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return items
    for node in root.findall("./channel/item")[: limit + 4]:
        raw_title = (node.findtext("title") or "").strip()
        if not raw_title:
            continue
        link = (node.findtext("link") or "").strip()
        pub_date = (node.findtext("pubDate") or "").strip()
        description = re.sub("<[^>]+>", "", node.findtext("description") or "").strip()
        title, embedded_source = _strip_source(raw_title)
        source = embedded_source or default_source
        sentiment = sentiment_for_text(f"{title} {description}")
        # No machine translation without an LLM key — show the original headline
        # honestly instead of a broken word-by-word substitution.
        translated = title
        korean_summary = description[:240] or title
        status = "korean_source" if korean else "original_en"
        items.append(
            {
                "title": title,
                "translatedTitle": translated,
                "summary": description[:320] if description else title,
                "koreanSummary": korean_summary,
                "url": link,
                "publishedAt": pub_date,
                "sentiment": sentiment,
                "relatedTickers": sorted(set([normalized, *_tickers(f"{title} {description}")]))[:8],
                "importance": _importance(title, description),
                "translationStatus": status,
                "source": source,
            }
        )
    return items


def _resolve_korea_name(symbol: str) -> str:
    code = symbol.split(".")[0]
    try:
        from .market_data import korea_universe
    except Exception:
        return ""
    for market in ("KOSPI", "KOSDAQ"):
        try:
            data = korea_universe(market, query=code, limit=1)
        except Exception:
            continue
        for item in data.get("items", []):
            if item.get("code") == code and item.get("name"):
                return str(item["name"])
    return ""


async def get_news(symbol: str, query: str = "", limit: int = 12) -> dict[str, Any]:
    normalized = (symbol or "").strip().upper() or "SPY"
    korean = normalized.endswith((".KS", ".KQ"))
    term = query.strip()
    if korean and not term:
        term = _resolve_korea_name(normalized)
    if not term:
        term = normalized.split(".")[0] if korean else normalized

    if korean:
        urls = [
            (
                f"https://news.google.com/rss/search?q={quote_plus(term + ' 주가')}&hl=ko&gl=KR&ceid=KR:ko",
                "Google News",
            )
        ]
    else:
        urls = [
            (
                f"https://news.google.com/rss/search?q={quote_plus(term + ' stock')}&hl=en-US&gl=US&ceid=US:en",
                "Google News",
            ),
            (
                f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={normalized}&region=US&lang=en-US",
                "Yahoo Finance RSS",
            ),
        ]

    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            responses = await asyncio.gather(
                *[client.get(url, headers={"User-Agent": _UA}) for url, _ in urls],
                return_exceptions=True,
            )
        merged: list[dict[str, Any]] = []
        seen: set[str] = set()
        for (_, default_source), response in zip(urls, responses):
            if isinstance(response, Exception):
                continue
            try:
                response.raise_for_status()
            except Exception:
                continue
            for item in _parse_rss(response.text, korean, default_source, normalized, limit):
                key = _norm_key(item["title"])
                if not key or key in seen:
                    continue
                seen.add(key)
                merged.append(item)
        merged.sort(key=lambda entry: _sort_key(entry["publishedAt"]), reverse=True)
        merged = merged[:limit]
        # Real Korean translation for English headlines when a Gemini key is set.
        if merged and not korean and get_api_key("gemini"):
            try:
                translations = await gemini_translate_titles([entry["title"] for entry in merged])
                for entry, korean_title in zip(merged, translations):
                    if korean_title:
                        entry["translatedTitle"] = korean_title
                        entry["translationStatus"] = "gemini"
            except Exception:
                pass
        if not merged:
            return {
                "symbol": normalized,
                "status": "not_available",
                "message": "뉴스 데이터 없음",
                "items": [],
                "asOf": datetime.now(timezone.utc).isoformat(),
            }
        return {
            "symbol": normalized,
            "query": term,
            "status": "delayed",
            "message": "한국어 뉴스" if korean else "지연 또는 RSS 기반 뉴스",
            "source": "Google News" if korean else "Google News + Yahoo Finance RSS",
            "items": merged,
            "asOf": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        return {
            "symbol": normalized,
            "status": "error",
            "message": f"뉴스 조회 오류: {type(exc).__name__}",
            "items": [],
            "asOf": datetime.now(timezone.utc).isoformat(),
        }
