import { DotPlot } from "../charts/charts";
import { Callout, Kpi, Legend, Loaded, PageHead, Panel, Segmented, Status } from "../components/ui";
import { useApi, type Schemas } from "../lib/api";
import { dec, int, pct, pValue, signed } from "../lib/format";
import { href, setParam, useRoute } from "../lib/router";

const WHY: Record<string, string> = {
  pooled:
    "Every job family in one pot. This is the number a dashboard shows by default, and it says the LLM is the better scorer.",
  excluding_healthcare:
    "The rule scorer squashes every Healthcare score below 0.31. Leave that one family out and the rule scorer is ahead by five points.",
  within_job:
    "Recruiters compare candidates for one job, never across jobs, so the Healthcare scale bug cannot hurt them there. Measured inside each of the 80 postings, the rule scorer wins too.",
  after_fix:
    "Scale Healthcare's rule scores up to the level of the other families, as the proposed fix would, and the pooled verdict flips back to the rule scorer.",
};

export default function Overview() {
  const { params } = useRoute();
  const overview = useApi<Schemas["Overview"]>("overview");
  const families = useApi<Schemas["Segments"]>("segments", { dimension: "job_family" });
  const bands = useApi<Schemas["Segments"]>("segments", { dimension: "profile_band" });
  const countries = useApi<Schemas["Segments"]>("segments", { dimension: "country" });
  const behaviour = useApi<Schemas["RecruiterBehaviour"]>("recruiter-behaviour");
  const active = params.get("view") ?? "pooled";

  return (
    <>
      <PageHead eyebrow="Overview" title="Which scorer should recruiters trust?">
        Two systems score every application: a deterministic rule engine and an LLM reviewer. Graded
        against what recruiters actually did, the headline answer depends on one broken job family.
      </PageHead>

      <Loaded results={[overview]} height={520}>
        {(data) => {
          const { counts, verdict, quality_gate: gate } = data;
          const selected = verdict.find((view) => view.key === active) ?? verdict[0];
          return (
            <div className="stack">
              <div className="kpis">
                <Kpi label="Applications" value={int(counts.total_applications)} sub={`${counts.jobs} jobs, ${int(counts.candidates)} candidates`} />
                <Kpi label="With a decision" value={int(counts.decided)} sub={`${counts.pending} pending (${pct(counts.pending_rate)})`} />
                <Kpi label="Moved forward" value={pct(counts.positive_rate)} sub={`${pct(counts.hire_rate)} hired`} />
                <Kpi label="Rule scorer AUC" value={dec(data.excluding_healthcare.rule)} sub={`${dec(data.pooled.rule)} with Healthcare`} />
                <Kpi label="LLM scorer AUC" value={dec(data.excluding_healthcare.llm)} sub={`${dec(data.pooled.llm)} with Healthcare`} />
              </div>

              <Panel
                title="The same question, asked four ways"
                note="AUC is the chance that a random application the recruiter moved forward is ranked above a random one they rejected. 0.5 is a coin flip. Whiskers are 95% intervals."
                tools={
                  <Segmented
                    label="Explain a view"
                    value={selected.key}
                    onChange={(key) => setParam("view", key)}
                    options={verdict.map((view) => ({ value: view.key, label: view.label }))}
                  />
                }
                foot={<Legend items={[{ label: "Rule scorer", color: "var(--rule)" }, { label: "LLM scorer", color: "var(--llm)" }]} />}
              >
                <DotPlot
                  title="AUC of the rule and LLM scorers in four views"
                  rows={verdict.map((view) => ({
                    key: view.key,
                    label: view.label,
                    note: view.key === "within_job" ? `mean over ${view.n} jobs` : `${int(view.n)} decided`,
                    points: [
                      { series: "Rule scorer", value: view.rule, ci: view.rule_ci, color: "var(--rule)" },
                      { series: "LLM scorer", value: view.llm, ci: view.llm_ci, color: "var(--llm)" },
                    ],
                  }))}
                  domain={[0.6, 0.85]}
                  ticks={[0.6, 0.65, 0.7, 0.75, 0.8, 0.85]}
                  format={(v) => v.toFixed(2)}
                  active={selected.key}
                  onSelect={(key) => setParam("view", key)}
                />
                <Callout>
                  <strong>
                    {selected.rule! > selected.llm! ? "Rule scorer ahead" : "LLM scorer ahead"}
                    {selected.comparison &&
                      ` by ${(Math.abs(selected.comparison.difference) * 100).toFixed(1)} AUC points (${pValue(selected.comparison.p_value)})`}
                    .
                  </strong>{" "}
                  {WHY[selected.key]}
                </Callout>
              </Panel>

              <Panel
                title="Release quality gate"
                note="Compares the score distribution of the current LLM version with the previous one. The rule scorer did not change, so it shows whether the applicants moved or the model did."
                tools={<Status status={gate.status} />}
              >
                {gate.llm_psi != null && (
                  <p className="lede" style={{ fontSize: 15 }}>
                    {gate.baseline_version} to {gate.current_version}: LLM score PSI <strong className="num">{dec(gate.llm_psi)}</strong>{" "}
                    against a warning line of {dec(gate.warn_at, 2)}, while the rule scorer moved {dec(gate.rule_psi_control)}. The share of
                    applications flagged at {gate.flag_rate_at_threshold?.threshold} went from {pct(gate.flag_rate_at_threshold?.baseline)} to{" "}
                    {pct(gate.flag_rate_at_threshold?.current)}. <a href={href("/findings/v2-drift")}>See finding 3</a>.
                  </p>
                )}
              </Panel>

              <Loaded results={[families, bands, countries, behaviour]} height={150}>
                {(familyData, bandData, countryData, behaviourData) => {
                  const healthcare = familyData.segments.find((s) => s.segment === "Healthcare")!;
                  const thin = bandData.segments.find((s) => s.segment.startsWith("thin"))!;
                  const others = bandData.segments.filter((s) => s !== thin);
                  const othersMean = others.reduce((sum, s) => sum + s.mean_llm_score * s.applications, 0) / others.reduce((sum, s) => sum + s.applications, 0);
                  const at = countryData.segments.find((s) => s.segment === "AT")!;
                  const de = countryData.segments.find((s) => s.segment === "DE")!;
                  const monthly = behaviourData.monthly;
                  const before = monthly.find((m) => m.month.startsWith("2025-12"));
                  const after = monthly.find((m) => m.month.startsWith("2026-01"));
                  const cards = [
                    { path: "/findings/healthcare", n: 1, value: pct(healthcare.low_fit_rate, 0), text: "of Healthcare applications are labelled low fit by the rule scorer, yet they convert like everyone else." },
                    { path: "/findings/thin-profiles", n: 2, value: signed(thin.mean_llm_score - othersMean), text: "LLM points for candidates with the emptiest profiles, who convert worse." },
                    { path: "/findings/v2-drift", n: 3, value: signed((gate.mean_llm_score?.current ?? 0) - (gate.mean_llm_score?.baseline ?? 0)), text: "points on every v2 score, for no gain in accuracy." },
                    { path: "/findings/country-bias", n: 4, value: signed(at.mean_llm_score - de.mean_llm_score), text: "LLM points for Austrian jobs over German ones, on near-identical outcomes." },
                    { path: "/findings/recruiter-trust", n: 5, value: `${Math.round(((after?.ai_score_viewed_rate ?? 0) - (before?.ai_score_viewed_rate ?? 0)) * 100)} pp`, text: "in AI score views from December to January, two months before v2 shipped." },
                  ];
                  return (
                    <section>
                      <h2 style={{ marginBottom: 12 }}>Five findings</h2>
                      <div className="finding-cards">
                        {cards.map((card) => (
                          <a key={card.path} className="finding-card" href={href(card.path)}>
                            <span className="eyebrow">Finding {card.n}</span>
                            <span className="num">{card.value}</span>
                            <p>{card.text}</p>
                          </a>
                        ))}
                      </div>
                    </section>
                  );
                }}
              </Loaded>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}
