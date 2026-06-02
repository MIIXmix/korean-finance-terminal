from __future__ import annotations

import io
import re
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any
import xml.etree.ElementTree as ET

import httpx

from ..auth import get_api_key
from ..config import settings


_TICKER_MAP: dict[str, Any] | None = None
_DART_CORP_INDEX: dict[str, dict[str, str]] | None = None

DART_SYMBOL_TO_CORP_CODE = {
    "005930.KS": "00126380",
    "005930": "00126380",
}


async def _company_tickers() -> dict[str, Any]:
    global _TICKER_MAP
    if _TICKER_MAP is not None:
        return _TICKER_MAP
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            "https://www.sec.gov/files/company_tickers.json",
            headers={"User-Agent": settings.sec_user_agent},
        )
        response.raise_for_status()
        _TICKER_MAP = response.json()
        return _TICKER_MAP


async def sec_filings(symbol: str, limit: int = 12) -> dict[str, Any]:
    normalized = symbol.strip().upper()
    try:
        mapping = await _company_tickers()
        match = None
        for company in mapping.values():
            if company.get("ticker", "").upper() == normalized:
                match = company
                break
        if not match:
            return {"symbol": normalized, "status": "not_available", "message": "SEC CIK 매핑 없음", "items": []}
        cik = str(match["cik_str"]).zfill(10)
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                f"https://data.sec.gov/submissions/CIK{cik}.json",
                headers={"User-Agent": settings.sec_user_agent},
            )
            response.raise_for_status()
            data = response.json()
        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])[:limit]
        dates = recent.get("filingDate", [])[:limit]
        accession = recent.get("accessionNumber", [])[:limit]
        primary = recent.get("primaryDocument", [])[:limit]
        items = []
        for idx, form in enumerate(forms):
            acc = accession[idx].replace("-", "") if idx < len(accession) else ""
            doc = primary[idx] if idx < len(primary) else ""
            url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{doc}" if acc and doc else ""
            items.append({"form": form, "filingDate": dates[idx] if idx < len(dates) else "", "url": url})
        return {
            "symbol": normalized,
            "company": match.get("title"),
            "cik": cik,
            "status": "delayed",
            "message": "SEC 공개 EDGAR 데이터",
            "source": "SEC data.sec.gov",
            "asOf": datetime.now(timezone.utc).isoformat(),
            "items": items,
        }
    except Exception as exc:
        return {"symbol": normalized, "status": "error", "message": f"SEC 조회 오류: {type(exc).__name__}", "items": []}


def _normalize_dart_stock_code(symbol: str | None) -> str | None:
    if not symbol:
        return None
    normalized = symbol.strip().upper()
    for suffix in (".KS", ".KQ"):
        if normalized.endswith(suffix):
            normalized = normalized.removesuffix(suffix)
    return normalized if normalized.isdigit() and len(normalized) == 6 else None


async def _dart_corp_index() -> dict[str, dict[str, str]]:
    global _DART_CORP_INDEX
    if _DART_CORP_INDEX is not None:
        return _DART_CORP_INDEX
    dart_key = get_api_key("dart")
    if not dart_key:
        return {}
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            "https://opendart.fss.or.kr/api/corpCode.xml",
            params={"crtfc_key": dart_key},
        )
        response.raise_for_status()
    try:
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            xml_name = next((name for name in archive.namelist() if name.lower().endswith(".xml")), None)
            if not xml_name:
                raise ValueError("corpCode XML not found in zip")
            xml_bytes = archive.read(xml_name)
    except zipfile.BadZipFile as exc:
        raise ValueError("OpenDART corpCode response was not a zip archive") from exc
    root = ET.fromstring(xml_bytes)
    index: dict[str, dict[str, str]] = {}
    for item in root.findall("list"):
        stock_code = (item.findtext("stock_code") or "").strip()
        if not stock_code:
            continue
        index[stock_code] = {
            "corp_code": (item.findtext("corp_code") or "").strip(),
            "corp_name": (item.findtext("corp_name") or "").strip(),
            "stock_code": stock_code,
        }
    _DART_CORP_INDEX = index
    return index


async def _resolve_dart_corp(symbol: str | None) -> dict[str, str] | None:
    normalized = symbol.strip().upper() if symbol else ""
    if normalized in DART_SYMBOL_TO_CORP_CODE:
        return {"corp_code": DART_SYMBOL_TO_CORP_CODE[normalized], "corp_name": "", "stock_code": _normalize_dart_stock_code(normalized) or ""}
    stock_code = _normalize_dart_stock_code(symbol)
    if not stock_code:
        return None
    index = await _dart_corp_index()
    return index.get(stock_code)


async def dart_filings(corp_code: str | None = None, symbol: str | None = None, limit: int = 12) -> dict[str, Any]:
    limit = max(1, min(int(limit), 30))
    if corp_code is not None and not re.fullmatch(r"\d{8}", corp_code):
        return {"status": "error", "message": "corp_code must be 8 digits", "items": [], "source": "OpenDART"}
    dart_key = get_api_key("dart")
    if not dart_key:
        return {
            "status": "api_required",
            "message": "DART_API_KEY 필요",
            "items": [],
            "source": "OpenDART",
        }
    resolved_corp: dict[str, str] | None = None
    if not corp_code and symbol:
        try:
            resolved_corp = await _resolve_dart_corp(symbol)
        except Exception as exc:
            return {
                "status": "error",
                "message": f"DART 종목 매핑 오류: {type(exc).__name__}",
                "items": [],
                "source": "OpenDART",
            }
        corp_code = resolved_corp.get("corp_code") if resolved_corp else None
    if not corp_code:
        return {
            "status": "api_required",
            "message": "corp_code 또는 6자리 한국 종목코드 필요",
            "items": [],
            "source": "OpenDART",
            "symbol": symbol,
        }
    try:
        begin_date = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y%m%d")
        params = {"crtfc_key": dart_key, "corp_code": corp_code, "bgn_de": begin_date, "page_count": str(limit)}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get("https://opendart.fss.or.kr/api/list.json", params=params)
            response.raise_for_status()
            data = response.json()
        if data.get("status") != "000":
            return {
                "status": "not_available",
                "message": data.get("message", "DART 데이터 없음"),
                "corpCode": corp_code,
                "corpName": resolved_corp.get("corp_name") if resolved_corp else None,
                "stockCode": resolved_corp.get("stock_code") if resolved_corp else None,
                "items": [],
                "source": "OpenDART",
            }
        items = [
            {
                "corpName": item.get("corp_name"),
                "reportName": item.get("report_nm"),
                "receiptNo": item.get("rcept_no"),
                "date": item.get("rcept_dt"),
                "url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={item.get('rcept_no')}",
            }
            for item in data.get("list", [])[:limit]
        ]
        return {
            "status": "delayed",
            "message": "OpenDART 공개 공시",
            "corpCode": corp_code,
            "corpName": resolved_corp.get("corp_name") if resolved_corp else None,
            "stockCode": resolved_corp.get("stock_code") if resolved_corp else None,
            "items": items,
            "source": "OpenDART",
            "asOf": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        return {"status": "error", "message": f"DART 조회 오류: {type(exc).__name__}", "items": [], "source": "OpenDART"}
