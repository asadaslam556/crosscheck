import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Tip } from "../../charts/charts";
import { Callout, Fact, Legend, Loaded, PageHead, Panel, Status } from "../../components/ui";
import { useApi, type Schemas } from "../../lib/api";
import { dec, month, pct, signed } from "../../lib/format";
import { setParam, useRoute } from "../../lib/router";
import { FindingPager } from ".";

const V1 = { stroke: "var(--llm-v1)", strokeDasharray: "5 4" };
const V2 = { stroke: "var(--llm)" };
const axis = { stroke: "var(--line-strong)", tickLine: false, tick: { fill: "var(--muted)", fontSize: 12 } } as const;
const percent = (v: number) => `${Math.round(v * 100)}%`;

export default function V2Drift() {
  const { params } = useRoute();
  const threshold = Number(params.get("threshold") ?? 70);
  const gate = useApi<Schemas["QualityGate"]>("quality-gate");
  const sweep = useApi<Schemas["ThresholdSweep"]>("threshold-sweep", { scorer: "llm" });
  const calibration = useApi<Schemas["Calibration"]>("calibration", { scorer: "llm" });
  const drift = useApi<Schemas["Drift"]>("drift");

  return (
    <>
      <PageHead eyebrow="Finding 3" title="scorer-v2 inflated every score and bought no accuracy">
        The March release moved the whole LLM score distribution up by about eight points. Its ranking quality did not move. Nobody
        changed the flag threshold, so the flag fires far more often and means less.
      </PageHead>

      <Loaded results={[gate, sweep, calibration, drift]} height={700}>
        {(gateData, sweepData, calibrationData, driftData) => {
          const [v1, v2] = sweepData.versions;
          const at = (curve: typeof v1, t: number) => curve.points[t];
          const old = at(v1, sweepData.current_threshold);
          const now = at(v2, threshold);
          const curves = v1.points
            .map((point, i) => ({
              threshold: point.threshold,
              v1Flag: point.flagged_rate,
              v2Flag: v2.points[i].flagged_rate,
              v1Precision: point.precision,
              v2Precision: v2.points[i].precision,
            }))
            .filter((row) => row.threshold >= 40 && row.threshold <= 95);

          const versions = [...new Set(calibrationData.bands.map((b) => b.llm_model_version))];
          const calibrationRows = [...new Set(calibrationData.bands.map((b) => b.band))].sort((a, b) => a - b).map((band) => {
            const row: Record<string, string | number | null> = { band: calibrationData.bands.find((b) => b.band === band)!.band_label };
            for (const version of versions) {
              const match = calibrationData.bands.find((b) => b.band === band && b.llm_model_version === version);
              // Bands under 30 decided applications are left as gaps rather than drawn as noise.
              row[version] = match && !match.is_small_sample ? match.positive_rate : null;
            }
            return row;
          });
          const cutover = driftData.months.find((m) => m.version !== driftData.months[0].version)?.month;

          return (
            <div className="stack">
              <div className="facts">
                <Fact value={signed((gateData.mean_llm_score?.current ?? 0) - (gateData.mean_llm_score?.baseline ?? 0))} color="var(--llm)">
                  points on the mean LLM score, v1 to v2
                </Fact>
                <Fact value={`${pct(gateData.flag_rate_at_threshold?.baseline)} → ${pct(gateData.flag_rate_at_threshold?.current)}`}>
                  of applications flagged as strong at 70
                </Fact>
                <Fact value={dec(gateData.llm_psi)} color="var(--warn)">
                  PSI, inside the investigate band. The unchanged rule scorer: {dec(gateData.rule_psi_control)}
                </Fact>
              </div>

              <Panel
                title="Threshold explorer"
                note="Drag the v2 threshold and compare it with v1 at the live threshold of 70. Flag rate counts every scored application; precision and recall use decided ones."
                foot={<Legend items={[{ label: "scorer-v1", color: "var(--llm-v1)", shape: "dashed" }, { label: "scorer-v2", color: "var(--llm)", shape: "line" }]} />}
              >
                <div className="slider" style={{ marginBottom: 14 }}>
                  <label htmlFor="threshold">v2 threshold</label>
                  <input
                    id="threshold"
                    type="range"
                    min={50}
                    max={95}
                    value={threshold}
                    onChange={(event) => setParam("threshold", event.target.value)}
                  />
                  <output htmlFor="threshold">{threshold}</output>
                </div>
                <div className="kpis" style={{ marginBottom: 16 }}>
                  {[
                    { label: "Share flagged", v1: old.flagged_rate, v2: now.flagged_rate },
                    { label: "Precision of the flag", v1: old.precision, v2: now.precision },
                    { label: "Recall of the flag", v1: old.recall, v2: now.recall },
                  ].map((m) => (
                    <div className="kpi" key={m.label}>
                      <div className="kpi-label">{m.label}</div>
                      <div className="kpi-value">{pct(m.v2)}</div>
                      <div className="kpi-sub">v1 at 70: {pct(m.v1)}</div>
                    </div>
                  ))}
                </div>
                <div className="grid-2">
                  {(
                    [
                      ["Share flagged", "v1Flag", "v2Flag", [0, 0.8], [0, 0.2, 0.4, 0.6, 0.8]],
                      ["Precision", "v1Precision", "v2Precision", [0.5, 1], [0.5, 0.6, 0.7, 0.8, 0.9, 1]],
                    ] as const
                  ).map(([title, a, b, domain, ticks]) => (
                    <div key={title}>
                      <h3 style={{ marginBottom: 6 }}>{title}</h3>
                      <ResponsiveContainer width="100%" height={210}>
                        <LineChart data={curves} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="threshold" type="number" domain={[40, 95]} ticks={[40, 50, 60, 70, 80, 90]} {...axis} />
                          <YAxis domain={domain} ticks={[...ticks]} allowDataOverflow tickFormatter={percent} width={52} {...axis} />
                          <ReferenceLine x={70} stroke="var(--faint)" strokeDasharray="3 3" />
                          <ReferenceLine x={threshold} stroke="var(--llm)" />
                          <Tooltip content={<Tip format={(v) => pct(v)} labelFormat={(l) => `Threshold ${l}`} />} />
                          <Line dataKey={a} name="scorer-v1" dot={false} strokeWidth={2} {...V1} isAnimationActive={false} />
                          <Line dataKey={b} name="scorer-v2" dot={false} strokeWidth={2.5} {...V2} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
                <Callout>
                  {Math.abs((now.flagged_rate ?? 0) - (old.flagged_rate ?? 0)) < 0.02
                    ? `At ${threshold}, v2 flags about as many applications as v1 did at 70, and the flag is right ${pct(now.precision)} of the time.`
                    : `At ${threshold}, v2 flags ${pct(now.flagged_rate)} of applications, against ${pct(old.flagged_rate)} for v1 at 70. Try 78.`}
                </Callout>
              </Panel>

              <div className="grid-2">
                <Panel title="Same score, different meaning" note="Share moved forward per LLM score band. A v2 score of 70 converts like a v1 score of about 60.">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={calibrationRows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="band" {...axis} interval={1} />
                      <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={percent} width={52} {...axis} />
                      <Tooltip content={<Tip format={(v) => pct(v)} labelFormat={(l) => `Score ${l}`} />} />
                      <Line dataKey={versions[0]} name={versions[0]} strokeWidth={2} dot={{ r: 3 }} {...V1} />
                      <Line dataKey={versions[1]} name={versions[1]} strokeWidth={2.5} dot={{ r: 3 }} {...V2} />
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel
                  title="Drift by month"
                  note={`PSI of each month against ${month(driftData.baseline_months[0], true)} to ${month(driftData.baseline_months.at(-1)!, true)}. The rule scorer is the control.`}
                  tools={<Status status={gateData.status} />}
                >
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={driftData.months} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} />
                      <ReferenceArea y1={driftData.warn_at} y2={driftData.fail_at} fill="var(--warn)" fillOpacity={0.08} />
                      <XAxis dataKey="month" tickFormatter={(m: string) => month(m, true)} {...axis} interval={1} />
                      <YAxis domain={[0, 0.3]} ticks={[0, 0.1, 0.2, 0.3]} tickFormatter={(v: number) => v.toFixed(1)} width={52} {...axis} />
                      {cutover && <ReferenceLine x={cutover} stroke="var(--faint)" strokeDasharray="3 3" label={{ value: "v2 ships", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />}
                      <Tooltip content={<Tip format={(v) => v.toFixed(3)} labelFormat={(l) => month(l)} />} />
                      <Line dataKey="llm_psi" name="LLM score" stroke="var(--llm)" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line dataKey="rule_psi" name="Rule score (control)" stroke="var(--rule)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>
              </div>

              <Panel title="What to do">
                <div className="prose">
                  <p>
                    Recalibrate v2 onto the v1 scale before comparing anything, or raise the flag threshold to about 78, which restores
                    the old flag rate and slightly improves its precision.
                  </p>
                  <p>
                    Then make the check automatic. <code>python -m app.gate</code> runs this comparison and exits non-zero when it
                    fails, so a release pipeline can block on it. Report AUC and PSI together in release notes: on mean score or recall
                    alone, this release looked like an improvement.
                  </p>
                </div>
              </Panel>
            </div>
          );
        }}
      </Loaded>
      <FindingPager path="/findings/v2-drift" />
    </>
  );
}
