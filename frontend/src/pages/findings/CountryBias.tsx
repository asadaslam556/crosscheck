import { DotPlot, type DotRow } from "../../charts/charts";
import { Callout, Fact, Legend, Loaded, PageHead, Panel, Segmented } from "../../components/ui";
import { useApi, type Schemas } from "../../lib/api";
import { dec, pct, signed } from "../../lib/format";
import { setParam, useRoute } from "../../lib/router";
import { FindingPager } from ".";

type Control = "model_version" | "profile_band";

export default function CountryBias() {
  const { params } = useRoute();
  const control = (params.get("control") as Control) ?? "model_version";
  const overall = useApi<Schemas["Segments"]>("segments", { dimension: "country" });
  const strata = useApi<Schemas["Segments"]>("segments", { dimension: "country", by: control });

  return (
    <>
      <PageHead eyebrow="Finding 4" title="Austrian candidates get an LLM bonus their outcomes don't justify">
        Applications to Austrian jobs score about six points higher with the LLM than German ones. They are moved forward at almost the
        same rate. The rule scorer shows no such gap, and the LLM's gap survives every control.
      </PageHead>

      <Loaded results={[overall, strata]} height={560}>
        {(overallData, strataData) => {
          const at = overallData.segments.find((s) => s.segment === "AT")!;
          const de = overallData.segments.find((s) => s.segment === "DE")!;
          const groups = [...new Set(strataData.segments.map((s) => s.subsegment))];
          const cell = (country: string, group: string) =>
            strataData.segments.find((s) => s.segment === country && s.subsegment === group)!;

          const rows = (field: "mean_llm_score" | "mean_rule_score", color: string): DotRow[] => [
            {
              key: "all",
              label: "All applications",
              note: `moved forward: AT ${pct(at.positive_rate)}, DE ${pct(de.positive_rate)}`,
              points: [
                { series: "AT", value: at[field], color },
                { series: "DE", value: de[field], color, hollow: true },
              ],
            },
            ...groups.map((group) => {
              const a = cell("AT", group);
              const d = cell("DE", group);
              return {
                key: group,
                label: group,
                note: `moved forward: AT ${pct(a.positive_rate)}, DE ${pct(d.positive_rate)}`,
                points: [
                  { series: "AT", value: a[field], color },
                  { series: "DE", value: d[field], color, hollow: true },
                ],
              };
            }),
          ];

          return (
            <div className="stack">
              <div className="facts">
                <Fact value={signed(at.mean_llm_score - de.mean_llm_score)} color="var(--llm)">
                  LLM points for AT over DE ({dec(at.mean_llm_score, 1)} against {dec(de.mean_llm_score, 1)})
                </Fact>
                <Fact value={`${pct(at.positive_rate)} vs ${pct(de.positive_rate)}`}>moved forward, AT against DE</Fact>
                <Fact value={`${dec(at.llm_auc)} vs ${dec(de.llm_auc)}`} color="var(--llm)">
                  LLM AUC in AT against DE: the inflated band ranks worse
                </Fact>
              </div>

              <Panel
                title="Mean LLM score, AT against DE, inside each group"
                note="If the gap came from different candidates, it would shrink once you compare like with like. It doesn't."
                tools={
                  <Segmented
                    label="Hold constant"
                    value={control}
                    onChange={(value) => setParam("control", value)}
                    options={[
                      { value: "model_version", label: "Model version" },
                      { value: "profile_band", label: "Profile completeness" },
                    ]}
                  />
                }
                foot={<Legend items={[{ label: "Austria (AT)", color: "var(--llm)" }, { label: "Germany (DE), hollow", color: "var(--llm)" }]} />}
              >
                <DotPlot
                  title="Mean LLM score by country within each group"
                  rows={rows("mean_llm_score", "var(--llm)")}
                  domain={[55, 80]}
                  ticks={[55, 60, 65, 70, 75, 80]}
                  format={(v) => v.toFixed(1)}
                />
              </Panel>

              <Panel title="The rule scorer, for contrast" note="Same groups, same applicants. If anything, the rule scorer rates Austria slightly lower.">
                <DotPlot
                  title="Mean rule score by country within each group"
                  rows={rows("mean_rule_score", "var(--rule)")}
                  domain={[0.3, 0.7]}
                  ticks={[0.3, 0.4, 0.5, 0.6, 0.7]}
                  format={(v) => v.toFixed(2)}
                />
              </Panel>

              <Callout tone="warn">
                This is a recruiting platform under EU employment law. A score that favours one nationality without a matching difference
                in outcomes is a compliance exposure, not only an accuracy problem.
              </Callout>

              <Panel title="What to do">
                <div className="prose">
                  <p>
                    Add country to the standing evaluation set as a protected dimension, and gate releases on the outcome-adjusted score
                    gap staying inside a set tolerance.
                  </p>
                  <p>
                    Run an ablation with country-identifying details masked from the prompt, such as qualification and employer names, to
                    find how much of the gap is the signal itself. Until then, calibrate scores within each country.
                  </p>
                </div>
              </Panel>
            </div>
          );
        }}
      </Loaded>
      <FindingPager path="/findings/country-bias" />
    </>
  );
}
