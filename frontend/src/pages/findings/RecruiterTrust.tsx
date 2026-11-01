import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Bars, Tip } from "../../charts/charts";
import { Callout, Fact, Legend, Loaded, PageHead, Panel, Toggle } from "../../components/ui";
import { useApi, type Schemas } from "../../lib/api";
import { int, month, pct } from "../../lib/format";
import { setParam, useRoute } from "../../lib/router";
import { FindingPager } from ".";

const axis = { stroke: "var(--line-strong)", tickLine: false } as const;

export default function RecruiterTrust() {
  const { params } = useRoute();
  const showTrap = params.get("trap") === "1";
  const behaviour = useApi<Schemas["RecruiterBehaviour"]>("recruiter-behaviour");
  const drift = useApi<Schemas["Drift"]>("drift");

  return (
    <>
      <PageHead eyebrow="Finding 5" title="Recruiters quietly stopped opening the AI panel, and the obvious explanation is wrong">
        From January, the share of applications where a recruiter looked at the AI score fell by about ten points and stayed down.
        Profile opens did not move. The drop came two months before v2 shipped.
      </PageHead>

      <Loaded results={[behaviour, drift]} height={560}>
        {(data, driftData) => {
          const monthly = data.monthly.map((m) => ({ ...m, month: m.month.slice(0, 7) }));
          const versionOf = new Map(driftData.months.map((m) => [m.month, m.version]));
          const cutover = driftData.months.find((m) => m.version !== driftData.months[0].version)?.month;

          // The naive cut: AI views by model version, weighted by applications.
          const byVersion = [...new Set(driftData.months.map((m) => m.version))].map((version) => {
            const months = monthly.filter((m) => versionOf.get(m.month) === version);
            const total = months.reduce((sum, m) => sum + m.applications, 0);
            return { version, rate: months.reduce((sum, m) => sum + m.ai_score_viewed_rate * m.applications, 0) / total };
          });
          const dec2025 = monthly.find((m) => m.month === "2025-12");
          const jan2026 = monthly.find((m) => m.month === "2026-01");
          const funnel = data.funnel;

          return (
            <div className="stack">
              <div className="facts">
                <Fact value={`${pct(dec2025?.ai_score_viewed_rate, 0)} → ${pct(jan2026?.ai_score_viewed_rate, 0)}`} color="var(--llm)">
                  applications with the AI score viewed, December to January
                </Fact>
                <Fact value={`${pct(dec2025?.profile_opened_rate, 0)} → ${pct(jan2026?.profile_opened_rate, 0)}`}>
                  profiles opened over the same months: no change
                </Fact>
                <Fact value={pct(funnel.positive_rate_when_shortlisted, 0)} color="var(--warn)">
                  of {int(funnel.shortlisted)} shortlisted applications were moved forward. Shortlisting records the decision.
                </Fact>
              </div>

              <Panel
                title="Recruiter interactions by application month"
                note="Recruiters still work the queue at the same rate. They stopped consulting the AI while doing it."
                tools={
                  <Toggle checked={showTrap} onChange={(on) => setParam("trap", on ? "1" : null)}>
                    Show the misleading cut
                  </Toggle>
                }
                foot={<Legend items={[{ label: "Profile opened", color: "var(--outcome)", shape: "line" }, { label: "AI score viewed", color: "var(--llm)", shape: "line" }]} />}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={monthly} margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickFormatter={(m: string) => month(m, true)} {...axis} />
                    <YAxis domain={[0.4, 1]} ticks={[0.4, 0.6, 0.8, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} width={44} {...axis} />
                    <ReferenceLine x="2026-01" stroke="var(--bad)" strokeDasharray="3 3" label={{ value: "drop", position: "insideTopLeft", fill: "var(--bad)", fontSize: 11 }} />
                    {cutover && <ReferenceLine x={cutover} stroke="var(--faint)" strokeDasharray="3 3" label={{ value: "v2 ships", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />}
                    <Tooltip content={<Tip format={(v) => pct(v)} labelFormat={(l) => month(l)} />} />
                    <Line dataKey="profile_opened_rate" name="Profile opened" stroke="var(--outcome)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="ai_score_viewed_rate" name="AI score viewed" stroke="var(--llm)" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
                {showTrap && (
                  <div className="fade-in" style={{ marginTop: 18 }}>
                    <h3 style={{ marginBottom: 8 }}>The same data, cut by model version</h3>
                    <Bars
                      title="Share of applications with the AI score viewed, by model version"
                      bars={byVersion.map((v) => ({ key: v.version, label: `${v.version} era`, value: v.rate, color: "var(--llm)" }))}
                      max={1}
                      format={(v) => pct(v)}
                    />
                    <Callout tone="warn">
                      Cut this way it looks like v2 damaged trust. The monthly series rules that out: the break is between December and
                      January, and v2 arrived in March. Blaming v2 would send the LLM team after a release that isn't responsible.
                    </Callout>
                  </div>
                )}
              </Panel>

              <Panel title="What to do">
                <div className="prose">
                  <p>
                    Pull the January 2026 release log and talk to a handful of recruiters before building anything. A UI change or a
                    process change at the turn of the year are the two explanations left, and this data can't separate them.
                  </p>
                  <p>
                    Then instrument the missing half of the loop: the platform records that a score was viewed, not whether the recruiter
                    agreed with it. A one-click agree or disagree on the AI panel would give every analysis here a cleaner label than the
                    final decision.
                  </p>
                </div>
              </Panel>
            </div>
          );
        }}
      </Loaded>
      <FindingPager path="/findings/recruiter-trust" />
    </>
  );
}
