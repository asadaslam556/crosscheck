"""End-to-end checks against a real PostgreSQL, loaded from the four CSVs.

Every number asserted here is quoted somewhere in README.md or ANALYSIS.md, so a change that
moves one of them fails here before it reaches the write-up.

These tests drop and reload every table at DATABASE_URL, so they only run when asked for:

    DATABASE_URL=postgresql+psycopg://mqi:mqi@localhost:5433/mqi pytest -m integration
"""

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.metrics.queries import DIMENSIONS
from scripts import load_data

pytestmark = pytest.mark.integration


def about(value, tolerance=5e-4):
    """Rates and AUCs are quoted to three decimals, mean scores to one (tolerance 0.05)."""
    return pytest.approx(value, abs=tolerance)


@pytest.fixture(scope="module")
def api():
    try:
        psycopg.connect(settings.libpq_url, connect_timeout=3).close()
    except psycopg.OperationalError:
        pytest.skip(f"no database reachable at {settings.database_url}")
    load_data.main()
    with TestClient(app) as client:
        yield client


def get(api, path, **params):
    response = api.get(f"/api/{path}", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def segments(api, dimension):
    return {row["segment"]: row for row in get(api, "segments", dimension=dimension)["segments"]}


def test_health_sees_every_table(api):
    assert get(api, "health")["tables"] == {
        "candidates": 1500,
        "jobs": 80,
        "applications": 6000,
        "recruiter_events": 11758,
    }


def test_overview_counts(api):
    counts = get(api, "overview")["counts"]
    assert (counts["total_applications"], counts["decided"], counts["pending"]) == (6000, 5496, 504)


def test_pooled_verdict_favours_the_llm(api):
    pooled = get(api, "overview")["pooled"]
    assert pooled["rule"] == about(0.689)
    assert pooled["llm"] == about(0.724)


def test_verdict_flips_without_healthcare(api):
    without = get(api, "overview")["excluding_healthcare"]
    assert without["rule"] == about(0.782)
    assert without["llm"] == about(0.729)


def test_quality_gate_matches_the_analysis(api):
    gate = get(api, "quality-gate")
    assert gate["status"] == "warn"
    assert (gate["baseline_version"], gate["current_version"]) == ("scorer-v1", "scorer-v2")
    assert gate["llm_psi"] == about(0.196)
    assert gate["rule_psi_control"] == about(0.004)
    assert gate["mean_llm_score"]["baseline"] == about(60.8, 0.05)
    assert gate["mean_llm_score"]["current"] == about(68.5, 0.05)
    assert gate["flag_rate_at_threshold"]["baseline"] == about(0.296)
    assert gate["flag_rate_at_threshold"]["current"] == about(0.493)


def test_healthcare_is_bucketed_low_everywhere(api):
    healthcare = segments(api, "job_family")["Healthcare"]
    assert healthcare["applications"] == 1363
    assert healthcare["low_fit_rate"] == 1.0
    assert healthcare["mean_rule_score"] == about(0.141)


@pytest.mark.parametrize(
    "family, rule_auc, llm_auc",
    [
        ("Healthcare", 0.702, 0.707),
        ("IT", 0.755, 0.692),
        ("Logistics", 0.791, 0.747),
        ("Manufacturing", 0.768, 0.706),
        ("Office & Admin", 0.798, 0.743),
    ],
)
def test_per_family_auc(api, family, rule_auc, llm_auc):
    row = segments(api, "job_family")[family]
    assert row["rule_auc"] == about(rule_auc)
    assert row["llm_auc"] == about(llm_auc)


def test_austria_gets_a_higher_llm_score(api):
    by_country = segments(api, "country")
    assert by_country["AT"]["mean_llm_score"] == about(69.0, 0.05)
    assert by_country["DE"]["mean_llm_score"] == about(62.6, 0.05)
    assert by_country["AT"]["positive_rate"] == about(0.536)
    assert by_country["DE"]["positive_rate"] == about(0.519)


def test_thin_profiles_score_highest(api):
    bands = segments(api, "profile_band")
    thin = bands.pop("thin (<0.4)")["mean_llm_score"]
    assert thin == about(73.8, 0.05)
    assert all(thin - band["mean_llm_score"] > 10 for band in bands.values())


def test_agreement_rate(api):
    assert get(api, "agreement")["agreement_rate"] == about(0.659)
    without = get(api, "agreement", exclude_family="Healthcare")
    assert without["agreement_rate"] == about(0.743)


def test_shortlisting_leaks_the_outcome(api):
    funnel = get(api, "recruiter-behaviour")["funnel"]
    assert funnel["shortlisted"] == 2467
    assert funnel["positive_rate_when_shortlisted"] == 1.0
    assert funnel["no_events"] == 109


def test_ai_panel_engagement_drops_in_january(api):
    monthly = {row["month"][:7]: row for row in get(api, "recruiter-behaviour")["monthly"]}
    assert monthly["2025-12"]["ai_score_viewed_rate"] > 0.70
    assert monthly["2026-01"]["ai_score_viewed_rate"] < 0.60


@pytest.mark.parametrize("dimension", sorted(DIMENSIONS))
def test_every_dimension_renders(api, dimension):
    assert get(api, "segments", dimension=dimension)["segments"]


@pytest.mark.parametrize("scorer", ["llm", "rule"])
def test_calibration_serves_both_scorers(api, scorer):
    assert get(api, "calibration", scorer=scorer)["bands"]
