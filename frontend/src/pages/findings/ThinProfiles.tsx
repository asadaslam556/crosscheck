import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Tip } from "../../charts/charts";
import { Callout, Fact, Loaded, PageHead, Panel } from "../../components/ui";
import { useApi, type Schemas } from "../../lib/api";
import { dec, pct, signed } from "../../lib/format";
import { FindingPager } from ".";

export default function ThinProfiles() {
  const deciles = useApi<Schemas["Segments"]>("segments", { dimension: "completeness_decile" });
  const bands = useApi<Schemas["Segments"]>("segments", { dimension: "profile_band" });

  return (
    <>
      <PageHead eyebrow="Finding 2" title="The LLM scores candidates highest when it knows least about them">
        Below 40% profile completeness the LLM's scores jump by about twelve points, while those candidates are moved forward
        less often. Absent evidence reads as absence of problems.
      </PageHead>

      <Loaded results={[deciles, bands]} height={600}>
        {(decileData, bandData) => {
          const rows = decileData.segments.map((row) => ({
            decile: row.segment,
            label: `${row.segment}–${(Number(row.segment) + 0.1).toFixed(1)}`,
            mean: row.mean_llm_score,
            rate: row.positive_rate,
            band: row.positive_rate_ci,
            applications: row.applications,
          }));
          const thin = bandData.segments.find((s) => s.segment.startsWith("thin"))!;
          const rest = bandData.segments.filter((s) => s !== thin);
          const restMean = rest.reduce((s, r) => s + r.mean_llm_score * r.applications, 0) / rest.reduce((s, r) => s + r.applications, 0);
          const restRate = rest.reduce((s, r) => s + r.positives, 0) / rest.reduce((s, r) => s + r.decided, 0);
          const axis = { stroke: "var(--line-strong)", tickLine: false } as const;

          return (
            <div className="stack">
              <div className="facts">
                <Fact value={dec(thin.mean_llm_score, 1)} color="var(--llm)">
                  mean LLM score below 0.4 completeness, against {dec(restMean, 1)} above
                </Fact>
                <Fact value={pct(thin.positive_rate)}>moved forward below 0.4, against {pct(restRate)} above</Fact>
                <Fact value={dec(thin.llm_auc)} color="var(--llm)">
                  LLM AUC inside the thin group: it still ranks them well, on the wrong level
                </Fact>
              </div>

              <div className="grid-2">
                <Panel title="Mean LLM score by profile completeness" note="A cliff, not a slope: the step sits exactly at 0.4.">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="decile" {...axis} />
                      <YAxis domain={[50, 80]} ticks={[50, 60, 70, 80]} width={44} {...axis} />
                      <ReferenceLine x="0.4" stroke="var(--faint)" strokeDasharray="3 3" label={{ value: "0.4", position: "top", fill: "var(--muted)", fontSize: 11 }} />
                      <Tooltip content={<Tip format={(v) => v.toFixed(1)} labelFormat={(l) => `Completeness ${l}–${(Number(l) + 0.1).toFixed(1)}`} />} />
                      <Line type="linear" dataKey="mean" name="Mean LLM score" stroke="var(--llm)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--llm)" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel title="Share moved forward by profile completeness" note="The outcome goes the other way: thin profiles convert slightly worse. Shaded band is the 95% interval.">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="decile" {...axis} />
                      <YAxis domain={[0.3, 0.7]} ticks={[0.3, 0.4, 0.5, 0.6, 0.7]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} width={44} {...axis} />
                      <ReferenceLine x="0.4" stroke="var(--faint)" strokeDasharray="3 3" />
                      <Tooltip content={<Tip format={(v) => pct(v)} labelFormat={(l) => `Completeness ${l}–${(Number(l) + 0.1).toFixed(1)}`} />} />
                      <Area dataKey="band" name="95% interval" stroke="none" fill="var(--outcome)" fillOpacity={0.08} />
                      <Line type="linear" dataKey="rate" name="Moved forward" stroke="var(--outcome)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--outcome)" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Panel>
              </div>

              <Callout>
                This is a calibration failure, not a ranking failure. Inside the thin group the LLM orders candidates about as well as
                anywhere else, so a per-job ranking check would never see it. It only shows when one fixed threshold is applied across
                candidates, and the gap is {signed(thin.mean_llm_score - restMean)} points.
              </Callout>

              <Panel title="What to do">
                <div className="prose">
                  <p>
                    Pass profile completeness into the prompt and ask for a confidence band with the score. Hold back the "strong
                    candidate" flag when confidence is low, instead of letting an uncalibrated 75 trigger it.
                  </p>
                  <p>
                    This sprint, fit a per-band offset that maps the thin group back onto the same scale, and check that its calibration
                    curve lands on the curve for complete profiles. As a side effect, completing a profile starts to matter to candidates.
                  </p>
                </div>
              </Panel>
            </div>
          );
        }}
      </Loaded>
      <FindingPager path="/findings/thin-profiles" />
    </>
  );
}
