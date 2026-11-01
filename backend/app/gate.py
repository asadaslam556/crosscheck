"""Release gate from the command line, for a pipeline step.

    python -m app.gate            # fails (exit 1) only when the gate fails
    python -m app.gate --strict   # also fails on a warning

Prints the report as Markdown, so CI can append it to the job summary as is.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from app.db import SessionFactory
from app.metrics import service


def exit_code(status: str, strict: bool) -> int:
    if status == "fail" or (strict and status == "warn"):
        return 1
    return 0


def report(gate: dict[str, Any]) -> str:
    if gate["status"] == "skipped":
        return f"**Release gate: SKIPPED.** {gate.get('reason', '')}"

    flags = gate["flag_rate_at_threshold"]
    means = gate["mean_llm_score"]
    return "\n".join(
        [
            f"**Release gate: {gate['status'].upper()}** "
            f"({gate['baseline_version']} to {gate['current_version']})",
            "",
            "| | Value |",
            "|---|---|",
            f"| LLM score PSI | {gate['llm_psi']:.3f} "
            f"(warn at {gate['warn_at']:.2f}, fail at {gate['fail_at']:.2f}) |",
            f"| Rule score PSI, the control | {gate['rule_psi_control']:.3f} |",
            f"| Mean LLM score | {means['baseline']:.1f} to {means['current']:.1f} |",
            f"| Flagged at {flags['threshold']} | "
            f"{flags['baseline']:.1%} to {flags['current']:.1%} |",
        ]
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check the latest scorer release for drift.")
    parser.add_argument("--strict", action="store_true", help="treat a warning as a failure")
    args = parser.parse_args(argv)

    with SessionFactory() as session:
        gate = service.quality_gate(session)
    print(report(gate))
    return exit_code(gate["status"], args.strict)


if __name__ == "__main__":
    sys.exit(main())
