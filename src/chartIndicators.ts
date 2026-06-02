import type { CandlestickData, LineData, UTCTimestamp } from 'lightweight-charts'

export type Bar = {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type MaKind = 'sma' | 'ema'

export type MaSpec = { id: string; kind: MaKind; period: number; color: string }

export function movingAverage(bars: Bar[], period: number, kind: MaKind): LineData[] {
  if (period < 1 || bars.length === 0) return []
  const out: LineData[] = []
  if (kind === 'sma') {
    let sum = 0
    for (let i = 0; i < bars.length; i += 1) {
      sum += bars[i].close
      if (i >= period) sum -= bars[i - period].close
      if (i >= period - 1) out.push({ time: bars[i].time, value: sum / period })
    }
    return out
  }
  const k = 2 / (period + 1)
  let ema = bars[0].close
  for (let i = 0; i < bars.length; i += 1) {
    ema = i === 0 ? bars[i].close : bars[i].close * k + ema * (1 - k)
    if (i >= period - 1) out.push({ time: bars[i].time, value: ema })
  }
  return out
}

export function heikinAshi(bars: Bar[]): CandlestickData[] {
  const out: CandlestickData[] = []
  let prevOpen = 0
  let prevClose = 0
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i]
    const haClose = (b.open + b.high + b.low + b.close) / 4
    const haOpen = i === 0 ? (b.open + b.close) / 2 : (prevOpen + prevClose) / 2
    const haHigh = Math.max(b.high, haOpen, haClose)
    const haLow = Math.min(b.low, haOpen, haClose)
    out.push({ time: b.time, open: haOpen, high: haHigh, low: haLow, close: haClose })
    prevOpen = haOpen
    prevClose = haClose
  }
  return out
}
