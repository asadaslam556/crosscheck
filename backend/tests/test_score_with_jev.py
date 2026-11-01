import json

import pytest

from scripts.score_with_jev import build_request, load_rows, parse_probability


def test_only_decided_applications_are_sent():
    rows = load_rows()
    assert len(rows) == 5496
    assert all(row["recruiter_decision"] for row in rows)


def test_the_request_never_leaks_scores_or_the_outcome():
    row = load_rows()[0]
    payload = build_request(row, "jev-latest")
    state = payload["state"]
    for leaked in (row["rule_score"], row["llm_score"], row["recruiter_decision"], "score"):
        assert leaked not in state
    assert json.loads(state)["candidate"]["profile_completeness"] == float(
        row["profile_completeness"]
    )
    assert payload["questions"]["moves_forward"]["type"] == "noul"


def test_parse_probability_reads_the_noul_answer():
    response = {"model": "jev-1.13.0", "answers": {"moves_forward": {"type": "noul", "noul": 0.71}}}
    assert parse_probability(response) == (0.71, "jev-1.13.0")


def test_parse_probability_rejects_nonsense():
    with pytest.raises(ValueError):
        parse_probability({"model": "jev", "answers": {"moves_forward": {"noul": 1.4}}})
