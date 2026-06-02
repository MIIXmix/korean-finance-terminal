from __future__ import annotations

from math import isnan
from typing import Any

import numpy as np
import pandas as pd

# Ichimoku Kinko Hyo standard parameters
ICHIMOKU_TENKAN = 9
ICHIMOKU_KIJUN = 26
ICHIMOKU_SENKOU_B = 52
ICHIMOKU_DISPLACEMENT = 26


def _clean(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if isnan(number):
        return None
    return round(number, 4)


def _parabolic_sar(
    high: np.ndarray, low: np.ndarray, af_step: float = 0.02, af_max: float = 0.2
) -> list[float]:
    n = len(high)
    psar: list[float] = [float("nan")] * n
    if n < 2:
        return psar
    bull = True
    af = af_step
    ep = float(high[0])
    sar = float(low[0])
    for i in range(1, n):
        sar = sar + af * (ep - sar)
        if bull:
            sar = min(sar, float(low[i - 1]), float(low[i - 2]) if i >= 2 else float(low[i - 1]))
            if low[i] < sar:
                bull = False
                sar = ep
                ep = float(low[i])
                af = af_step
            elif high[i] > ep:
                ep = float(high[i])
                af = min(af + af_step, af_max)
        else:
            sar = max(sar, float(high[i - 1]), float(high[i - 2]) if i >= 2 else float(high[i - 1]))
            if high[i] > sar:
                bull = True
                sar = ep
                ep = float(high[i])
                af = af_step
            elif low[i] < ep:
                ep = float(low[i])
                af = min(af + af_step, af_max)
        psar[i] = sar
    return psar


def add_indicators(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame
    close = frame["Close"]
    high = frame["High"]
    low = frame["Low"]

    # Moving averages (Korean standard set 5/20/60/120 + legacy 50)
    for window in (5, 20, 50, 60, 120):
        frame[f"SMA{window}"] = close.rolling(window).mean()
    frame["EMA20"] = close.ewm(span=20, adjust=False).mean()

    # Bollinger Bands (20, 2 sigma)
    mid = close.rolling(20).mean()
    std = close.rolling(20).std()
    frame["BB_UPPER"] = mid + 2 * std
    frame["BB_LOWER"] = mid - 2 * std

    # RSI 14 with Wilder smoothing; 100 when there are no losses
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    avg_loss = loss.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    rsi = rsi.where(avg_loss != 0, 100.0)
    frame["RSI14"] = rsi

    # MACD (12, 26, 9)
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    frame["MACD"] = ema12 - ema26
    frame["MACD_SIGNAL"] = frame["MACD"].ewm(span=9, adjust=False).mean()
    frame["MACD_HIST"] = frame["MACD"] - frame["MACD_SIGNAL"]

    volume = frame["Volume"]

    # Stochastic oscillator (14, 3)
    low14 = low.rolling(14).min()
    high14 = high.rolling(14).max()
    span14 = (high14 - low14).replace(0, pd.NA)
    stoch_k = 100 * (close - low14) / span14
    frame["STOCH_K"] = stoch_k
    frame["STOCH_D"] = stoch_k.rolling(3).mean()

    # True Range and ATR(14) Wilder
    prev_close = close.shift(1)
    true_range = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    atr = true_range.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    frame["ATR14"] = atr

    # On-Balance Volume
    direction = np.sign(close.diff().fillna(0.0))
    frame["OBV"] = (direction * volume).fillna(0.0).cumsum()

    # Rolling VWAP(20)
    typical = (high + low + close) / 3
    vwap_vol = volume.rolling(20).sum().replace(0, pd.NA)
    frame["VWAP"] = (typical * volume).rolling(20).sum() / vwap_vol

    # ADX / +DI / -DI (14) Wilder
    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = ((up_move > down_move) & (up_move > 0)) * up_move.fillna(0.0)
    minus_dm = ((down_move > up_move) & (down_move > 0)) * down_move.fillna(0.0)
    atr_for_dx = true_range.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean().replace(0, pd.NA)
    plus_di = 100 * plus_dm.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean() / atr_for_dx
    minus_di = 100 * minus_dm.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean() / atr_for_dx
    di_sum = (plus_di + minus_di).replace(0, pd.NA)
    dx = 100 * (plus_di - minus_di).abs() / di_sum
    frame["PLUS_DI"] = plus_di
    frame["MINUS_DI"] = minus_di
    frame["ADX"] = dx.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()

    # Parabolic SAR (0.02 step, 0.2 max)
    frame["PSAR"] = _parabolic_sar(high.to_numpy(), low.to_numpy())

    # Classic pivot points (support / resistance) from the previous bar's HLC
    prev_high = high.shift(1)
    prev_low = low.shift(1)
    pivot = (prev_high + prev_low + prev_close) / 3
    prev_range = prev_high - prev_low
    frame["PIVOT"] = pivot
    frame["PIVOT_R1"] = 2 * pivot - prev_low
    frame["PIVOT_S1"] = 2 * pivot - prev_high
    frame["PIVOT_R2"] = pivot + prev_range
    frame["PIVOT_S2"] = pivot - prev_range

    # Ichimoku Kinko Hyo
    disp = ICHIMOKU_DISPLACEMENT
    tenkan = (high.rolling(ICHIMOKU_TENKAN).max() + low.rolling(ICHIMOKU_TENKAN).min()) / 2
    kijun = (high.rolling(ICHIMOKU_KIJUN).max() + low.rolling(ICHIMOKU_KIJUN).min()) / 2
    senkou_a = (tenkan + kijun) / 2
    senkou_b = (high.rolling(ICHIMOKU_SENKOU_B).max() + low.rolling(ICHIMOKU_SENKOU_B).min()) / 2
    frame["ICHIMOKU_TENKAN"] = tenkan
    frame["ICHIMOKU_KIJUN"] = kijun
    frame["ICHIMOKU_CHIKOU"] = close.shift(-disp)

    # Project the leading span (cloud) `disp` periods past the last candle so the
    # forward cloud — the most-watched part of Ichimoku — is preserved.
    index = frame.index
    if isinstance(index, pd.DatetimeIndex) and len(index) >= 2:
        step = index[-1] - index[-2]
        future = pd.DatetimeIndex([index[-1] + step * (k + 1) for k in range(disp)])
        extended = index.append(future)
        frame = frame.reindex(extended)
        frame["ICHIMOKU_SENKOU_A"] = senkou_a.reindex(extended).shift(disp)
        frame["ICHIMOKU_SENKOU_B"] = senkou_b.reindex(extended).shift(disp)
    else:
        frame["ICHIMOKU_SENKOU_A"] = senkou_a.shift(disp)
        frame["ICHIMOKU_SENKOU_B"] = senkou_b.shift(disp)
    return frame


def frame_to_points(frame: pd.DataFrame) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for index, row in frame.iterrows():
        timestamp = index.isoformat() if hasattr(index, "isoformat") else str(index)
        points.append(
            {
                "time": timestamp,
                "open": _clean(row.get("Open")),
                "high": _clean(row.get("High")),
                "low": _clean(row.get("Low")),
                "close": _clean(row.get("Close")),
                "volume": _clean(row.get("Volume")),
                "sma5": _clean(row.get("SMA5")),
                "sma20": _clean(row.get("SMA20")),
                "sma50": _clean(row.get("SMA50")),
                "sma60": _clean(row.get("SMA60")),
                "sma120": _clean(row.get("SMA120")),
                "ema20": _clean(row.get("EMA20")),
                "bbUpper": _clean(row.get("BB_UPPER")),
                "bbLower": _clean(row.get("BB_LOWER")),
                "rsi14": _clean(row.get("RSI14")),
                "macd": _clean(row.get("MACD")),
                "macdSignal": _clean(row.get("MACD_SIGNAL")),
                "macdHist": _clean(row.get("MACD_HIST")),
                "stochK": _clean(row.get("STOCH_K")),
                "stochD": _clean(row.get("STOCH_D")),
                "atr14": _clean(row.get("ATR14")),
                "obv": _clean(row.get("OBV")),
                "vwap": _clean(row.get("VWAP")),
                "adx": _clean(row.get("ADX")),
                "plusDi": _clean(row.get("PLUS_DI")),
                "minusDi": _clean(row.get("MINUS_DI")),
                "psar": _clean(row.get("PSAR")),
                "pivot": _clean(row.get("PIVOT")),
                "pivotR1": _clean(row.get("PIVOT_R1")),
                "pivotS1": _clean(row.get("PIVOT_S1")),
                "pivotR2": _clean(row.get("PIVOT_R2")),
                "pivotS2": _clean(row.get("PIVOT_S2")),
                "ichimokuTenkan": _clean(row.get("ICHIMOKU_TENKAN")),
                "ichimokuKijun": _clean(row.get("ICHIMOKU_KIJUN")),
                "ichimokuSenkouA": _clean(row.get("ICHIMOKU_SENKOU_A")),
                "ichimokuSenkouB": _clean(row.get("ICHIMOKU_SENKOU_B")),
                "ichimokuChikou": _clean(row.get("ICHIMOKU_CHIKOU")),
            }
        )
    return points
