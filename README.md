<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo-dark.svg">
    <img src="docs/brand/logo.svg" alt="Crosscheck" width="360">
  </picture>
</p>

<p align="center">
  <b>Grading a rule engine and an LLM scorer against what recruiters actually did.</b><br>
  A candidate-matching platform scores every application twice. Measured naively the LLM wins.<br>
  Measured properly, one bug in one job family turns out to be the whole difference.
</p>

<p align="center">
  <a href="https://github.com/asadaslam556/crosscheck/actions/workflows/ci.yml"><img src="https://github.com/asadaslam556/crosscheck/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://asadaslam556.github.io/crosscheck/"><img src="https://img.shields.io/badge/live%20demo-GitHub%20Pages-2563EB?logo=github" alt="Live demo"></a>
  <img src="https://img.shields.io/badge/tests-112%20backend%20%C2%B7%2033%20frontend-15803d?logo=pytest&logoColor=white" alt="Tests">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white" alt="Python 3.12">
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/SQLAlchemy-2-D71F00?logo=sqlalchemy&logoColor=white" alt="SQLAlchemy 2">
  <img src="https://img.shields.io/badge/Pydantic-2-E92063?logo=pydantic&logoColor=white" alt="Pydantic 2">
  <img src="https://img.shields.io/badge/NumPy-013243?logo=numpy&logoColor=white" alt="NumPy">
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 18">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/Docker%20Compose-2496ED?logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center">
  <a href="https://asadaslam556.github.io/crosscheck/">Live demo</a> ·
  <a href="ANALYSIS.md">Findings</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="#run-it">Run it</a>
</p>

<p align="center">
  <img src="docs/images/demo.gif" alt="Walkthrough: the verdict in four views, the simulated Healthcare fix, the v2 threshold slider, segments by country and the recruiter engagement drop" width="900">
  <br>
  <sub>The verdict in four views, the simulated Healthcare fix, the v2 threshold slider, and the misleading cut in finding 5. <a href="docs/images/demo.mp4">Full-quality video (MP4)</a></sub>
</p>

## What it found

Across all job families the LLM scorer looks better than the rule scorer: AUC 0.724 against 0.689. That ranking is an artefact. The rule scorer squashes every Healthcare score below its 0.5 cut-off, and that one family drags its pooled number down. Leave Healthcare out and the rule scorer wins 0.782 to 0.729. Measure inside each job posting, which is how recruiters actually use the scores, and it wins 0.759 to 0.724 even with Healthcare in.

| | Finding | Evidence |
|---|---|---|
| 1 | [The rule scorer is broken for Healthcare, and that flips the platform verdict](ANALYSIS.md#finding-1-the-rule-scorer-is-broken-for-healthcare-and-it-is-corrupting-the-platform-level-verdict) | All 1,363 Healthcare applications are bucketed `low` (max score 0.305) while converting at the platform average. Simulating the fix lifts pooled rule AUC from 0.689 to 0.762. |
| 2 | [The LLM scores candidates highest when it knows least about them](ANALYSIS.md#finding-2-the-llm-scores-candidates-highest-when-it-knows-least-about-them) | Mean 73.8 below 0.4 profile completeness against 62.1 above it, and those candidates convert worse: 48.0% against 53.3% |
| 3 | [scorer-v2 inflated every score and bought no accuracy](ANALYSIS.md#finding-3-scorer-v2-inflated-every-score-and-bought-no-accuracy-with-it) | Mean +7.8, AUC 0.731 to 0.727, flags at 70 up from 29.6% to 49.3%. A threshold of 78 restores the old flag rate. |
| 4 | [The LLM gives Austrian candidates a bonus outcomes don't justify](ANALYSIS.md#finding-4-austrian-candidates-receive-a-systematic-llm-bonus-that-outcomes-do-not-justify) | AT 69.0 against DE 62.6, surviving every control, on outcome rates of 53.6% and 51.9% |
| 5 | [Recruiters stopped opening the AI panel, and the obvious explanation is wrong](ANALYSIS.md#finding-5-recruiters-have-quietly-disengaged-from-the-ai-panel-and-the-obvious-explanation-is-wrong) | AI score views fell about 10 points while profile opens held. The break is December to January; v2 shipped in March. |

The full write-up, with method, limitations and a proposal per finding, is in [ANALYSIS.md](ANALYSIS.md).

## What it looks like

| The verdict, four ways | The simulated Healthcare fix |
| :---: | :---: |
| <img src="docs/images/screenshots/overview.png" alt="Overview with the verdict dot plot" width="440"> | <img src="docs/images/screenshots/healthcare-fix.png" alt="Healthcare finding with the rescale applied" width="440"> |
| **The v2 threshold explorer** | **Segments, in dark mode** |
| <img src="docs/images/screenshots/threshold-explorer.png" alt="Threshold slider at 78" width="440"> | <img src="docs/images/screenshots/segments-dark.png" alt="Segments by country in dark mode" width="440"> |

## What's in it

- **An overview and a page per finding**, each with the chart that proves it, the key numbers, and what I'd do about it.
- **Interactive where it makes the point.** Apply the Healthcare rescale and watch the verdict flip. Drag the v2 threshold and see where the flag rate comes back. Turn on the misleading model-version cut in finding 5 and see why it's a trap.
- **Intervals on everything.** AUCs carry DeLong intervals and paired tests, rates carry Wilson intervals, and small segments are faded.
- **Disagreement triage.** Of the 1,872 applications where the two scorers disagree, about half trace back to one of the known defects. The rest convert at 52.5%, a coin flip.
- **A release gate you can run in CI.** `python -m app.gate` compares the latest model version with the previous one (PSI, with the unchanged rule scorer as the control) and exits non-zero when it fails.
- **A third opinion.** [Jev](https://typesafe.ai), TypeSafe AI's decision model, can score every application from the job and candidate facts alone and be graded on the same yardstick. See [Using Jev](#using-jev).
- **A data page** that backs each assumption with a number: pending rate by segment, duplicate applications, the shortlisting leak, ties at the cut-off.

## Run it

You need [Docker](https://www.docker.com/products/docker-desktop/) and nothing else.

```bash
git clone https://github.com/asadaslam556/crosscheck.git
cd crosscheck
docker compose up --build
```

Then open <http://localhost:8080>. The API docs are at <http://localhost:8080/api/docs>. The stack brings its own PostgreSQL and loads the four CSVs on start; you should see `applications 6000 rows` in the logs. If 8080 is taken, run `WEB_PORT=8090 docker compose up --build`.

To run the pieces by hand, use a debugger or point it at your own Postgres, see [docs/running-locally.md](docs/running-locally.md).

## How it works

<p align="center"><img src="docs/images/system.svg" alt="System overview: dashboard, nginx, FastAPI, PostgreSQL, loader, Jev scores, snapshot exporter and GitHub Pages"></p>

Four layers, each depending only on the one below: **data** (the schema and one `.sql` file per query), **domain** (`compute.py` for statistics, `service.py` to compose them), **API** (`routes.py`, typed `schemas.py`) and **UI**. Routes do no maths and the service does no SQL. That's why the statistics can be tested without a database and the SQL can be read without reading Python.

<p align="center"><img src="docs/images/data-flow.svg" alt="Data flow: CSVs loaded with COPY into PostgreSQL, read through one view, aggregated in SQL and ranked in Python, served as typed JSON"></p>

Every query reads one view, `scored_applications`. It's the only place that defines a positive outcome and the profile bands, so changing either is a one-line change. Counts, rates and crosstabs stay in SQL. AUC, DeLong, precision@k and PSI need the full ranked array, so they run in numpy. More in [docs/architecture.md](docs/architecture.md).

The live demo is the same app built in static mode. CI exports every API response the UI uses to JSON, and GitHub Pages serves it with no backend.

## How the numbers are made

- **Outcome.** `interviewed` and `hired` count as moved forward, `rejected` as not. The 504 pending applications are left out, not counted as rejections. Their rate is flat across every segment (7.5% to 9.1%), so they look missing at random.
- **AUC** is the chance that a random application the recruiter moved forward is ranked above a random one they rejected. It judges ranking and ignores where a threshold sits, which matters when one finding is that the threshold's meaning moved. It's hand-written (Mann-Whitney with tie handling) and cross-checked against scikit-learn in the tests.
- **Intervals.** DeLong for AUCs and the paired rule-against-LLM test, Wilson for rates.
- **Drift.** PSI over fixed score bins. Under 0.10 is stable, 0.10 to 0.25 is worth a look, above 0.25 is a real shift.

The label isn't neutral: recruiters see both scores before they decide, so every AUC here is an upper bound. [ANALYSIS.md](ANALYSIS.md#limitations) covers that and the other limitations.

## API

| Endpoint | What it answers |
|---|---|
| `GET /api/overview` | Headline counts, the verdict in four views, the release gate |
| `GET /api/effectiveness` | AUC with intervals, precision and recall at the threshold, precision@k. `exclude_family=` and `rescale_family=` |
| `GET /api/within-job` | AUC inside each job posting, per job and per family |
| `GET /api/agreement` | The four quadrants, which scorer to believe, and the disagreement triage |
| `GET /api/segments?dimension=&by=` | Per-segment metrics with intervals. Dimensions: `job_family`, `country`, `seniority`, `model_version`, `profile_band`, `completeness_decile` |
| `GET /api/calibration?scorer=` | Positive rate per score band, by model version |
| `GET /api/threshold-sweep?scorer=` | Flag rate, precision and recall at every threshold, by model version |
| `GET /api/drift` | PSI per month against the first three months |
| `GET /api/quality-gate` | PSI between the two most recent model versions: pass, warn or fail |
| `GET /api/recruiter-behaviour` | Monthly interaction rates and the funnel |
| `GET /api/data-quality` | The evidence behind each assumption |
| `GET /api/third-opinion` | Jev graded against the two scorers, once it has been run |
| `GET /api/health` | Database reachability and row counts |

## Using Jev

Jev hasn't been run in this repo yet, so the Third opinion page shows how to run it. With a key from the [TypeSafe console](https://console.typesafe.ai):

```bash
cd backend
TYPESAFE_API_KEY=... python -m scripts.score_with_jev
```

It sends each decided application's job and candidate facts, never the scores or the outcome, and asks one typed question. The results go to `data/derived/jev_scores.csv`, which is meant to be committed, so nothing else ever needs the key. A full run is about 2.4M input tokens. Restart the stack and the page fills in.

## Tests and CI

| Suite | Count | What it covers |
|---|---|---|
| Backend unit | 77 | AUC (against scikit-learn, heavy ties), DeLong (against a bootstrap), Wilson, PSI, the sweep, triage rules, the gate, the service layer, the HTTP layer |
| Backend integration | 35 | Loads the CSVs into Postgres and pins every number quoted in this README and in ANALYSIS.md |
| Frontend unit | 7 | Formatters and the snapshot file mapping |
| End to end | 26 | Every route on desktop and phone, the verdict flip, the rescale and the threshold slider |

```bash
cd backend && pytest                    # unit tests, no database needed
DATABASE_URL=postgresql+psycopg://mqi:mqi@localhost:5433/mqi pytest -m integration
cd frontend && npm test && npm run build:static && npm run e2e
```

The integration tests drop and reload every table at `DATABASE_URL`, so point them at a throwaway database. CI runs all of it on every push, checks the generated API types match the backend, posts the release gate report to the run summary, and builds the Compose stack.

## Project layout

```
backend/
  app/
    api/routes.py           HTTP layer
    metrics/sql/*.sql       one file per query
    metrics/queries.py      loads the SQL, owns the dimension whitelist
    metrics/compute.py      AUC, DeLong, Wilson, PSI, threshold sweep
    metrics/service.py      composes rows and statistics into answers
    schemas.py              typed responses
    gate.py                 command-line release gate
  scripts/                  load_data, export_snapshot, score_with_jev
  sql/schema.sql            tables, constraints, the scored_applications view
  tests/
frontend/src/
  pages/                    overview, one page per finding, explorers
  charts/charts.tsx         dot plots with intervals, diverging bars, heatmap
  lib/                      api client (live or static), hash router, formatting
data/                       the four source CSVs
docs/                       architecture notes, local setup, images
```

## Tech stack

<p align="center">
  <img src="https://skillicons.dev/icons?i=python,fastapi,postgres,react,ts,vite,nodejs,docker,nginx,githubactions,vitest" alt="Python, FastAPI, PostgreSQL, React, TypeScript, Vite, Node.js, Docker, nginx, GitHub Actions, Vitest">
</p>

| Layer | Built with | Why |
|---|---|---|
| Database | PostgreSQL 18 | Constraints catch bad rows at load time, and `percentile_cont`, `FILTER` and window functions do the aggregation |
| API | FastAPI, SQLAlchemy 2, Pydantic 2 | Typed responses give real OpenAPI docs, and the frontend types are generated from them. No ORM: every endpoint is an aggregation over a view. |
| Statistics | NumPy | AUC, DeLong and PSI are hand-written, so the tie handling is visible and tested |
| Frontend | React 19, Vite 8, Recharts 3 | No router, state or CSS library. Three CSS files with light and dark tokens. |
| Tests | pytest, Vitest, Playwright | Unit, golden-number integration and end-to-end |
| Delivery | Docker Compose, nginx, GitHub Actions, GitHub Pages | One command locally, and a demo with no server to run |

## Where this came from

This started as a three-day take-home for a recruiting-tech company: load the data, measure the two scorers, build a dashboard, write up what you find. Version 1.0.0 is that submission, tagged as it was sent.

Version 2.0 is what I built afterwards. It adds within-job ranking, DeLong intervals, the simulated fix, the threshold sweep, monthly drift, disagreement triage, the Jev comparison, the gate CLI, integration tests, the rebuilt UI, Docker for production, CI and the live demo. The analysis didn't change its conclusions, it got more evidence. See [CHANGELOG.md](CHANGELOG.md).

## License

The code is [MIT](LICENSE). The four CSVs in `data/` came with the exercise and aren't covered by that licence; they're here so the project runs from a clean clone.

Built by [Asad Aslam](https://github.com/asadaslam556).
