import type { ReactNode } from "react";

// Small SVG charts the dashboard needs and Recharts does not do well: dot plots with intervals,
// diverging bars and a heatmap. Each draws in a fixed viewBox and scales to its container.

export type Point = {
  series: string;
  value: number | null | undefined;
  ci?: number[] | null;
  color: string;
  hollow?: boolean;
};

export type DotRow = { key: string; label: string; points: Point[]; muted?: boolean; note?: string };

type DotPlotProps = {
  rows: DotRow[];
  domain: [number, number];
  ticks: number[];
  format: (value: number) => string;
  reference?: { value: number; label: string };
  active?: string;
  onSelect?: (key: string) => void;
  title: string;
};

const WIDTH = 760;
const LABEL = 190;
const RIGHT = 56;
const ROW = 44;
const TOP = 26;

/** Rows of dots with whiskers, one dot per series. Dots, not bars, because the axis is cut. */
export function DotPlot({ rows, domain, ticks, format, reference, active, onSelect, title }: DotPlotProps) {
  const height = TOP + rows.length * ROW + 8;
  const x = (value: number) =>
    LABEL + ((value - domain[0]) / (domain[1] - domain[0])) * (WIDTH - LABEL - RIGHT);

  return (
    <svg className="chart" width="100%" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={title}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="grid" x1={x(tick)} x2={x(tick)} y1={TOP - 6} y2={height - 6} />
          <text x={x(tick)} y={TOP - 12} textAnchor="middle">
            {format(tick)}
          </text>
        </g>
      ))}
      {reference && (
        <g>
          <line className="ref" x1={x(reference.value)} x2={x(reference.value)} y1={TOP - 6} y2={height - 6} />
        </g>
      )}
      {rows.map((row, index) => {
        const y = TOP + index * ROW + ROW / 2;
        const isActive = row.key === active;
        return (
          <g
            key={row.key}
            onClick={onSelect ? () => onSelect(row.key) : undefined}
            style={{ cursor: onSelect ? "pointer" : undefined, opacity: row.muted ? 0.45 : 1 }}
          >
            <rect
              className={isActive ? "row-active" : "row-hit"}
              x={0}
              y={y - ROW / 2 + 2}
              width={WIDTH}
              height={ROW - 4}
              rx={6}
            />
            <text className="label" x={10} y={y + 4} style={{ fontWeight: isActive ? 600 : 400 }}>
              {row.label}
            </text>
            {row.note && (
              <text x={10} y={y + 18} style={{ fontSize: 11 }}>
                {row.note}
              </text>
            )}
            {row.points.map((point, i) => {
              if (point.value == null) return null;
              const offset = (i - (row.points.length - 1) / 2) * 7;
              return (
                <g key={point.series}>
                  {point.ci && (
                    <line
                      x1={x(point.ci[0])}
                      x2={x(point.ci[1])}
                      y1={y + offset}
                      y2={y + offset}
                      stroke={point.color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      opacity={0.55}
                    />
                  )}
                  <circle
                    cx={x(point.value)}
                    cy={y + offset}
                    r={6}
                    fill={point.hollow ? "var(--surface)" : point.color}
                    stroke={point.color}
                    strokeWidth={2}
                  >
                    <title>
                      {point.series}: {format(point.value)}
                      {point.ci ? ` (95% CI ${format(point.ci[0])} to ${format(point.ci[1])})` : ""}
                    </title>
                  </circle>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export type Bar = { key: string; label: string; value: number; color?: string; note?: ReactNode };

/** Horizontal bars from zero, with the value at the end of each bar. */
export function Bars({ bars, max, format, title }: { bars: Bar[]; max: number; format: (v: number) => string; title: string }) {
  const height = bars.length * 38 + 6;
  const x = (value: number) => (value / max) * (WIDTH - LABEL - 120);
  return (
    <svg className="chart" width="100%" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={title}>
      {bars.map((bar, index) => {
        const y = index * 38 + 6;
        return (
          <g key={bar.key}>
            <text className="label" x={0} y={y + 17}>
              {bar.label}
            </text>
            <rect className="bar" x={LABEL} y={y + 4} width={Math.max(x(bar.value), 2)} height={20} rx={4} fill={bar.color ?? "var(--ink-2)"} />
            <text className="value" x={LABEL + x(bar.value) + 8} y={y + 18} style={{ fill: "var(--ink)" }}>
              {format(bar.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type Deviation = { key: string; label: string; left: number | null; right: number | null; muted?: boolean };

/**
 * Two measures in different units, each as the distance from the platform average, side by side.
 * Replaces a dual-axis chart: a segment where the left bar moves and the right one does not is a
 * scoring bias rather than a difference in candidates.
 */
export function DeviationChart({
  rows,
  left,
  right,
}: {
  rows: Deviation[];
  left: { title: string; limit: number; format: (v: number) => string; color: string };
  right: { title: string; limit: number; format: (v: number) => string; color: string };
}) {
  const panel = (WIDTH - LABEL - 20) / 2;
  const height = 30 + rows.length * 34;
  const bar = (value: number | null, limit: number, origin: number, color: string, y: number, format: (v: number) => string) => {
    if (value == null) return null;
    const half = panel / 2 - 34;
    const length = (Math.max(-limit, Math.min(limit, value)) / limit) * half;
    const centre = origin + panel / 2;
    return (
      <g>
        <rect className="bar" x={Math.min(centre, centre + length)} y={y - 9} width={Math.max(Math.abs(length), 1.5)} height={18} rx={3} fill={color} />
        <text className="value" x={centre + length + (length >= 0 ? 6 : -6)} y={y + 4} textAnchor={length >= 0 ? "start" : "end"} style={{ fill: "var(--ink)" }}>
          {format(value)}
        </text>
      </g>
    );
  };

  return (
    <svg className="chart" width="100%" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={`${left.title} and ${right.title}`}>
      {[left, right].map((side, i) => {
        const origin = LABEL + i * (panel + 20);
        return (
          <g key={side.title}>
            <text x={origin + panel / 2} y={14} textAnchor="middle" style={{ fontWeight: 600 }}>
              {side.title}
            </text>
            <line className="ref" x1={origin + panel / 2} x2={origin + panel / 2} y1={22} y2={height - 4} />
          </g>
        );
      })}
      {rows.map((row, index) => {
        const y = 30 + index * 34 + 14;
        return (
          <g key={row.key} style={{ opacity: row.muted ? 0.45 : 1 }}>
            <text className="label" x={0} y={y + 4}>
              {row.label}
            </text>
            {bar(row.left, left.limit, LABEL, left.color, y, left.format)}
            {bar(row.right, right.limit, LABEL + panel + 20, right.color, y, right.format)}
          </g>
        );
      })}
    </svg>
  );
}

/** A grid of cells shaded by a 0–1 value, with the value and a count printed in each. */
export function Heatmap({
  rows,
  columns,
  cell,
  rowTitle,
  columnTitle,
}: {
  rows: string[];
  columns: string[];
  cell: (row: string, column: string) => { value: number | null; count: number } | undefined;
  rowTitle: string;
  columnTitle: string;
}) {
  return (
    <div className="table-wrap">
      <table className="heatmap">
        <caption className="visually-hidden">
          Positive rate by {rowTitle} and {columnTitle}
        </caption>
        <thead>
          <tr>
            <th>
              {rowTitle} \ {columnTitle}
            </th>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <td>{row}</td>
              {columns.map((column) => {
                const entry = cell(row, column);
                const value = entry?.value ?? null;
                return (
                  <td
                    key={column}
                    style={{
                      background:
                        value == null
                          ? undefined
                          : `color-mix(in srgb, var(--ok) ${Math.round(value * 70)}%, var(--surface))`,
                      color: value != null && value > 0.62 ? "var(--surface)" : undefined,
                    }}
                  >
                    {value == null ? "–" : `${Math.round(value * 100)}%`}
                    <span className="dim" style={{ display: "block", fontSize: 11, color: "inherit", opacity: 0.75 }}>
                      {entry ? `n=${entry.count}` : ""}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tooltip body shared by the Recharts charts, so they all look the same. */
export function Tip({
  active,
  label,
  payload,
  format,
  labelFormat,
}: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string; color?: string }[];
  format: (value: number) => string;
  labelFormat?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <strong>{labelFormat ? labelFormat(String(label)) : label}</strong>
      {payload.map((entry) => (
        <div key={entry.name}>
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="num">{typeof entry.value === "number" ? format(entry.value) : "–"}</span>
        </div>
      ))}
    </div>
  );
}
