# Architecture

<p>
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/SQLAlchemy-2-D71F00?logo=sqlalchemy&logoColor=white" alt="SQLAlchemy">
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/NumPy-013243?logo=numpy&logoColor=white" alt="NumPy">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/nginx-009639?logo=nginx&logoColor=white" alt="nginx">
  <img src="https://img.shields.io/badge/GitHub%20Actions-2088FF?logo=githubactions&logoColor=white" alt="GitHub Actions">
</p>

How Crosscheck is put together, and the decisions behind it that aren't obvious from the code.

<p align="center"><img src="images/system.svg" alt="System overview"></p>

## Layers

| Layer | Where | Rule |
|---|---|---|
| Data | `backend/sql/schema.sql`, `backend/app/metrics/sql/*.sql` | One file per query. Every query reads the `scored_applications` view. |
| Domain | `metrics/compute.py`, `metrics/service.py` | `compute.py` is pure statistics on arrays. `service.py` combines query rows with statistics and does no SQL. |
| API | `api/routes.py`, `schemas.py` | Routes validate input and hand straight to the service. No arithmetic. |
| UI | `frontend/src` | Reads typed JSON. Never touches the database or the CSVs. |

Each layer depends only on the one below. That's what lets the 77 unit tests run without a database, and the SQL be read without reading any Python.

## A request, end to end

<p align="center"><img src="images/request-lifecycle.svg" alt="Sequence of GET /api/segments?dimension=country"></p>

The interesting step is the dimension check. Segment queries group by a column chosen at request time, which SQL parameters can't express, so two `.sql` files carry `{dimension}` and `{by}` placeholders. They're filled from a whitelist in `queries.py` and never from the request string. Anything outside the whitelist is a 422 before a query is built, and there's a test for that path.

## From CSV to chart

<p align="center"><img src="images/data-flow.svg" alt="Data flow from CSV to API"></p>

## Data model

<p align="center"><img src="images/data-model.svg" alt="The four tables, the optional Jev table and the scored_applications view"></p>

Foreign keys and `CHECK` constraints reject bad rows at load time: scores outside their range, a decision without a timestamp. Column details are in [data/README.md](../data/README.md).

## The release gate

<p align="center"><img src="images/release-gate.svg" alt="Release gate: both versions binned on fixed edges, LLM PSI against the rule-scorer control, then pass, warn or fail"></p>

## CI and the live demo

<p align="center"><img src="images/ci.svg" alt="CI: lint and unit tests, integration tests against Postgres, snapshot export, static build, Playwright, GitHub Pages"></p>

## Decisions

**The view is the seam.** `scored_applications` is the only place that says what a positive outcome is (`interviewed` or `hired`) and how profile completeness is banded. Changing either is one line, not a search across a dozen queries.

**Aggregation in SQL, ranking in Python.** Counts, rates, distributions, crosstabs and funnels are SQL, because the database does them faster than pulling rows into Python. AUC, DeLong, precision@k, the threshold sweep and PSI need the whole ranked array, so they run in numpy on rows the SQL returns.

**No ORM.** The API is read-only and every endpoint is an aggregation over a view. SQLAlchemy is there for connection pooling and parameter binding. Mapping four tables to classes nothing would instantiate would be code with no reader.

**Hand-written statistics.** AUC is about twenty lines using the Mann-Whitney identity, and DeLong another thirty. Writing them keeps scikit-learn out of the runtime and makes the tie handling visible. The tests cross-check AUC against scikit-learn on heavily tied data, and DeLong's interval width against a bootstrap.

**Typed responses, generated frontend types.** Every response is a Pydantic model, so `/api/docs` shows real schemas. The TypeScript types are generated from the OpenAPI schema (`npm run gen:api`), and CI fails if they drift.

**One origin.** In development Vite proxies `/api` to the backend, and in Docker nginx does. The browser never needs to know where the API lives, and there's no CORS setup to get wrong.

**Static mode.** The data never changes, so `backend/scripts/export_snapshot.py` writes every response the UI uses to JSON through the real routes. A build with `VITE_DATA_MODE=static` reads those files instead of calling the API. That's the GitHub Pages demo: the same app with no server behind it. A Playwright test loads every route of the static build, so a missing file fails CI.

**The release gate is fixed-bin PSI with a control.** Bins are fixed rather than quantile-based, because a gate that derives its bins from the new release can't see a shift in the new release. The rule scorer didn't change between versions, so its PSI on the same applications says whether the applicants moved or the model did. Versions are ordered by the first application each scored, not by name.

**Jev's results are committed.** `score_with_jev.py` runs once and writes a CSV. Nothing that runs routinely (tests, CI, the demo) needs a network call or a key, and the result is reproducible from the file.

## Frontend

- Hash routes (`#/findings/v2-drift?threshold=78`) from a small hand-written router, so every view and toggle state can be linked and the static demo works on Pages without server rewrites.
- One `useApi` hook with a cache keyed by URL. The data is fixed for the life of the page.
- Dot plots with interval whiskers for every AUC comparison: the axis is cut, and bars on a cut axis exaggerate gaps.
- One colour per meaning everywhere: blue is the rule scorer, amber the LLM, teal Jev, ink the outcome.
- Pages with charts load lazily, so the overview ships without the charting library.
