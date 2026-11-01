import { useState } from "react";

import { DeviationChart, DotPlot } from "../charts/charts";
import { Legend, Loaded, PageHead, Panel, Segmented } from "../components/ui";
import { useApi, type Schemas } from "../lib/api";
import { dec, int, interval, pct, pp, signed } from "../lib/format";
import { setParam, useRoute } from "../lib/router";

const DIMENSIONS = [
  { value: "job_family", label: "Job family" },
  { value: "profile_band", label: "Profile completeness" },
  { value: "country", label: "Country" },
  { value: "model_version", label: "Model version" },
  { value: "seniority", label: "Seniority" },
];

type Segment = Schemas["Segment"];
type SortKey = "segment" | "applications" | "positive_rate" | "mean_llm_score" | "low_fit_rate" | "rule_auc" | "llm_auc";

const COLUMNS: { key: SortKey; label: string; format: (s: Segment) => string }[] = [
  { key: "applications", label: "Applications", format: (s) => int(s.applications) },
  { key: "positive_rate", label: "Moved forward", format: (s) => pct(s.positive_rate) },
  { key: "mean_llm_score", label: "Mean LLM", format: (s) => dec(s.mean_llm_score, 1) },
  { key: "low_fit_rate", label: "Labelled low", format: (s) => pct(s.low_fit_rate) },
  { key: "rule_auc", label: "Rule AUC", format: (s) => dec(s.rule_auc) },
  { key: "llm_auc", label: "LLM AUC", format: (s) => dec(s.llm_auc) },
];

// A family whose applications are all bucketed low cannot be a property of its candidates.
const ALL_LOW = 0.999;

export default function Segments() {
  const { params } = useRoute();
  const dimension = params.get("dimension") ?? "job_family";
  const result = useApi<Schemas["Segments"]>("segments", { dimension });
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "segment", desc: false });

  return (
    <>
      <PageHead eyebrow="Explore" title="Segments">
        Break both scorers down by any dimension. A scorer that works everywhere looks flat here; a dip singles out where it fails.
      </PageHead>

      <div style={{ marginBottom: 18 }}>
        <Segmented label="Break down by" value={dimension} onChange={(value) => setParam("dimension", value)} options={DIMENSIONS} />
      </div>

      <Loaded results={[result]} height={600}>
        {(data) => {
          const rows = data.segments;
          const total = rows.reduce((s, r) => s + r.applications, 0);
          const meanLlm = rows.reduce((s, r) => s + r.mean_llm_score * r.applications, 0) / total;
          const meanRate = rows.reduce((s, r) => s + r.positives, 0) / rows.reduce((s, r) => s + r.decided, 0);
          const sorted = [...rows].sort((a, b) => {
            const x = a[sort.key] ?? -1;
            const y = b[sort.key] ?? -1;
            return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1);
          });
          const sortBy = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "segment" }));

          return (
            <div className="stack">
              <Panel
                title="Predictive power per segment"
                note="AUC of each scorer inside each segment, with 95% DeLong intervals. Faded rows have fewer than 30 decided applications."
                foot={<Legend items={[{ label: "Rule scorer", color: "var(--rule)" }, { label: "LLM scorer", color: "var(--llm)" }]} />}
              >
                <DotPlot
                  title={`Rule and LLM AUC by ${dimension}`}
                  rows={rows.map((row) => ({
                    key: row.segment,
                    label: row.segment,
                    muted: row.is_small_sample,
                    points: [
                      { series: "Rule scorer", value: row.rule_auc, ci: row.rule_auc_ci, color: "var(--rule)" },
                      { series: "LLM scorer", value: row.llm_auc, ci: row.llm_auc_ci, color: "var(--llm)" },
                    ],
                  }))}
                  domain={[0.6, 0.85]}
                  ticks={[0.6, 0.65, 0.7, 0.75, 0.8, 0.85]}
                  format={(v) => v.toFixed(2)}
                />
              </Panel>

              <Panel
                title="Does the score move with the outcome?"
                note="Each segment's distance from the platform average. When the LLM score moves and the outcome doesn't, that's a scoring bias, not a difference in candidates."
              >
                <DeviationChart
                  rows={rows.map((row) => ({
                    key: row.segment,
                    label: row.segment,
                    left: row.mean_llm_score - meanLlm,
                    right: row.positive_rate == null ? null : row.positive_rate - meanRate,
                    muted: row.is_small_sample,
                  }))}
                  left={{ title: "Mean LLM score vs average", limit: 12, format: (v) => signed(v), color: "var(--llm)" }}
                  right={{ title: "Moved forward vs average", limit: 0.08, format: (v) => pp(v), color: "var(--outcome)" }}
                />
              </Panel>

              <Panel title="Segment detail" foot="Click a column to sort. The interval is the 95% Wilson interval for the share moved forward.">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th aria-sort={sort.key === "segment" ? (sort.desc ? "descending" : "ascending") : undefined}>
                          <button type="button" onClick={() => sortBy("segment")}>Segment</button>
                        </th>
                        {COLUMNS.map((column) => (
                          <th key={column.key} aria-sort={sort.key === column.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                            <button type="button" onClick={() => sortBy(column.key)}>{column.label}</button>
                          </th>
                        ))}
                        <th>95% interval</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((row) => (
                        <tr key={row.segment}>
                          <td>
                            {row.segment}
                            {row.is_small_sample && <span className="dim"> (small)</span>}
                          </td>
                          {COLUMNS.map((column) => (
                            <td key={column.key} className={column.key === "low_fit_rate" && row.low_fit_rate >= ALL_LOW ? "flag" : undefined}>
                              {column.format(row)}
                            </td>
                          ))}
                          <td className="dim">{interval(row.positive_rate_ci, (v) => pct(v))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}
