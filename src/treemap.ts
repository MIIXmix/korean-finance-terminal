export type Sized<T> = { item: T; value: number }
export type Rect<T> = { item: T; x: number; y: number; w: number; h: number }

type Free = { x: number; y: number; w: number; h: number }
type Cell<T> = { item: T; area: number }

function worst<T>(row: Cell<T>[], side: number): number {
  if (!row.length) return Infinity
  let sum = 0
  let max = -Infinity
  let min = Infinity
  for (const cell of row) {
    sum += cell.area
    if (cell.area > max) max = cell.area
    if (cell.area < min) min = cell.area
  }
  const s2 = sum * sum
  const side2 = side * side
  return Math.max((side2 * max) / s2, s2 / (side2 * min))
}

/** Squarified treemap layout (Bruls, Huizing, van Wijk). */
export function squarify<T>(data: Sized<T>[], x: number, y: number, w: number, h: number): Rect<T>[] {
  const out: Rect<T>[] = []
  if (w <= 0 || h <= 0) return out
  const items = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  if (!items.length) return out
  const total = items.reduce((sum, d) => sum + d.value, 0)
  const scale = (w * h) / total
  const cells: Cell<T>[] = items.map((d) => ({ item: d.item, area: d.value * scale }))

  let free: Free = { x, y, w, h }

  const layoutRow = (row: Cell<T>[], side: number, area: Free): Free => {
    const sum = row.reduce((acc, cell) => acc + cell.area, 0)
    if (area.w >= area.h) {
      const colW = sum / side
      let cy = area.y
      for (const cell of row) {
        const rh = cell.area / colW
        out.push({ item: cell.item, x: area.x, y: cy, w: colW, h: rh })
        cy += rh
      }
      return { x: area.x + colW, y: area.y, w: area.w - colW, h: area.h }
    }
    const rowH = sum / side
    let cx = area.x
    for (const cell of row) {
      const rw = cell.area / rowH
      out.push({ item: cell.item, x: cx, y: area.y, w: rw, h: rowH })
      cx += rw
    }
    return { x: area.x, y: area.y + rowH, w: area.w, h: area.h - rowH }
  }

  let row: Cell<T>[] = []
  for (const cell of cells) {
    const side = Math.min(free.w, free.h)
    if (row.length === 0 || worst([...row, cell], side) <= worst(row, side)) {
      row.push(cell)
    } else {
      free = layoutRow(row, Math.min(free.w, free.h), free)
      row = [cell]
    }
  }
  if (row.length) layoutRow(row, Math.min(free.w, free.h), free)
  return out
}
