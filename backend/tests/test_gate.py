import pytest

from app.gate import exit_code, report

WARN = {
    "status": "warn",
    "baseline_version": "scorer-v1",
    "current_version": "scorer-v2",
    "llm_psi": 0.196,
    "rule_psi_control": 0.004,
    "warn_at": 0.10,
    "fail_at": 0.25,
    "mean_llm_score": {"baseline": 60.8, "current": 68.5},
    "flag_rate_at_threshold": {"threshold": 70, "baseline": 0.296, "current": 0.493},
}


@pytest.mark.parametrize(
    "status, strict, expected",
    [
        ("pass", False, 0),
        ("warn", False, 0),
        ("warn", True, 1),
        ("fail", False, 1),
        ("skipped", True, 0),
    ],
)
def test_exit_code(status, strict, expected):
    assert exit_code(status, strict) == expected


def test_report_reads_like_the_analysis():
    text = report(WARN)
    assert text.startswith("**Release gate: WARN** (scorer-v1 to scorer-v2)")
    assert "| LLM score PSI | 0.196 (warn at 0.10, fail at 0.25) |" in text
    assert "| Flagged at 70 | 29.6% to 49.3% |" in text


def test_skipped_report_gives_the_reason():
    assert "fewer than two" in report({"status": "skipped", "reason": "fewer than two versions"})
