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


def test_within_job_ranking_favours_the_rule_scorer(api):
    result = get(api, "within-job")
    assert result["jobs"] == 80
    assert result["rule"]["mean"] == about(0.759)
    assert result["llm"]["mean"] == about(0.724)


def test_verdict_has_four_views_and_only_pooled_favours_the_llm(api):
    verdict = {view["key"]: view for view in get(api, "overview")["verdict"]}
    assert list(verdict) == ["pooled", "excluding_healthcare", "within_job", "after_fix"]
    assert [view["rule"] > view["llm"] for view in verdict.values()] == [False, True, True, True]


def test_healthcare_rescale_restores_the_rule_scorer(api):
    result = get(api, "effectiveness", rescale_family="Healthcare")
    assert result["rescale_factor"] == about(4.06, 0.005)
    assert result["rule"]["auc"] == about(0.762)
    # ANALYSIS: 772 of the 1,239 decided Healthcare applications leave "low", converting at 62.6%.
    assert result["rescale_effect"]["decided"] == 1239
    assert result["rescale_effect"]["moved_out_of_low"] == 772
    assert result["rescale_effect"]["moved_positive_rate"] == about(0.626)


def test_rule_beats_llm_significantly_without_healthcare(api):
    comparison = get(api, "effectiveness", exclude_family="Healthcare")["comparison"]
    assert comparison["difference"] == about(0.053, 0.001)
    assert comparison["interval"][0] > 0


def test_threshold_78_restores_the_v1_flag_rate(api):
    curves = {c["version"]: c["points"] for c in get(api, "threshold-sweep")["versions"]}
    assert list(curves) == ["scorer-v1", "scorer-v2"]
    assert curves["scorer-v1"][70]["flagged_rate"] == about(0.296)
    assert curves["scorer-v2"][78]["flagged_rate"] == about(0.294)
    assert curves["scorer-v2"][78]["precision"] == about(0.780)


def test_disagreement_triage(api):
    triage = get(api, "agreement")["triage"]
    assert triage["disagreements"] == 1872
    cases = {cause["cause"]: cause["cases"] for cause in triage["causes"]}
    assert cases == {
        "healthcare_rule_scale": 651,
        "thin_profile_inflation": 167,
        "austria_bonus": 74,
        "v2_inflation": 54,
        "unexplained": 926,
    }


def test_drift_steps_up_when_v2_ships(api):
    months = {m["month"]: m for m in get(api, "drift")["months"]}
    assert months["2026-02"]["llm_psi"] < 0.10 < months["2026-03"]["llm_psi"]
    assert all(m["rule_psi"] < 0.10 for m in months.values())


def test_data_quality_checks(api):
    facts = get(api, "data-quality")["facts"]
    assert facts["duplicate_pairs"] == 243
    assert facts["without_events"] == 109
    assert (facts["ties_at_half"], facts["ties_bucketed_low"]) == (12, 2)
    assert facts["cross_border"] == 339
    assert facts["idle_candidates"] == 33
    assert facts["pending_rate_min"] == about(0.075, 0.001)
    assert facts["pending_rate_max"] == about(0.091, 0.001)


def test_completeness_deciles_show_the_cliff_at_point_four(api):
    deciles = segments(api, "completeness_decile")
    assert deciles["0.3"]["mean_llm_score"] - deciles["0.4"]["mean_llm_score"] > 10


def test_country_by_version_crosstab(api):
    rows = get(api, "segments", dimension="country", by="model_version")["segments"]
    means = {(r["segment"], r["subsegment"]): r["mean_llm_score"] for r in rows}
    assert means[("AT", "scorer-v1")] == about(65.4, 0.05)
    assert means[("DE", "scorer-v1")] == about(59.0, 0.05)
