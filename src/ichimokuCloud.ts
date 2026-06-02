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

export type CloudPoint = { time: Time; a: number | null; b: number | null }

type Projected = { x: number; ay: number; by: number; up: boolean }

const GREEN = 'rgba(38, 166, 154, 0.20)'
const RED = 'rgba(239, 83, 80, 0.20)'

class CloudRenderer implements IPrimitivePaneRenderer {
  private readonly source: IchimokuCloud

  constructor(source: IchimokuCloud) {
    this.source = source
  }

  draw(target: CanvasRenderingTarget2D): void {
    const { chart, series, data } = this.source
    if (!chart || !series || data.length < 2) return
    const timeScale = chart.timeScale()
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hr = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio
      const pts: Array<Projected | null> = data.map((d) => {
        if (d.a == null || d.b == null) return null
        const x = timeScale.timeToCoordinate(d.time)
        const ay = series.priceToCoordinate(d.a)
        const by = series.priceToCoordinate(d.b)
        if (x == null || ay == null || by == null) return null
        return { x: x * hr, ay: ay * vr, by: by * vr, up: d.a >= d.b }
      })
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p0 = pts[i]
        const p1 = pts[i + 1]
        if (!p0 || !p1) continue
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.ay)
        ctx.lineTo(p1.x, p1.ay)
        ctx.lineTo(p1.x, p1.by)
        ctx.lineTo(p0.x, p0.by)
        ctx.closePath()
        ctx.fillStyle = p0.up ? GREEN : RED
        ctx.fill()
      }
    })
  }
}

class CloudPaneView implements IPrimitivePaneView {
  private readonly source: IchimokuCloud

  constructor(source: IchimokuCloud) {
    this.source = source
  }

  renderer(): IPrimitivePaneRenderer {
    return new CloudRenderer(this.source)
  }

  zOrder() {
    return 'bottom' as const
  }
}

export class IchimokuCloud implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null
  series: ISeriesApi<SeriesType> | null = null
  data: CloudPoint[] = []
  private readonly paneView: CloudPaneView
  private requestUpdate?: () => void

  constructor() {
    this.paneView = new CloudPaneView(this)
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

  setData(data: CloudPoint[]): void {
    this.data = data
    this.requestUpdate?.()
  }

  updateAllViews(): void {}

  paneViews(): IPrimitivePaneView[] {
    return [this.paneView]
  }
}
