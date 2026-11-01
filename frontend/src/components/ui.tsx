import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Info, RotateCw, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { IS_STATIC } from "../lib/api";
import { href } from "../lib/router";

export function Logo({ size = 28 }: { size?: number }) {
  // Two scorers overlapping; the check sits where they agree. Same colours as the charts.
  return (
    <svg width={size} height={size} viewBox="12 24 96 72" aria-hidden="true">
      <circle cx="48" cy="60" r="34" fill="var(--rule)" />
      <circle cx="72" cy="60" r="34" fill="var(--llm)" />
      <path d="M60 28.19 A34 34 0 0 1 60 91.81 A34 34 0 0 1 60 28.19 Z" fill="var(--ink)" />
      <path
        d="M47 61 L56 70 L73 50"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="page-head fade-in">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {children && <p className="lede">{children}</p>}
    </header>
  );
}

type PanelProps = { title: string; note?: ReactNode; tools?: ReactNode; foot?: ReactNode; children: ReactNode };

export function Panel({ title, note, tools, foot, children }: PanelProps) {
  return (
    <section className="panel fade-in">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        {tools && <div className="panel-tools">{tools}</div>}
      </div>
      {children}
      {foot && <div className="panel-foot">{foot}</div>}
    </section>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Fact({ value, children, color }: { value: ReactNode; children: ReactNode; color?: string }) {
  return (
    <div className="fact" style={color ? { borderLeftColor: color } : undefined}>
      <div className="num">{value}</div>
      <p>{children}</p>
    </div>
  );
}

type Option<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {children}
    </label>
  );
}

const STATUS_ICON = {
  pass: CheckCircle2,
  ok: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  note: Info,
  skipped: Info,
};

export function Status({ status, children }: { status: keyof typeof STATUS_ICON; children?: ReactNode }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="status" data-status={status}>
      <Icon size={13} aria-hidden="true" />
      {children ?? status.toUpperCase()}
    </span>
  );
}

export function Callout({ tone, children }: { tone?: "warn"; children: ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div className="callout" data-tone={tone}>
      <Icon size={17} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: "dot" | "line" | "dashed" }[] }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span key={item.label}>
          <i
            className={`swatch ${item.shape === "dot" || !item.shape ? "" : item.shape === "dashed" ? "line dashed" : "line"}`}
            style={{ background: item.color, borderColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function Skeleton({ height = 220 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-label="Loading" />;
}

export function ErrorState({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <h2>Could not load this view</h2>
      <p>
        {IS_STATIC
          ? `The snapshot file is missing (${error}).`
          : `The API answered with "${error}". If it isn't running, start everything with docker compose up.`}
      </p>
      <button type="button" className="icon-button" onClick={retry}>
        <RotateCw size={14} aria-hidden="true" /> Try again
      </button>
    </div>
  );
}

/** Renders children once every response has arrived, a skeleton before, an error card on failure. */
export function Loaded<T extends unknown[]>({
  results,
  height,
  children,
}: {
  results: { [K in keyof T]: { data?: T[K]; error?: string; retry: () => void } };
  height?: number;
  children: (...data: T) => ReactNode;
}) {
  const failed = results.find((result) => result.error);
  if (failed) return <ErrorState error={failed.error!} retry={failed.retry} />;
  if (results.some((result) => result.data === undefined)) return <Skeleton height={height} />;
  return <>{children(...(results.map((result) => result.data) as T))}</>;
}

export function Pager({ prev, next }: { prev?: { path: string; label: string }; next?: { path: string; label: string } }) {
  return (
    <nav className="pager" aria-label="Findings">
      {prev ? (
        <a href={href(prev.path)}>
          <ArrowLeft size={15} aria-hidden="true" /> {prev.label}
        </a>
      ) : (
        <span />
      )}
      {next && (
        <a href={href(next.path)}>
          {next.label} <ArrowRight size={15} aria-hidden="true" />
        </a>
      )}
    </nav>
  );
}
