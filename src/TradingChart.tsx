import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts'
import { IchimokuCloud, type CloudPoint } from './ichimokuCloud'
import { DrawingsPrimitive, type Drawing, type DrawingPreview, type DrawPoint } from './chartDrawings'
import { heikinAshi, movingAverage, type Bar, type MaSpec } from './chartIndicators'

export type TradingChartPoint = {
  time: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  bbUpper: number | null
  bbLower: number | null
  rsi14: number | null
  macd: number | null
  macdSignal: number | null
  macdHist: number | null
  stochK: number | null
  stochD: number | null
  atr14: number | null
  obv: number | null
  vwap: number | null
  adx: number | null
  plusDi: number | null
  minusDi: number | null
  psar: number | null
  pivot: number | null
  pivotR1: number | null
  pivotS1: number | null
  pivotR2: number | null
  pivotS2: number | null
  ichimokuTenkan: number | null
  ichimokuKijun: number | null
  ichimokuSenkouA: number | null
  ichimokuSenkouB: number | null
  ichimokuChikou: number | null
}

type ChartType = 'candles' | 'heikin' | 'bars' | 'line' | 'area' | 'baseline'
type ScaleMode = 'normal' | 'log' | 'percent'
type Tool = 'none' | 'trendline' | 'hline' | 'fib'
type OscKind = 'rsi' | 'macd' | 'stoch' | 'adx' | 'atr' | 'obv'

const CHART_TYPES: Array<{ key: ChartType; label: string }> = [
  { key: 'candles', label: '캔들' },
  { key: 'heikin', label: '하이킨아시' },
  { key: 'bars', label: '바' },
  { key: 'line', label: '라인' },
  { key: 'area', label: '영역' },
  { key: 'baseline', label: '베이스라인' },
]

const SCALES: Array<{ key: ScaleMode; label: string }> = [
  { key: 'normal', label: '일반' },
  { key: 'log', label: '로그' },
  { key: 'percent', label: '%' },
]

const TOOLS: Array<{ key: Tool; label: string }> = [
  { key: 'trendline', label: '추세선' },
  { key: 'hline', label: '수평선' },
  { key: 'fib', label: '피보나치' },
]

const OVERLAY_LINES: Array<{
  id: string
  field: keyof TradingChartPoint
  color: string
  toggle: string
  dashed?: boolean
}> = [
  { id: 'bbUpper', field: 'bbUpper', color: '#5bb7ff', toggle: 'bb', dashed: true },
  { id: 'bbLower', field: 'bbLower', color: '#5bb7ff', toggle: 'bb', dashed: true },
  { id: 'tenkan', field: 'ichimokuTenkan', color: '#ff5d73', toggle: 'ichimoku' },
  { id: 'kijun', field: 'ichimokuKijun', color: '#5bb7ff', toggle: 'ichimoku' },
  { id: 'senkouA', field: 'ichimokuSenkouA', color: '#33d17a', toggle: 'ichimoku' },
  { id: 'senkouB', field: 'ichimokuSenkouB', color: '#ff5d73', toggle: 'ichimoku' },
  { id: 'chikou', field: 'ichimokuChikou', color: '#a777ff', toggle: 'ichimoku' },
  { id: 'vwap', field: 'vwap', color: '#f5b841', toggle: 'vwap' },
  { id: 'psar', field: 'psar', color: '#2ee6d6', toggle: 'psar' },
  { id: 'pivot', field: 'pivot', color: '#7f909a', toggle: 'pivots' },
  { id: 'pivotR1', field: 'pivotR1', color: '#ff5d73', toggle: 'pivots', dashed: true },
  { id: 'pivotS1', field: 'pivotS1', color: '#33d17a', toggle: 'pivots', dashed: true },
  { id: 'pivotR2', field: 'pivotR2', color: '#ff5d73', toggle: 'pivots', dashed: true },
  { id: 'pivotS2', field: 'pivotS2', color: '#33d17a', toggle: 'pivots', dashed: true },
]

const OVERLAY_TOGGLES: Array<{ key: string; label: string }> = [
  { key: 'volume', label: '거래량' },
  { key: 'bb', label: '볼린저' },
  { key: 'ichimoku', label: '일목구름표' },
  { key: 'vwap', label: 'VWAP' },
  { key: 'psar', label: 'PSAR' },
  { key: 'pivots', label: '피봇 S/R' },
]

const OSC_LIST: Array<{ key: OscKind; label: string }> = [
  { key: 'rsi', label: 'RSI' },
  { key: 'macd', label: 'MACD' },
  { key: 'stoch', label: '스토캐스틱' },
  { key: 'adx', label: 'ADX/DI' },
  { key: 'atr', label: 'ATR' },
  { key: 'obv', label: 'OBV' },
]

const MA_PALETTE = ['#f5b841', '#33d17a', '#5bb7ff', '#a777ff', '#2ee6d6', '#ff9f43']

const DEFAULT_MAS: MaSpec[] = [
  { id: 'ma-20', kind: 'sma', period: 20, color: MA_PALETTE[1] },
  { id: 'ma-60', kind: 'sma', period: 60, color: MA_PALETTE[3] },
]

const DEFAULT_OVERLAYS: Record<string, boolean> = {
  volume: true,
  ichimoku: true,
  cloud: true,
}

const LINE_BASE = {
  lineWidth: 1 as const,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
}

const toUnix = (iso: string): UTCTimestamp => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp

function lineData(points: TradingChartPoint[], field: keyof TradingChartPoint): LineData[] {
  const out: LineData[] = []
  let prev = -1
  for (const p of points) {
    const value = p[field]
    if (typeof value !== 'number') continue
    const time = toUnix(p.time)
    if ((time as number) <= prev) continue
    prev = time as number
    out.push({ time, value })
  }
  return out
}

function histData(points: TradingChartPoint[], field: keyof TradingChartPoint) {
  const out: Array<{ time: UTCTimestamp; value: number; color: string }> = []
  let prev = -1
  for (const p of points) {
    const value = p[field]
    if (typeof value !== 'number') continue
    const time = toUnix(p.time)
    if ((time as number) <= prev) continue
    prev = time as number
    out.push({ time, value, color: value >= 0 ? 'rgba(51,209,122,0.6)' : 'rgba(255,93,115,0.6)' })
  }
  return out
}

function buildCloudPoints(points: TradingChartPoint[]): CloudPoint[] {
  const out: CloudPoint[] = []
  let prev = -1
  for (const p of points) {
    if (p.ichimokuSenkouA == null || p.ichimokuSenkouB == null) continue
    const time = toUnix(p.time)
    if ((time as number) <= prev) continue
    prev = time as number
    out.push({ time, a: p.ichimokuSenkouA, b: p.ichimokuSenkouB })
  }
  return out
}

const SCALE_MODE: Record<ScaleMode, PriceScaleMode> = {
  normal: PriceScaleMode.Normal,
  log: PriceScaleMode.Logarithmic,
  percent: PriceScaleMode.Percentage,
}

export function TradingChart({ points }: { points: TradingChartPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const legendRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const overlayRefs = useRef<Record<string, ISeriesApi<'Line'>>>({})
  const maRefs = useRef<Record<string, ISeriesApi<'Line'>>>({})
  const oscRefs = useRef<ISeriesApi<SeriesType>[]>([])
  const cloudRef = useRef<IchimokuCloud | null>(null)
  const drawingsRef = useRef<DrawingsPrimitive | null>(null)
  const fitKeyRef = useRef('')
  const idRef = useRef(0)

  const [chartType, setChartType] = useState<ChartType>('candles')
  const [scale, setScale] = useState<ScaleMode>('normal')
  const [overlays, setOverlays] = useState<Record<string, boolean>>(DEFAULT_OVERLAYS)
  const [mas, setMas] = useState<MaSpec[]>(DEFAULT_MAS)
  const [oscs, setOscs] = useState<Record<OscKind, boolean>>({
    rsi: false,
    macd: false,
    stoch: false,
    adx: false,
    atr: false,
    obv: false,
  })
  const [tool, setTool] = useState<Tool>('none')
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [preview, setPreview] = useState<DrawingPreview>(null)

  const toolRef = useRef(tool)
  const pendingRef = useRef<DrawPoint | null>(null)
  useEffect(() => {
    toolRef.current = tool
  }, [tool])

  const bars = useMemo<Bar[]>(() => {
    const out: Bar[] = []
    let prev = -1
    for (const p of points) {
      if (p.open == null || p.high == null || p.low == null || p.close == null) continue
      const time = toUnix(p.time)
      if ((time as number) <= prev) continue
      prev = time as number
      out.push({ time, open: p.open, high: p.high, low: p.low, close: p.close, volume: p.volume ?? 0 })
    }
    return out
  }, [points])

  // create chart + stable series/primitives once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#7f909a',
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: '#24313a', separatorHoverColor: '#2f4350' },
      },
      grid: {
        vertLines: { color: 'rgba(36, 49, 58, 0.45)' },
        horzLines: { color: 'rgba(36, 49, 58, 0.45)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#24313a' },
      timeScale: { borderColor: '#24313a', timeVisible: false, rightOffset: 6 },
      localization: { locale: 'ko-KR' },
    })
    chartRef.current = chart

    const volume = chart.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' } }, 0)
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } })
    volumeRef.current = volume

    for (const desc of OVERLAY_LINES) {
      overlayRefs.current[desc.id] = chart.addSeries(
        LineSeries,
        {
          ...LINE_BASE,
          color: desc.color,
          lineStyle: desc.dashed || desc.id === 'psar' ? LineStyle.Dotted : LineStyle.Solid,
          visible: false,
        },
        0,
      )
    }

    cloudRef.current = new IchimokuCloud()
    drawingsRef.current = new DrawingsPrimitive()

    const onMove = (param: MouseEventParams) => {
      // live preview for 2-click drawings
      const pending = pendingRef.current
      const active = toolRef.current
      if (pending && (active === 'trendline' || active === 'fib') && param.point && mainSeriesRef.current) {
        const price = mainSeriesRef.current.coordinateToPrice(param.point.y)
        const time = param.time ?? chart.timeScale().coordinateToTime(param.point.x)
        if (price != null && time != null) {
          setPreview({ kind: active, a: pending, b: { time, price } })
        }
      }
      // OHLC legend
      const el = legendRef.current
      const series = mainSeriesRef.current
      if (!el || !series) return
      const data = param.seriesData.get(series) as
        | { open?: number; high?: number; low?: number; close?: number; value?: number }
        | undefined
      if (!data) {
        el.textContent = ''
        return
      }
      const span = (text: string, cls?: string) => {
        const s = document.createElement('span')
        s.textContent = text
        if (cls) s.className = cls
        return s
      }
      el.replaceChildren()
      if (data.close != null && data.open != null) {
        const up = data.close >= data.open
        el.append(
          span(`O ${data.open}`),
          span(`H ${data.high}`),
          span(`L ${data.low}`),
          span(`C ${data.close}`, up ? 'leg-up' : 'leg-down'),
        )
      } else if (data.value != null) {
        el.append(span(`${data.value}`))
      }
    }

    const onClick = (param: MouseEventParams) => {
      const active = toolRef.current
      if (active === 'none' || !param.point) return
      const series = mainSeriesRef.current
      if (!series) return
      const price = series.coordinateToPrice(param.point.y)
      const time = param.time ?? chart.timeScale().coordinateToTime(param.point.x)
      const abandon = () => {
        if (pendingRef.current) {
          pendingRef.current = null
          setPreview(null)
        }
      }
      if (price == null) {
        abandon()
        return
      }
      if (active === 'hline') {
        idRef.current += 1
        const id = `d${idRef.current}`
        setDrawings((prev) => [...prev, { id, kind: 'hline', price }])
        setTool('none')
        return
      }
      if (time == null) {
        abandon()
        return
      }
      const pending = pendingRef.current
      if (!pending) {
        pendingRef.current = { time, price }
        return
      }
      idRef.current += 1
      const id = `d${idRef.current}`
      setDrawings((prev) => [...prev, { id, kind: active, a: pending, b: { time, price } }])
      pendingRef.current = null
      setPreview(null)
      setTool('none')
    }

    chart.subscribeCrosshairMove(onMove)
    chart.subscribeClick(onClick)

    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      chart.unsubscribeClick(onClick)
      chart.remove()
      chartRef.current = null
      mainSeriesRef.current = null
      volumeRef.current = null
      overlayRefs.current = {}
      maRefs.current = {}
      oscRefs.current = []
      cloudRef.current = null
      drawingsRef.current = null
    }
  }, [])

  // (re)create the main price series when the chart type changes
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const candleColors = {
      upColor: '#33d17a',
      downColor: '#ff5d73',
      borderUpColor: '#33d17a',
      borderDownColor: '#ff5d73',
      wickUpColor: '#33d17a',
      wickDownColor: '#ff5d73',
    }
    let series: ISeriesApi<SeriesType>
    if (chartType === 'candles' || chartType === 'heikin') {
      series = chart.addSeries(CandlestickSeries, candleColors, 0)
    } else if (chartType === 'bars') {
      series = chart.addSeries(BarSeries, { upColor: '#33d17a', downColor: '#ff5d73' }, 0)
    } else if (chartType === 'line') {
      series = chart.addSeries(LineSeries, { color: '#5bb7ff', lineWidth: 2, priceLineVisible: false }, 0)
    } else if (chartType === 'area') {
      series = chart.addSeries(
        AreaSeries,
        { lineColor: '#5bb7ff', topColor: 'rgba(91,183,255,0.35)', bottomColor: 'rgba(91,183,255,0.02)', priceLineVisible: false },
        0,
      )
    } else {
      const baseValue = bars.length ? bars[0].close : 0
      series = chart.addSeries(
        BaselineSeries,
        {
          baseValue: { type: 'price', price: baseValue },
          topLineColor: '#33d17a',
          bottomLineColor: '#ff5d73',
          topFillColor1: 'rgba(51,209,122,0.25)',
          bottomFillColor1: 'rgba(255,93,115,0.25)',
          priceLineVisible: false,
        },
        0,
      )
    }
    mainSeriesRef.current = series
    // keep the price series painted under overlays/drawings
    if (cloudRef.current) series.attachPrimitive(cloudRef.current)
    if (drawingsRef.current) series.attachPrimitive(drawingsRef.current)
    series.priceScale().applyOptions({ mode: SCALE_MODE[scale] })

    return () => {
      // On unmount the chart may already be disposed (chart.remove ran first),
      // so removeSeries can throw "Value is undefined" — guard it.
      try {
        chart.removeSeries(series)
      } catch {
        // chart already removed
      }
      if (mainSeriesRef.current === series) mainSeriesRef.current = null
    }
    // scale handled in its own effect; only recreate on type change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType])

  // price scale mode
  useEffect(() => {
    mainSeriesRef.current?.priceScale().applyOptions({ mode: SCALE_MODE[scale] })
  }, [scale, chartType])

  // push price + overlay + volume + cloud data
  useEffect(() => {
    const chart = chartRef.current
    const series = mainSeriesRef.current
    if (!chart || !series || bars.length === 0) return

    if (chartType === 'line' || chartType === 'area' || chartType === 'baseline') {
      series.setData(bars.map((b) => ({ time: b.time, value: b.close })))
    } else if (chartType === 'heikin') {
      series.setData(heikinAshi(bars))
    } else {
      series.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })))
    }

    volumeRef.current?.setData(
      bars.map((b) => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(51,209,122,0.45)' : 'rgba(255,93,115,0.45)',
      })),
    )

    for (const desc of OVERLAY_LINES) {
      overlayRefs.current[desc.id]?.setData(lineData(points, desc.field))
    }
    cloudRef.current?.setData(overlays.cloud === false ? [] : buildCloudPoints(points))

    const rangeKey = `${bars[0]?.time}-${bars.at(-1)?.time}-${bars.length}-${chartType}`
    if (rangeKey !== fitKeyRef.current) {
      fitKeyRef.current = rangeKey
      chart.timeScale().fitContent()
    }
    // overlays.cloud seeded here; its own effect keeps it synced
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, bars, chartType])

  // moving-average overlays (client-side, user configurable)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const wanted = new Set(mas.map((m) => m.id))
    for (const [id, series] of Object.entries(maRefs.current)) {
      if (!wanted.has(id)) {
        chart.removeSeries(series)
        delete maRefs.current[id]
      }
    }
    for (const spec of mas) {
      let series = maRefs.current[spec.id]
      if (!series) {
        series = chart.addSeries(LineSeries, { ...LINE_BASE, color: spec.color }, 0)
        maRefs.current[spec.id] = series
      } else {
        series.applyOptions({ color: spec.color })
      }
      series.setData(movingAverage(bars, spec.period, spec.kind))
    }
  }, [mas, bars])

  // oscillator panes — rebuilt from the active set
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    for (const series of oscRefs.current) chart.removeSeries(series)
    oscRefs.current = []

    const active = OSC_LIST.filter((o) => oscs[o.key])
    let pane = 1
    for (const { key } of active) {
      const created: ISeriesApi<SeriesType>[] = []
      const addLine = (color: string, field: keyof TradingChartPoint) => {
        const s = chart.addSeries(LineSeries, { ...LINE_BASE, color }, pane)
        s.setData(lineData(points, field))
        created.push(s)
      }
      if (key === 'rsi') addLine('#5bb7ff', 'rsi14')
      else if (key === 'macd') {
        const h = chart.addSeries(HistogramSeries, { priceLineVisible: false }, pane)
        h.setData(histData(points, 'macdHist'))
        created.push(h)
        addLine('#5bb7ff', 'macd')
        addLine('#f5b841', 'macdSignal')
      } else if (key === 'stoch') {
        addLine('#33d17a', 'stochK')
        addLine('#ff5d73', 'stochD')
      } else if (key === 'adx') {
        addLine('#d7e2e8', 'adx')
        addLine('#33d17a', 'plusDi')
        addLine('#ff5d73', 'minusDi')
      } else if (key === 'atr') addLine('#f5b841', 'atr14')
      else if (key === 'obv') addLine('#a777ff', 'obv')
      oscRefs.current.push(...created)
      pane += 1
    }
    // remove any now-empty trailing panes, then size the oscillator panes
    try {
      const panes = chart.panes()
      for (let i = panes.length - 1; i >= 1 + active.length; i -= 1) chart.removePane(i)
      const sized = chart.panes()
      for (let i = 1; i <= active.length; i += 1) sized[i]?.setHeight(96)
    } catch {
      // ignore
    }
  }, [oscs, points])

  // overlay visibility
  useEffect(() => {
    volumeRef.current?.applyOptions({ visible: overlays.volume !== false })
    for (const desc of OVERLAY_LINES) {
      overlayRefs.current[desc.id]?.applyOptions({ visible: overlays[desc.toggle] === true })
    }
    cloudRef.current?.setData(overlays.cloud === false ? [] : buildCloudPoints(points))
  }, [overlays, points])

  // drawings → primitive
  useEffect(() => {
    drawingsRef.current?.setState(drawings, preview)
  }, [drawings, preview])

  const addMa = () => {
    const periods = mas.map((m) => m.period)
    const next = [20, 60, 120, 5, 50, 200].find((p) => !periods.includes(p)) ?? periods.length * 10 + 10
    const color = MA_PALETTE[mas.length % MA_PALETTE.length]
    setMas((prev) => [...prev, { id: `ma-${next}-${prev.length}`, kind: 'sma', period: next, color }])
  }

  const cycleMa = (id: string) => {
    const steps = [5, 10, 20, 50, 60, 120, 200]
    setMas((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m
        if (m.kind === 'sma') {
          const i = steps.indexOf(m.period)
          if (i >= 0 && i < steps.length - 1) return { ...m, period: steps[i + 1] }
          return { ...m, kind: 'ema' }
        }
        return { ...m, kind: 'sma', period: 5 }
      }),
    )
  }

  return (
    <div className="trading-chart">
      <div className="chart-controls">
        <div className="chart-row">
          <Pills items={CHART_TYPES} value={chartType} onPick={(k) => setChartType(k as ChartType)} />
          <span className="ctrl-sep" />
          <Pills items={SCALES} value={scale} onPick={(k) => setScale(k as ScaleMode)} />
        </div>
        <div className="chart-row">
          <span className="ctrl-label">그리기</span>
          {TOOLS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`chart-toggle ${tool === t.key ? 'on' : ''}`}
              onClick={() => {
                pendingRef.current = null
                setPreview(null)
                setTool((cur) => (cur === t.key ? 'none' : t.key))
              }}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            className="chart-toggle"
            onClick={() => {
              setDrawings([])
              setPreview(null)
              pendingRef.current = null
              setTool('none')
            }}
          >
            지우기 ({drawings.length})
          </button>
        </div>
        <div className="chart-row">
          <span className="ctrl-label">이평선</span>
          {mas.map((m) => (
            <span key={m.id} className="ma-chip" style={{ borderColor: m.color }}>
              <button type="button" onClick={() => cycleMa(m.id)} title="종류/기간 변경">
                {m.kind.toUpperCase()}
                {m.period}
              </button>
              <button type="button" className="ma-x" onClick={() => setMas((prev) => prev.filter((x) => x.id !== m.id))}>
                ×
              </button>
            </span>
          ))}
          <button type="button" className="chart-toggle" onClick={addMa}>
            + 추가
          </button>
        </div>
        <div className="chart-row">
          {OVERLAY_TOGGLES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`chart-toggle ${overlays[t.key] ? 'on' : ''}`}
              onClick={() => setOverlays((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
            >
              {t.label}
            </button>
          ))}
          {overlays.ichimoku ? (
            <button
              type="button"
              className={`chart-toggle ${overlays.cloud !== false ? 'on' : ''}`}
              onClick={() => setOverlays((prev) => ({ ...prev, cloud: prev.cloud === false }))}
            >
              구름
            </button>
          ) : null}
        </div>
        <div className="chart-row">
          <span className="ctrl-label">보조지표</span>
          {OSC_LIST.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`chart-toggle ${oscs[o.key] ? 'on' : ''}`}
              onClick={() => setOscs((prev) => ({ ...prev, [o.key]: !prev[o.key] }))}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-surface">
        <div ref={legendRef} className="chart-legend" />
        <div ref={containerRef} className={`chart-canvas ${tool !== 'none' ? 'drawing' : ''}`} />
        {bars.length < 2 ? <div className="chart-empty-overlay">차트 데이터 없음</div> : null}
      </div>
      <p className="chart-hint">
        휠 확대·축소 / 드래그 이동 / 더블클릭 리셋 · 그리기 도구 선택 후 차트 클릭(추세선·피보나치는 두 번)
      </p>
    </div>
  )
}

function Pills<T extends string>({
  items,
  value,
  onPick,
}: {
  items: Array<{ key: T; label: string }>
  value: T
  onPick: (key: T) => void
}) {
  return (
    <span className="pills">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`chart-toggle ${value === it.key ? 'on' : ''}`}
          onClick={() => onPick(it.key)}
        >
          {it.label}
        </button>
      ))}
    </span>
  )
}
