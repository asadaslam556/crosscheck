import { Bars, Heatmap } from "../charts/charts";
import { Callout, Fact, Loaded, PageHead, Panel, Toggle } from "../components/ui";
import { useApi, type Schemas } from "../lib/api";
import { int, pct } from "../lib/format";
import { setParam, useRoute } from "../lib/router";

const QUADRANTS = [
  { key: "rule_high_llm_low", label: "Rule likes it, LLM doesn't" },
  { key: "both_high", label: "Both like it" },
  { key: "both_low", label: "Neither likes it" },
  { key: "llm_high_rule_low", label: "LLM likes it, rule doesn't" },
];

const CAUSE_COLOR: Record<string, string> = {
  healthcare_rule_scale: "var(--rule)",
  thin_profile_inflation: "var(--llm)",
  austria_bonus: "var(--llm)",
  v2_inflation: "var(--llm)",
  unexplained: "var(--faint)",
};

export default function Disagreements() {
  const { params } = useRoute();
  const excluded = params.get("exclude") === "1";
  const result = useApi<Schemas["Agreement"]>("agreement", { exclude_family: excluded ? "Healthcare" : undefined });

  return (
    <>
      <PageHead eyebrow="Explore" title="Where the two scorers disagree">
        Each scorer is split at its own median. When only one of them likes an application, the outcome says which one to believe, and
        the known defects explain about half of the arguments.
      </PageHead>

      <div style={{ marginBottom: 18 }}>
        <Toggle checked={excluded} onChange={(on) => setParam("exclude", on ? "1" : null)}>
          Leave Healthcare out
        </Toggle>
      </div>

      <Loaded results={[result]} height={600}>
        {(data) => {
          const quadrant = (key: string) => data.quadrants.find((q) => q.quadrant === key);
          const fits = ["low", "medium", "good"];
          const bands = [...new Set(data.matrix.map((cell) => cell.llm_band))];
          const explained = data.triage.causes.filter((c) => c.cause !== "unexplained").reduce((s, c) => s + c.cases, 0);

          return (
            <div className="stack">
              <div className="facts">
                <Fact value={pct(data.agreement_rate)}>of decided applications get the same verdict from both scorers</Fact>
                <Fact value={int(data.triage.disagreements)}>disagreements</Fact>
                <Fact value={pct(explained / data.triage.disagreements, 0)}>of them explained by a known defect</Fact>
              </div>

              <Panel title="Four quadrants" note="Share moved forward in each quadrant. The two disagreement cells decide which scorer to follow when they split.">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  {QUADRANTS.map(({ key, label }) => {
                    const q = quadrant(key);
                    const split = key.includes("_low") && key !== "both_low";
                    return (
                      <div key={key} className="kpi" style={split ? { borderColor: key.startsWith("rule") ? "var(--rule)" : "var(--llm)" } : undefined}>
                        <div className="kpi-label">{label}</div>
                        <div className="kpi-value">{pct(q?.positive_rate)}</div>
                        <div className="kpi-sub">moved forward, of {int(q?.decided)}</div>
                      </div>
                    );
                  })}
                </div>
                <Callout>
                  When they disagree, follow the <strong>{data.winner_on_disagreement}</strong> scorer: its solo picks convert at{" "}
                  {pct(quadrant(data.winner_on_disagreement === "rule" ? "rule_high_llm_low" : "llm_high_rule_low")?.positive_rate)}.
                </Callout>
              </Panel>

              <Panel
                title="Why they disagree"
                note="Each disagreement is matched to the first known defect that fits it. A heuristic, not a diagnosis. The table says how often the rule scorer was the one that got it right."
              >
                <Bars
                  title="Share of disagreements by cause"
                  bars={data.triage.causes.map((cause) => ({
                    key: cause.cause,
                    label: cause.label,
                    value: cause.share ?? 0,
                    color: CAUSE_COLOR[cause.cause],
                  }))}
                  max={0.6}
                  format={(v) => pct(v, 0)}
                />
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Cause</th>
                        <th>Cases</th>
                        <th>Moved forward</th>
                        <th>Rule scorer right</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.triage.causes.map((cause) => (
                        <tr key={cause.cause}>
                          <td>{cause.label}</td>
                          <td>{int(cause.cases)}</td>
                          <td>{pct(cause.positive_rate)}</td>
                          <td>{pct(cause.rule_right_rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="The label recruiters see against the LLM score" note="Share moved forward for every rule-fit label and LLM score band, all families.">
                <Heatmap
                  rows={fits}
                  columns={bands}
                  rowTitle="rule fit"
                  columnTitle="LLM score"
                  cell={(fit, band) => {
                    const match = data.matrix.find((c) => c.rule_fit === fit && c.llm_band === band);
                    return match && { value: match.positive_rate, count: match.decided };
                  }}
                />
              </Panel>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}
