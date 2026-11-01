import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

import { Bars, DotPlot, Tip } from "../charts/charts";
import { Callout, Fact, Legend, Loaded, PageHead, Panel } from "../components/ui";
import { useApi, type Schemas } from "../lib/api";
import { dec, int, pct, pValue } from "../lib/format";

const axis = { stroke: "var(--line-strong)", tickLine: false } as const;

export default function ThirdOpinion() {
  const result = useApi<Schemas["ThirdOpinion"]>("third-opinion");

  return (
    <>
      <PageHead eyebrow="Explore" title="A third opinion from Jev">
        Jev is TypeSafe AI's decision model. It read the job and candidate facts of every decided application and gave a probability that
        the recruiter would move the candidate forward. It never saw the two scores or the outcome, so it can be graded with the same
        yardstick as the production scorers.
      </PageHead>

      <Loaded results={[result]} height={500}>
        {(data) => {
          if (!data.available) {
            return (
              <Callout>
                Jev hasn't been run against this dataset yet. Add <code>TYPESAFE_API_KEY</code> to <code>.env</code>, run{" "}
                <code>python -m scripts.score_with_jev</code> from <code>backend/</code>, then reload the data.
              </Callout>
            );
          }
          const scorers = [
            { key: "rule", label: "Rule scorer", color: "var(--rule)", auc: data.rule! },
            { key: "llm", label: "LLM scorer", color: "var(--llm)", auc: data.llm! },
            { key: "jev", label: "Jev", color: "var(--jev)", auc: data.jev! },
          ];
          const tiebreak = data.tiebreak!;
          const calibration = data.calibration!.filter((band) => band.decided >= 30);

          return (
            <div className="stack">
              <div className="facts">
                <Fact value={dec(data.jev!.auc)} color="var(--jev)">
                  Jev AUC on {int(data.decided)} decided applications ({data.model})
                </Fact>
                <Fact value={pct(tiebreak.follow_jev)} color="var(--jev)">
                  right when breaking the {int(tiebreak.cases)} disagreements, against {pct(tiebreak.follow_rule)} for the rule scorer
                </Fact>
              </div>

              <Panel
                title="Ranking quality, same rows for all three"
                note={`Jev against the rule scorer: ${dec(data.jev_vs_rule?.difference)} (${pValue(data.jev_vs_rule?.p_value)}). Against the LLM: ${dec(data.jev_vs_llm?.difference)} (${pValue(data.jev_vs_llm?.p_value)}).`}
              >
                <DotPlot
                  title="AUC of the three scorers"
                  rows={scorers.map((s) => ({
                    key: s.key,
                    label: s.label,
                    points: [{ series: s.label, value: s.auc.auc, ci: s.auc.auc_ci, color: s.color }],
                  }))}
                  domain={[0.5, 0.85]}
                  ticks={[0.5, 0.6, 0.7, 0.8]}
                  format={(v) => v.toFixed(2)}
                  reference={{ value: 0.5, label: "coin flip" }}
                />
              </Panel>

              <div className="grid-2">
                <Panel title="Breaking the ties" note="On the applications where the two scorers disagree, the share each side would have called correctly.">
                  <Bars
                    title="Accuracy on disagreements"
                    bars={[
                      { key: "rule", label: "Follow the rule scorer", value: tiebreak.follow_rule ?? 0, color: "var(--rule)" },
                      { key: "llm", label: "Follow the LLM", value: tiebreak.follow_llm ?? 0, color: "var(--llm)" },
                      { key: "jev", label: "Follow Jev", value: tiebreak.follow_jev ?? 0, color: "var(--jev)" },
                    ]}
                    max={1}
                    format={(v) => pct(v)}
                  />
                </Panel>

                <Panel
                  title="Does a 0.7 mean 70%?"
                  note="Share moved forward against Jev's stated probability, for bands with at least 30 applications. On the diagonal is calibrated."
                  foot={<Legend items={[{ label: "Jev", color: "var(--jev)" }, { label: "Perfect calibration", color: "var(--faint)", shape: "dashed" }]} />}
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={calibration} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="mean_probability" type="number" domain={[0, 1]} tickFormatter={(v: number) => v.toFixed(1)} {...axis} />
                      <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} width={44} {...axis} />
                      <Tooltip content={<Tip format={(v) => pct(v)} labelFormat={(l) => `Jev says ${pct(Number(l))}`} />} />
                      <Line data={[{ mean_probability: 0, diagonal: 0 }, { mean_probability: 1, diagonal: 1 }]} dataKey="diagonal" stroke="var(--faint)" strokeDasharray="4 4" dot={false} legendType="none" name="Calibrated" />
                      <Scatter dataKey="positive_rate" name="Moved forward" fill="var(--jev)" line={{ stroke: "var(--jev)", strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Panel>
              </div>

              <Panel title="Does Jev repeat the LLM's biases?" note="Mean probability from Jev and mean LLM score in the groups where the LLM went wrong.">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Group</th>
                        <th>Decided</th>
                        <th>Moved forward</th>
                        <th>Mean LLM score</th>
                        <th>Mean Jev probability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.by_country!, ...data.by_profile_band!].map((g) => (
                        <tr key={g.group}>
                          <td>{g.group}</td>
                          <td>{int(g.decided)}</td>
                          <td>{pct(g.positive_rate)}</td>
                          <td>{dec(g.mean_llm, 1)}</td>
                          <td>{pct(g.mean_jev)}</td>
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
