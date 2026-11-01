"""Ask Jev for an independent judgement on every decided application.

Jev (TypeSafe AI's decision model) reads the facts of an application and answers one typed
question: will the recruiter move this candidate forward? It never sees the rule score, the
LLM score or the outcome, so its answer is a third opinion the dashboard can grade with the
same yardstick as the two production scorers.

The results go to data/derived/jev_scores.csv, which is committed, so the app, the tests and
the demo never need an API key. The script is resumable: rows already in the file are skipped.

    TYPESAFE_API_KEY=... python -m scripts.score_with_jev [--limit N] [--workers 8]

The key is read from the environment or from the repo-root .env.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
OUTPUT = DATA_DIR / "derived" / "jev_scores.csv"
ENDPOINT = "https://api.typesafe.ai/v1/systemone"

QUESTION = {
    "moves_forward": {
        "type": "noul",
        "instructions": (
            "The recruiter moves this applicant forward to an interview or a hire for this job."
        ),
    }
}


def load_rows() -> list[dict[str, str]]:
    """Decided applications joined to their job and candidate, straight from the CSVs."""

    def read(name: str) -> list[dict[str, str]]:
        with (DATA_DIR / name).open(newline="", encoding="utf-8") as handle:
            return list(csv.DictReader(handle))

    jobs = {row["job_id"]: row for row in read("jobs.csv")}
    candidates = {row["candidate_id"]: row for row in read("candidates.csv")}
    rows = []
    for application in read("applications.csv"):
        if not application["recruiter_decision"]:
            continue
        job, candidate = jobs[application["job_id"]], candidates[application["candidate_id"]]
        rows.append({**application, **{f"job_{k}": v for k, v in job.items()}, **candidate})
    return rows


def build_request(row: dict[str, str], model: str) -> dict:
    """The state is the application's facts only: no scores, no decision, no identifiers."""
    state = {
        "job": {
            "family": row["job_job_family"],
            "seniority": row["job_seniority"],
            "country": row["job_country"],
        },
        "candidate": {
            "country": row["country"],
            "years_experience": int(row["years_experience"]),
            "preferred_job_family": row["preferred_job_family"],
            "profile_completeness": float(row["profile_completeness"]),
        },
    }
    return {"model": model, "state": json.dumps(state), "questions": QUESTION}


def parse_probability(response: dict) -> tuple[float, str]:
    answer = response["answers"]["moves_forward"]
    probability = float(answer["noul"])
    if not 0 <= probability <= 1:
        raise ValueError(f"probability out of range: {probability}")
    return probability, response["model"]


def call(payload: dict, key: str, attempts: int = 5) -> dict:
    body = json.dumps(payload).encode()
    for attempt in range(attempts):
        request = urllib.request.Request(
            ENDPOINT,
            data=body,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Back off on rate limits and server errors; anything else is a real problem.
            if error.code != 429 and error.code < 500 or attempt == attempts - 1:
                raise
        except urllib.error.URLError:
            if attempt == attempts - 1:
                raise
        time.sleep(2**attempt)
    raise RuntimeError("unreachable")


def api_key() -> str:
    key = os.environ.get("TYPESAFE_API_KEY")
    env_file = REPO_ROOT / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "TYPESAFE_API_KEY":
                key = value.strip().strip("\"'")
    if not key:
        sys.exit("Set TYPESAFE_API_KEY in the environment or in .env first.")
    return key


def main() -> None:
    parser = argparse.ArgumentParser(description="Score decided applications with Jev.")
    parser.add_argument("--model", default="jev-latest", help="the response records the version")
    parser.add_argument("--limit", type=int, help="stop after this many new rows")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    key = api_key()

    done = set()
    if OUTPUT.exists():
        with OUTPUT.open(newline="") as handle:
            done = {row["application_id"] for row in csv.DictReader(handle)}
    todo = [row for row in load_rows() if row["application_id"] not in done][: args.limit]
    print(f"{len(done)} already scored, {len(todo)} to go")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    new_file = not OUTPUT.exists()
    with OUTPUT.open("a", newline="") as handle, ThreadPoolExecutor(args.workers) as pool:
        writer = csv.writer(handle)
        if new_file:
            writer.writerow(["application_id", "probability", "model", "scored_at"])
        futures = {pool.submit(call, build_request(row, args.model), key): row for row in todo}
        for count, future in enumerate(as_completed(futures), start=1):
            probability, model = parse_probability(future.result())
            scored_at = datetime.now(UTC).isoformat(timespec="seconds")
            writer.writerow(
                [futures[future]["application_id"], f"{probability:.4f}", model, scored_at]
            )
            if count % 250 == 0:
                handle.flush()
                print(f"{count}/{len(todo)}")
    print(f"Done. Results in {OUTPUT.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
