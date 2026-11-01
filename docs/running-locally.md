# Running it without Docker

<p>
  <img src="https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Docker-optional-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/pytest-0A9EDC?logo=pytest&logoColor=white" alt="pytest">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white" alt="Playwright">
</p>

For running the tests, stepping through the code with a debugger, or using your own PostgreSQL. If you only want to see the dashboard, `docker compose up --build` from the repo root is all you need.

You'll need PostgreSQL 14 or newer, Python 3.12 or newer, and Node 20 or newer.

<p align="center"><img src="images/local-dev.svg" alt="Browser to the Vite dev server, proxied to uvicorn and your PostgreSQL. Integration tests use a separate container on port 5433."></p>

## 1. Create the database

```bash
psql -U postgres -c "CREATE USER mqi WITH PASSWORD 'mqi';"
psql -U postgres -c "CREATE DATABASE mqi OWNER mqi;"
```

The credentials are deliberately trivial: this is a local analysis project with no login and no production deployment.

## 2. Configure

```bash
cp .env.example .env
```

The defaults match the user you just created. A real `DATABASE_URL` environment variable beats the file, so if the app connects somewhere unexpected, check for one.

## 3. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m scripts.load_data        # drops and rebuilds every table
uvicorn app.main:app --reload
```

The loader prints a row count per table (6,000 applications). The API is then at <http://localhost:8000>, with docs at <http://localhost:8000/api/docs>.

## 4. Frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to port 8000. Set `API_URL` if the backend runs somewhere else.

## Tests

```bash
cd backend
pytest                       # unit tests, no database needed
ruff check . && ruff format --check .
```

The integration tests drop and reload every table, so give them a throwaway database rather than the one you work in. A container on another port is the easy way:

```bash
docker run -d --name crosscheck-test-db -e POSTGRES_USER=mqi -e POSTGRES_PASSWORD=mqi \
  -e POSTGRES_DB=mqi -p 5433:5432 postgres:18-alpine
DATABASE_URL=postgresql+psycopg://mqi:mqi@localhost:5433/mqi pytest -m integration
```

Frontend:

```bash
cd frontend
npm test                     # Vitest
npm run typecheck
```

The end-to-end tests run against the static build, which reads exported JSON instead of the API:

```bash
cd backend && python -m scripts.export_snapshot     # needs a loaded database
cd ../frontend && npm run build:static
npx playwright install chromium                     # first time only
npm run e2e
```

## Other commands

| Command | What it does |
|---|---|
| `python -m app.gate` | Prints the release gate report and exits 1 if it fails. Add `--strict` to fail on a warning too. |
| `python -m scripts.export_snapshot` | Writes every API response the UI uses to `frontend/public/data/` |
| `python -m scripts.score_with_jev` | Scores the decided applications with Jev. Needs `TYPESAFE_API_KEY`. |
| `npm run gen:api` | Regenerates the TypeScript API types from an `openapi.json` in `frontend/`. CI shows how to produce one. |

## Windows notes

- In PowerShell, activate the environment with `.venv\Scripts\Activate.ps1`. If scripts are blocked, run `Set-ExecutionPolicy -Scope Process Bypass` first. That only lasts for the current window.
- The PostgreSQL installer doesn't put `psql` on your PATH. Use the "SQL Shell (psql)" app from the Start menu, or add `C:\Program Files\PostgreSQL\<version>\bin` to PATH.
- If `python` opens the Microsoft Store, turn off the `python.exe` app execution aliases under Settings → Apps → Advanced app settings.

## When something goes wrong

| Symptom | Fix |
|---|---|
| `connection refused` | PostgreSQL isn't running, or `DATABASE_URL` points at the wrong port |
| `password authentication failed for user "mqi"` | `.env` doesn't match the user from step 1, or an environment variable overrides it |
| `Missing CSVs in ...` | `DATA_DIR` points somewhere without the CSVs. Remove it from `.env`; the default finds `data/` from anywhere. |
| Every panel says it couldn't load | The API isn't running. Check <http://localhost:8000/api/health>. |
| Docker: `port is already allocated` | Something else has 8080. Run `WEB_PORT=8090 docker compose up`. |
| Code changes don't show up | A stale bundle: hard-reload the browser (`Ctrl+Shift+R`), or delete `frontend/node_modules/.vite` |
