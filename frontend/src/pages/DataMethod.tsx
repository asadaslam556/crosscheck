import { Loaded, PageHead, Panel, Status } from "../components/ui";
import { useApi, type Schemas } from "../lib/api";
import { int } from "../lib/format";

const ANALYSIS = "https://github.com/asadaslam556/crosscheck/blob/main/ANALYSIS.md";

export default function DataMethod() {
  const quality = useApi<Schemas["DataQuality"]>("data-quality");
  const health = useApi<Schemas["Health"]>("health");

  return (
    <>
      <PageHead eyebrow="Explore" title="Data & method">
        What the numbers are built on, the decisions behind them, and the evidence for each decision.
      </PageHead>

      <div className="stack">
        <Loaded results={[health]} height={90}>
          {(data) => (
            <div className="kpis">
              {Object.entries(data.tables ?? {}).map(([table, rows]) => (
                <div className="kpi" key={table}>
                  <div className="kpi-label">
                    <code>{table}</code>
                  </div>
                  <div className="kpi-value">{int(rows)}</div>
                  <div className="kpi-sub">rows</div>
                </div>
              ))}
            </div>
          )}
        </Loaded>

        <Loaded results={[quality]} height={360}>
          {(data) => (
            <Panel title="Data checks" note="Every assumption in the write-up, with the number that backs it.">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Value</th>
                      <th style={{ textAlign: "left" }}>What I did about it</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.checks.map((check) => (
                      <tr key={check.key}>
                        <td>{check.label}</td>
                        <td>{check.value}</td>
                        <td className="wrap">{check.decision}</td>
                        <td>
                          <Status status={check.status}>{check.status === "ok" ? "OK" : check.status === "warn" ? "Watch" : "Note"}</Status>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </Loaded>

        <Panel title="How the numbers are made">
          <div className="prose">
            <p>
              <strong>The outcome.</strong> <code>interviewed</code> and <code>hired</code> count as moved forward, <code>rejected</code>{" "}
              as not. Pending applications are left out rather than counted as rejections.
            </p>
            <p>
              <strong>AUC</strong> is the chance that a random application the recruiter moved forward is ranked above a random one they
              rejected. It judges ranking and ignores where a threshold sits, which matters when one finding is that the threshold's
              meaning moved. Intervals and paired comparisons use DeLong's method.
            </p>
            <p>
              <strong>Rates</strong> carry 95% Wilson intervals, which behave at small sizes and near 0 or 1. Segments with fewer than 30
              decided applications are shown but faded.
            </p>
            <p>
              <strong>Drift</strong> is the population stability index over fixed score bins: under 0.10 is stable, 0.10 to 0.25 is worth a
              look, above 0.25 is a real shift. The unchanged rule scorer is the control.
            </p>
            <h2>What this can't tell you</h2>
            <ul>
              <li>
                Recruiters see both scores before deciding, so the scores partly cause the outcome they are graded on. Every AUC here is
                an upper bound.
              </li>
              <li>An interview is a proxy for the recruiter's judgement, not for how the hire works out. There is no post-hire data.</li>
              <li>
                v1 ran until February and v2 from March, with no overlap, so model version and time can't be separated.
              </li>
            </ul>
            <p>
              The full write-up, with every number and proposal, is in <a href={ANALYSIS}>ANALYSIS.md</a>.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
