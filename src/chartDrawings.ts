import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'

export type DrawPoint = { time: Time; price: number }

export type Drawing =
  | { id: string; kind: 'trendline'; a: DrawPoint; b: DrawPoint }
  | { id: string; kind: 'hline'; price: number }
  | { id: string; kind: 'fib'; a: DrawPoint; b: DrawPoint }

export type DrawingPreview =
  | { kind: 'trendline' | 'fib'; a: DrawPoint; b: DrawPoint }
  | null

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
const LINE_COLOR = '#e9c46a'
const HLINE_COLOR = '#5bb7ff'
const FIB_COLOR = 'rgba(167, 119, 255, 0.9)'

class DrawingsRenderer implements IPrimitivePaneRenderer {
  private readonly source: DrawingsPrimitive

  constructor(source: DrawingsPrimitive) {
    this.source = source
  }

  draw(target: CanvasRenderingTarget2D): void {
    const { chart, series } = this.source
    if (!chart || !series) return
    const ts = chart.timeScale()
    const xOf = (t: Time): number | null => ts.timeToCoordinate(t)
    const yOf = (p: number): number | null => series.priceToCoordinate(p)

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hr = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio
      const w = scope.bitmapSize.width
      ctx.save()
      ctx.lineWidth = Math.max(1, Math.round(1.4 * hr))
      ctx.font = `${Math.round(10 * vr)}px sans-serif`

      const segment = (a: DrawPoint, b: DrawPoint, color: string, dashed = false) => {
        const x1 = xOf(a.time)
        const x2 = xOf(b.time)
        const y1 = yOf(a.price)
        const y2 = yOf(b.price)
        if (x1 == null || x2 == null || y1 == null || y2 == null) return
        ctx.strokeStyle = color
        ctx.setLineDash(dashed ? [6 * hr, 4 * hr] : [])
        ctx.beginPath()
        ctx.moveTo(x1 * hr, y1 * vr)
        ctx.lineTo(x2 * hr, y2 * vr)
        ctx.stroke()
      }

      const hline = (price: number, color: string) => {
        const y = yOf(price)
        if (y == null) return
        ctx.strokeStyle = color
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(0, y * vr)
        ctx.lineTo(w, y * vr)
        ctx.stroke()
        ctx.fillStyle = color
        ctx.fillText(price.toFixed(2), 4 * hr, y * vr - 3 * vr)
      }

      const fib = (a: DrawPoint, b: DrawPoint) => {
        const x1 = xOf(a.time)
        const x2 = xOf(b.time)
        const hi = Math.max(a.price, b.price)
        const lo = Math.min(a.price, b.price)
        const left = x1 == null ? 0 : x1 * hr
        const right = x2 == null ? w : x2 * hr
        ctx.setLineDash([])
        for (const level of FIB_LEVELS) {
          const price = hi - level * (hi - lo)
          const y = yOf(price)
          if (y == null) continue
          ctx.strokeStyle = FIB_COLOR
          ctx.beginPath()
          ctx.moveTo(Math.min(left, right), y * vr)
          ctx.lineTo(Math.max(left, right), y * vr)
          ctx.stroke()
          ctx.fillStyle = FIB_COLOR
          ctx.fillText(`${(level * 100).toFixed(1)}%  ${price.toFixed(2)}`, Math.min(left, right) + 4 * hr, y * vr - 3 * vr)
        }
      }

      for (const d of this.source.drawings) {
        if (d.kind === 'trendline') segment(d.a, d.b, LINE_COLOR)
        else if (d.kind === 'hline') hline(d.price, HLINE_COLOR)
        else if (d.kind === 'fib') fib(d.a, d.b)
      }
      const preview = this.source.preview
      if (preview) {
        if (preview.kind === 'trendline') segment(preview.a, preview.b, LINE_COLOR, true)
        else fib(preview.a, preview.b)
      }
      ctx.restore()
    })
  }
}

class DrawingsPaneView implements IPrimitivePaneView {
  private readonly source: DrawingsPrimitive

  constructor(source: DrawingsPrimitive) {
    this.source = source
  }

  renderer(): IPrimitivePaneRenderer {
    return new DrawingsRenderer(this.source)
  }

  zOrder() {
    return 'top' as const
  }
}

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null
  series: ISeriesApi<SeriesType> | null = null
  drawings: Drawing[] = []
  preview: DrawingPreview = null
  private readonly paneView: DrawingsPaneView
  private requestUpdate?: () => void

  constructor() {
    this.paneView = new DrawingsPaneView(this)
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart
    this.series = param.series
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.chart = null
    this.series = null
    this.requestUpdate = undefined
  }

  setState(drawings: Drawing[], preview: DrawingPreview): void {
    this.drawings = drawings
    this.preview = preview
    this.requestUpdate?.()
  }

  updateAllViews(): void {}

  paneViews(): IPrimitivePaneView[] {
    return [this.paneView]
  }
}
