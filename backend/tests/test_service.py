"""Tests for the domain layer in service.py.

These stub out the SQL so the composition logic is tested on its own: which scorer wins a
disagreement, how small segments are flagged, and where the quality gate draws its lines.
The SQL itself is exercised separately by running the API against a loaded database.
"""

import pytest

from app.metrics import queries, service


@pytest.fixture
def stub_queries(monkeypatch):
    """Replace queries.run / run_one with canned rows keyed by query name."""
    rows: dict[str, list[dict]] = {}

    def fake_run(session, name, dimension=None, **params):
        return rows.get(name, [])

    def fake_run_one(session, name, **params):
        result = rows.get(name, [])
        return result[0] if result else {}

    monkeypatch.setattr(service.queries, "run", fake_run)
    monkeypatch.setattr(service.queries, "run_one", fake_run_one)
    return rows


def quadrant(name, decided, positives):
    return {
        "quadrant": name,
        "decided": decided,
        "positives": positives,
        "positive_rate": positives / decided,
    }


class TestResolveDimension:
    def test_accepts_a_known_dimension(self):
        assert queries.resolve_dimension("job_family") == "job_family"

    def test_country_maps_to_the_job_side(self):
        assert queries.resolve_dimension("country") == "job_country"

    def test_overall_is_a_sql_literal_not_a_column(self):
        assert queries.resolve_dimension("overall") == "'overall'"

    def test_rejects_anything_outside_the_whitelist(self):
        # The dimension is interpolated into SQL text, so this rejection is the thing
        # standing between a query parameter and the query itself.
        with pytest.raises(ValueError):
            queries.resolve_dimension("job_family; DROP TABLE applications")


class TestHealth:
    def test_reports_table_counts(self, stub_queries):
        stub_queries["table_counts"] = [
            {"candidates": 1500, "jobs": 80, "applications": 6000, "recruiter_events": 11758}
        ]
        result = service.health(None)
        assert result["status"] == "ok"
        assert result["tables"]["applications"] == 6000


class TestAgreement:
    def test_rule_wins_when_its_solo_calls_convert_better(self, stub_queries):
        stub_queries["disagreement_outcomes"] = [
            quadrant("both_high", 100, 75),
            quadrant("both_low", 100, 27),
            quadrant("rule_high_llm_low", 100, 61),
            quadrant("llm_high_rule_low", 100, 44),
        ]
        result = service.agreement(None)
        assert result["winner_on_disagreement"] == "rule"

    def test_llm_wins_when_the_comparison_reverses(self, stub_queries):
        stub_queries["disagreement_outcomes"] = [
            quadrant("rule_high_llm_low", 100, 40),
            quadrant("llm_high_rule_low", 100, 60),
        ]
        assert service.agreement(None)["winner_on_disagreement"] == "llm"

    def test_agreement_rate_counts_only_the_matching_quadrants(self, stub_queries):
        stub_queries["disagreement_outcomes"] = [
            quadrant("both_high", 300, 200),
            quadrant("both_low", 300, 50),
            quadrant("rule_high_llm_low", 200, 100),
            quadrant("llm_high_rule_low", 200, 100),
        ]
        assert service.agreement(None)["agreement_rate"] == pytest.approx(0.6)

    def test_missing_quadrant_yields_no_winner_rather_than_a_crash(self, stub_queries):
        stub_queries["disagreement_outcomes"] = [quadrant("both_high", 10, 5)]
        assert service.agreement(None)["winner_on_disagreement"] is None


class TestSegments:
    def test_flags_segments_below_the_minimum_size(self, stub_queries):
        stub_queries["segment_metrics"] = [
            {"segment": "IT", "applications": 800, "decided": 729, "positives": 377},
            {"segment": "Niche", "applications": 12, "decided": 10, "positives": 6},
        ]
        stub_queries["labeled_scores"] = []

        by_name = {row["segment"]: row for row in service.segments(None, "job_family")["segments"]}
        assert by_name["IT"]["is_small_sample"] is False
        assert by_name["Niche"]["is_small_sample"] is True

    def test_positive_rate_carries_a_confidence_interval(self, stub_queries):
        stub_queries["segment_metrics"] = [{"segment": "IT", "decided": 100, "positives": 50}]
        stub_queries["labeled_scores"] = []

        segment = service.segments(None, "job_family")["segments"][0]
        low, high = segment["positive_rate_ci"]
        assert low < segment["positive_rate"] < high

    def test_auc_is_none_when_a_segment_has_a_single_outcome(self, stub_queries):
        stub_queries["segment_metrics"] = [{"segment": "AT", "decided": 3, "positives": 3}]
        stub_queries["labeled_scores"] = [
            {"segment": "AT", "label": 1, "rule_score": 0.4, "llm_score": 60},
            {"segment": "AT", "label": 1, "rule_score": 0.6, "llm_score": 70},
            {"segment": "AT", "label": 1, "rule_score": 0.8, "llm_score": 80},
        ]
        segment = service.segments(None, "country")["segments"][0]
        assert segment["rule_auc"] is None
        assert segment["llm_auc"] is None

    def test_a_segment_with_no_decisions_reports_no_positive_rate(self, stub_queries):
        stub_queries["segment_metrics"] = [{"segment": "Empty", "decided": 0, "positives": 0}]
        stub_queries["labeled_scores"] = []
        assert service.segments(None, "job_family")["segments"][0]["positive_rate"] is None


class TestQualityGate:
    # When each version first scored an application. The gate orders versions by this.
    RELEASED = {
        "scorer-v1": "2025-09-01",
        "scorer-v2": "2026-03-01",
        "scorer-v3": "2026-05-01",
        "scorer-v10": "2026-05-01",
    }

    @classmethod
    def version_rows(cls, version, llm_scores, rule_score=0.5):
        return [
            {
                "llm_model_version": version,
                "llm_score": score,
                "rule_score": rule_score,
                "created_at": cls.RELEASED[version],
            }
            for score in llm_scores
        ]

    def test_identical_versions_pass(self, stub_queries):
        scores = [30, 45, 55, 65, 75, 85, 95] * 20
        stub_queries["version_scores"] = self.version_rows("scorer-v1", scores) + self.version_rows(
            "scorer-v2", scores
        )
        result = service.quality_gate(None)
        assert result["status"] == "pass"
        assert result["llm_psi"] == pytest.approx(0.0)

    def test_a_large_upward_shift_fails_the_gate(self, stub_queries):
        stub_queries["version_scores"] = self.version_rows(
            "scorer-v1", [30, 35, 40, 45] * 50
        ) + self.version_rows("scorer-v2", [80, 85, 90, 95] * 50)
        result = service.quality_gate(None)
        assert result["status"] == "fail"
        assert result["llm_psi"] >= service.PSI_FAIL

    def test_compares_the_two_most_recent_versions(self, stub_queries):
        stub_queries["version_scores"] = (
            self.version_rows("scorer-v1", [10] * 50)
            + self.version_rows("scorer-v2", [50] * 50)
            + self.version_rows("scorer-v3", [90] * 50)
        )
        result = service.quality_gate(None)
        assert result["baseline_version"] == "scorer-v2"
        assert result["current_version"] == "scorer-v3"

    def test_orders_versions_by_release_date_not_name(self, stub_queries):
        # As text, "scorer-v10" sorts before "scorer-v2".
        stub_queries["version_scores"] = (
            self.version_rows("scorer-v10", [90] * 50)
            + self.version_rows("scorer-v1", [10] * 50)
            + self.version_rows("scorer-v2", [50] * 50)
        )
        result = service.quality_gate(None)
        assert result["baseline_version"] == "scorer-v2"
        assert result["current_version"] == "scorer-v10"

    def test_reports_the_flag_rate_shift_at_the_product_threshold(self, stub_queries):
        # Every v2 score clears the flag threshold, none of the v1 scores do.
        stub_queries["version_scores"] = self.version_rows(
            "scorer-v1", [50] * 100
        ) + self.version_rows("scorer-v2", [90] * 100)
        rates = service.quality_gate(None)["flag_rate_at_threshold"]
        assert rates["baseline"] == 0.0
        assert rates["current"] == 1.0

    def test_skips_when_only_one_version_has_ever_shipped(self, stub_queries):
        stub_queries["version_scores"] = self.version_rows("scorer-v1", [60] * 10)
        assert service.quality_gate(None)["status"] == "skipped"


class TestCalibration:
    def test_rejects_an_unknown_scorer(self, stub_queries):
        with pytest.raises(ValueError):
            service.calibration(None, scorer="astrology")

    def test_labels_bands_on_a_zero_to_hundred_axis(self, stub_queries):
        stub_queries["calibration"] = [
            {"llm_model_version": "scorer-v1", "band": 7, "decided": 100, "positives": 71}
        ]
        band = service.calibration(None, scorer="llm")["bands"][0]
        assert band["band_label"] == "60-70"


def case(**overrides):
    base = {
        "application_id": "A1",
        "job_family": "IT",
        "job_country": "DE",
        "llm_model_version": "scorer-v1",
        "profile_completeness": 0.8,
        "rule_high": True,
        "llm_high": False,
        "label": 1,
    }
    return {**base, **overrides}


class TestTriage:
    def test_healthcare_with_a_low_rule_score_is_the_scale_bug(self):
        assert service.triage_cause(
            case(job_family="Healthcare", rule_high=False, llm_high=True)
        ) == ("healthcare_rule_scale")

    def test_rules_are_checked_in_order(self):
        # Thin profile and Austrian job both fit; the thin-profile rule comes first.
        thin_austrian = case(
            rule_high=False, llm_high=True, profile_completeness=0.2, job_country="AT"
        )
        assert service.triage_cause(thin_austrian) == "thin_profile_inflation"

    def test_llm_rules_need_the_llm_to_be_the_positive_one(self):
        # The rule scorer liked this one, so an LLM bias cannot explain it.
        assert (
            service.triage_cause(case(job_country="AT", profile_completeness=0.1)) == "unexplained"
        )

    def test_counts_which_scorer_was_right(self):
        result = service.triage(
            [
                case(job_family="Healthcare", rule_high=False, llm_high=True, label=1),
                case(job_family="Healthcare", rule_high=False, llm_high=True, label=0),
                case(label=1),
            ]
        )
        causes = {c["cause"]: c for c in result["causes"]}
        assert result["disagreements"] == 3
        assert causes["healthcare_rule_scale"]["cases"] == 2
        assert causes["healthcare_rule_scale"]["rule_right_rate"] == 0.5
        assert causes["unexplained"]["rule_right_rate"] == 1.0
        assert causes["austria_bonus"]["positive_rate"] is None
