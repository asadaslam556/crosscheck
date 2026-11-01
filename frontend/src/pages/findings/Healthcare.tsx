import { DotPlot } from "../../charts/charts";
import { Callout, Fact, Legend, Loaded, PageHead, Panel, Toggle } from "../../components/ui";
import { useApi, type Schemas } from "../../lib/api";
import { dec, int, pct } from "../../lib/format";
import { setParam, useRoute } from "../../lib/router";
import { FindingPager } from ".";

const BUCKETS = [
  { key: "low", label: "Low", color: "var(--bad)" },
  { key: "medium", label: "Medium", color: "var(--line-strong)" },
  { key: "good", label: "Good", color: "var(--ok)" },
];

export default function Healthcare() {
  const { params } = useRoute();
  const fixed = params.get("fix") === "1";
  const families = useApi<Schemas["Segments"]>("segments", { dimension: "job_family" });
  const before = useApi<Schemas["Effectiveness"]>("effectiveness");
  const after = useApi<Schemas["Effectiveness"]>("effectiveness", { rescale_family: "Healthcare" });

  return (
    <>
      <PageHead eyebrow="Finding 1" title="The rule scorer is broken for Healthcare, and it flips the verdict">
        Every Healthcare application gets a rule score below the 0.5 cut-off, so all of them are labelled low fit. Their
        candidates convert like everyone else's. The scale is wrong, not the people.
      </PageHead>

      <Loaded results={[families, before, after]} height={600}>
        {(familyData, beforeData, afterData) => {
          const rows = familyData.segments;
          const healthcare = rows.find((row) => row.segment === "Healthcare")!;
          const others = rows.filter((row) => row !== healthcare);
          const othersRule = others.reduce((s, r) => s + r.mean_rule_score * r.applications, 0) / others.reduce((s, r) => s + r.applications, 0);
          const othersPositive = others.reduce((s, r) => s + r.positives, 0) / others.reduce((s, r) => s + r.decided, 0);
          const shown = fixed ? afterData : beforeData;
          const effect = afterData.rescale_effect!;

          return (
            <div className="stack">
              <div className="facts">
                <Fact value={dec(healthcare.mean_rule_score)} color="var(--bad)">
                  mean Healthcare rule score, against {dec(othersRule)} everywhere else
                </Fact>
                <Fact value={pct(healthcare.low_fit_rate, 0)} color="var(--bad)">
                  of {int(healthcare.applications)} Healthcare applications bucketed low
                </Fact>
                <Fact value={pct(healthcare.positive_rate)}>
                  moved forward, against {pct(othersPositive)} in the other families
                </Fact>
                <Fact value={dec(healthcare.rule_auc)} color="var(--rule)">
                  rule AUC inside Healthcare: the order survives, only the scale is wrong
                </Fact>
              </div>

              <Panel
                title="Rule-fit label by job family"
                note="The product shows recruiters this label. In Healthcare it carries no information at all."
                foot={<Legend items={BUCKETS.map((b) => ({ label: b.label, color: b.color }))} />}
              >
                <div className="stack" style={{ gap: 10 }}>
                  {rows.map((row) => {
                    const shares = { low: row.low_fit_rate, good: row.good_fit_rate, medium: 1 - row.low_fit_rate - row.good_fit_rate };
                    return (
                      <div key={row.segment} style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: 12 }}>
                        <span style={{ fontWeight: row === healthcare ? 600 : 400 }}>{row.segment}</span>
                        <div style={{ display: "flex", height: 22, borderRadius: 5, overflow: "hidden" }} aria-label={`${row.segment}: ${pct(shares.low, 0)} low, ${pct(shares.medium, 0)} medium, ${pct(shares.good, 0)} good`}>
                          {BUCKETS.map((bucket) => {
                            const share = shares[bucket.key as keyof typeof shares];
                            return share > 0.005 ? (
                              <div key={bucket.key} title={`${bucket.label}: ${pct(share)}`} style={{ width: `${share * 100}%`, background: bucket.color, color: bucket.key === "medium" ? "var(--ink)" : "#fff", fontSize: 11.5, fontWeight: 600, display: "grid", placeItems: "center" }}>
                                {share > 0.08 ? pct(share, 0) : ""}
                              </div>
                            ) : null;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel
                title="What the proposed fix would do"
                note={`Scaling Healthcare's rule scores by the ratio of the means (${dec(afterData.rescale_factor, 2)}) is a simulation of the normalisation fix, not the fix itself.`}
                tools={
                  <Toggle checked={fixed} onChange={(on) => setParam("fix", on ? "1" : null)}>
                    Apply the rescale
                  </Toggle>
                }
                foot={<Legend items={[{ label: "Rule scorer", color: "var(--rule)" }, { label: "LLM scorer", color: "var(--llm)" }]} />}
              >
                <DotPlot
                  title="Pooled AUC before and after the simulated fix"
                  rows={[
                    {
                      key: "pooled",
                      label: fixed ? "All families, fixed" : "All families, as shipped",
                      points: [
                        { series: "Rule scorer", value: shown.rule.auc, ci: shown.rule.auc_ci, color: "var(--rule)" },
                        { series: "LLM scorer", value: shown.llm.auc, ci: shown.llm.auc_ci, color: "var(--llm)" },
                      ],
                    },
                  ]}
                  domain={[0.65, 0.8]}
                  ticks={[0.65, 0.7, 0.75, 0.8]}
                  format={(v) => v.toFixed(2)}
                />
                <Callout>
                  {fixed ? (
                    <>
                      The rule scorer's pooled AUC rises from <strong>{dec(beforeData.rule.auc)}</strong> to <strong>{dec(afterData.rule.auc)}</strong>,
                      clear of the LLM's {dec(afterData.llm.auc)}. {int(effect.moved_out_of_low)} of {int(effect.decided)} decided Healthcare
                      applications leave the low bucket, and they convert at {pct(effect.moved_positive_rate)}.
                    </>
                  ) : (
                    <>
                      As shipped, the pooled number says the LLM ranks better ({dec(beforeData.llm.auc)} against {dec(beforeData.rule.auc)}).
                      Turn the rescale on to see where that comes from.
                    </>
                  )}
                </Callout>
              </Panel>

              <Panel title="Predictive power inside each family" note="The rule scorer wins in four families and ties in Healthcare. The pooled figure says the opposite of every segment inside it: Simpson's paradox.">
                <DotPlot
                  title="Rule and LLM AUC per job family"
                  rows={rows.map((row) => ({
                    key: row.segment,
                    label: row.segment,
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

              <Panel title="What to do">
                <div className="prose">
                  <p>
                    Fix the normalisation in the Healthcare rule set. A ratio of about four between the family means points at a
                    step dividing by a requirement count the Healthcare rules don't share.
                  </p>
                  <p>
                    Then add a release check that fails when any family has zero applications in a bucket, or a mean more than two
                    standard deviations from the rest. Until the fix ships, hide the low-fit badge for Healthcare instead of
                    showing 1,363 applications a label that means nothing.
                  </p>
                </div>
              </Panel>
            </div>
          );
        }}
      </Loaded>
      <FindingPager path="/findings/healthcare" />
    </>
  );
}
