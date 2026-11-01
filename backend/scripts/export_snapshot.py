"""Write every API response the dashboard uses to JSON files, for the static demo.

The data never changes, so the hosted demo needs no server: the frontend built with
VITE_DATA_MODE=static reads these files instead of calling the API. Responses come from the
real routes through FastAPI's test client, so a file is byte for byte what the API returns.

    python -m scripts.export_snapshot [output_dir]   # default: ../frontend/public/data

File names must match snapshotPath() in frontend/src/lib/api.ts: the endpoint, then each
parameter as __name-value, sorted by name.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data"

NO_PARAMS: dict[str, str] = {}
HEALTHCARE_OUT = {"exclude_family": "Healthcare"}

REQUESTS: list[tuple[str, dict[str, str]]] = [
    ("health", NO_PARAMS),
    ("overview", NO_PARAMS),
    ("within-job", NO_PARAMS),
    ("recruiter-behaviour", NO_PARAMS),
    ("quality-gate", NO_PARAMS),
    ("drift", NO_PARAMS),
    ("data-quality", NO_PARAMS),
    ("third-opinion", NO_PARAMS),
    ("effectiveness", NO_PARAMS),
    ("effectiveness", HEALTHCARE_OUT),
    ("effectiveness", {"rescale_family": "Healthcare"}),
    ("agreement", NO_PARAMS),
    ("agreement", HEALTHCARE_OUT),
    ("threshold-sweep", {"scorer": "llm"}),
    ("threshold-sweep", {"scorer": "rule"}),
    *[
        ("calibration", {"scorer": scorer, **extra})
        for scorer in ("llm", "rule")
        for extra in (NO_PARAMS, HEALTHCARE_OUT)
    ],
    *[
        ("segments", {"dimension": dimension})
        for dimension in (
            "job_family",
            "country",
            "seniority",
            "model_version",
            "profile_band",
            "completeness_decile",
        )
    ],
    ("segments", {"dimension": "country", "by": "model_version"}),
    ("segments", {"dimension": "country", "by": "profile_band"}),
]


def snapshot_name(path: str, params: dict[str, str]) -> str:
    suffix = "".join(f"__{key}-{params[key]}" for key in sorted(params))
    return f"{path}{suffix}.json"


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
    output.mkdir(parents=True, exist_ok=True)
    with TestClient(app) as client:
        for path, params in REQUESTS:
            response = client.get(f"/api/{path}", params=params)
            response.raise_for_status()
            target = output / snapshot_name(path, params)
            target.write_text(json.dumps(response.json(), separators=(",", ":")))
            print(f"{target.name:<55} {target.stat().st_size:>8,} bytes")
    print(f"Wrote {len(REQUESTS)} files to {output}")


if __name__ == "__main__":
    main()
