"""The domain layer: turns query rows plus statistics into the metrics the API returns.

Routes stay thin and do no arithmetic. Everything below reads from queries.py and computes
with compute.py, which keeps the SQL and the statistics independently testable.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.metrics import queries
from app.metrics.compute import (
    MIN_SEGMENT_SIZE,
    auc_interval,
    compare_aucs,
    mean_interval,
    population_stability_index,
    precision_at_k,
    precision_recall_at_threshold,
    roc_auc,
    threshold_sweep,
    wilson_interval,
)

HEALTHCARE = "Healthcare"

# Where the ranked-queue metrics are cut. A recruiter realistically works through the top
# of a shortlist, not the whole population, so precision is reported at those depths.
TOP_K_DEPTHS = (100, 250, 500, 1000)

# Bin edges for the drift comparison. Fixed rather than quantile-based, because a gate that
# re-derives its own bins from the new release cannot detect a shift in the new release.
LLM_PSI_EDGES = (0, 40, 50, 60, 70, 80, 90, 101)
RULE_PSI_EDGES = (0, 0.2, 0.35, 0.5, 0.65, 0.8, 1.01)

PSI_WARN = 0.10
PSI_FAIL = 0.25


def _scorer_metrics(labels: list[int], scores: list[float], threshold: float) -> dict[str, Any]:
    return {
        "n": len(labels),
        "auc": roc_auc(labels, scores),
        "auc_ci": _interval(auc_interval(labels, scores)),
        "at_threshold": precision_recall_at_threshold(labels, scores, threshold),
        "precision_at_k": {str(k): precision_at_k(labels, scores, k) for k in TOP_K_DEPTHS},
    }


def _interval(pair: tuple[float, float] | None) -> list[float] | None:
    return list(pair) if pair else None


def health(session: Session) -> dict[str, Any]:
    return {"status": "ok", "tables": queries.run_one(session, "table_counts")}


def overview(session: Session) -> dict[str, Any]:
    counts = queries.run_one(session, "overview")
    pooled = effectiveness(session)
    without_healthcare = effectiveness(session, exclude_family=HEALTHCARE)
    after_fix = effectiveness(session, rescale_family=HEALTHCARE)
    per_job = within_job(session)

    def view(key: str, label: str, result: dict[str, Any]) -> dict[str, Any]:
        return {
            "key": key,
            "label": label,
            "rule": result["rule"]["auc"],
            "llm": result["llm"]["auc"],
            "rule_ci": result["rule"]["auc_ci"],
            "llm_ci": result["llm"]["auc_ci"],
            "n": result["rule"]["n"],
            "comparison": result["comparison"],
        }

    return {
        "counts": counts,
        "pooled": _auc_pair(pooled),
        "excluding_healthcare": _auc_pair(without_healthcare),
        # The same question asked four ways. Only the pooled number favours the LLM.
        "verdict": [
            view("pooled", "All job families", pooled),
            view("excluding_healthcare", "Excluding Healthcare", without_healthcare),
            {
                "key": "within_job",
                "label": "Within each job",
                "rule": per_job["rule"]["mean"],
                "llm": per_job["llm"]["mean"],
                "rule_ci": per_job["rule"]["interval"],
                "llm_ci": per_job["llm"]["interval"],
                "n": per_job["jobs"],
                "comparison": None,
            },
            view("after_fix", "After the Healthcare fix", after_fix),
        ],
        "quality_gate": quality_gate(session),
    }


def _auc_pair(result: dict[str, Any]) -> dict[str, Any]:
    return {"rule": result["rule"]["auc"], "llm": result["llm"]["auc"], "n": result["rule"]["n"]}


def rescale_factor(session: Session, family: str) -> float | None:
    """How far one family's rule scores sit below everyone else's: the ratio of the means.

    Weighted by applications, over everything scored. Descriptive, not a patch: it is what the
    Healthcare normalisation bug looks like from the outside.
    """
    rows = queries.run(session, "segment_metrics", dimension="job_family")
    inside = [row for row in rows if row["segment"] == family]
    outside = [row for row in rows if row["segment"] != family]
    if not inside or not outside or not inside[0]["mean_rule_score"]:
        return None
    total = sum(row["applications"] for row in outside)
    others = sum(row["mean_rule_score"] * row["applications"] for row in outside) / total
    return others / inside[0]["mean_rule_score"]


def effectiveness(
    session: Session,
    exclude_family: str | None = None,
    rescale_family: str | None = None,
) -> dict[str, Any]:
    rows = queries.run(
        session, "labeled_scores", dimension="overall", exclude_family=exclude_family
    )
    labels = [row["label"] for row in rows]
    rule_scores = [row["rule_score"] for row in rows]
    llm_scores = [row["llm_score"] for row in rows]

    factor = rescale_factor(session, rescale_family) if rescale_family else None
    if factor:
        rule_scores = [
            min(score * factor, 1.0) if row["job_family"] == rescale_family else score
            for row, score in zip(rows, rule_scores, strict=True)
        ]

    return {
        "excluded_job_family": exclude_family,
        "rescaled_job_family": rescale_family if factor else None,
        "rescale_factor": factor,
        "distribution_by_decision": queries.run(
            session, "score_distribution", exclude_family=exclude_family
        ),
        "rule": _scorer_metrics(labels, rule_scores, threshold=0.5),
        "llm": _scorer_metrics(labels, llm_scores, threshold=settings.llm_flag_threshold),
        # Rule minus LLM with a paired DeLong interval. Positive: the rule scorer ranks better.
        "comparison": compare_aucs(labels, rule_scores, llm_scores),
    }


def within_job(session: Session) -> dict[str, Any]:
    """Ranking quality inside each job posting, which is how recruiters meet the scores.

    A recruiter compares candidates for one job, never across jobs, so a scale problem that only
    hits one job family cannot hurt them here. Jobs with a single outcome class are skipped.
    """
    rows = queries.run(session, "labeled_scores", dimension="overall", exclude_family=None)
    by_job: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_job[row["job_id"]].append(row)

    jobs = []
    for job_id, group in sorted(by_job.items()):
        labels = [row["label"] for row in group]
        rule_auc = roc_auc(labels, [row["rule_score"] for row in group])
        llm_auc = roc_auc(labels, [row["llm_score"] for row in group])
        if rule_auc is not None and llm_auc is not None:
            jobs.append(
                {
                    "job_id": job_id,
                    "job_family": group[0]["job_family"],
                    "decided": len(group),
                    "rule_auc": rule_auc,
                    "llm_auc": llm_auc,
                }
            )

    def summary(scorer: str, subset: list[dict[str, Any]]) -> dict[str, Any]:
        values = [job[f"{scorer}_auc"] for job in subset]
        result = mean_interval(values)
        return {
            "mean": result[0] if result else None,
            "interval": list(result[1]) if result else None,
            "median": float(sorted(values)[len(values) // 2]) if values else None,
        }

    families = sorted({job["job_family"] for job in jobs})
    return {
        "jobs": len(jobs),
        "rule": summary("rule", jobs),
        "llm": summary("llm", jobs),
        "rule_wins": sum(job["rule_auc"] > job["llm_auc"] for job in jobs),
        "by_family": [
            {
                "job_family": family,
                "jobs": len(subset),
                "rule": summary("rule", subset),
                "llm": summary("llm", subset),
            }
            for family in families
            for subset in [[job for job in jobs if job["job_family"] == family]]
        ],
        "per_job": jobs,
    }


def agreement(session: Session, exclude_family: str | None = None) -> dict[str, Any]:
    quadrants = queries.run(session, "disagreement_outcomes", exclude_family=exclude_family)

    decided = sum(row["decided"] for row in quadrants)
    agreed = sum(
        row["decided"] for row in quadrants if row["quadrant"] in ("both_high", "both_low")
    )
    by_quadrant = {row["quadrant"]: row for row in quadrants}

    def rate(quadrant: str) -> float | None:
        row = by_quadrant.get(quadrant)
        return row["positive_rate"] if row else None

    rule_only = rate("rule_high_llm_low")
    llm_only = rate("llm_high_rule_low")

    return {
        "excluded_job_family": exclude_family,
        "quadrants": quadrants,
        "agreement_rate": agreed / decided if decided else None,
        # Which scorer to trust when only one of them is positive about an application.
        "winner_on_disagreement": (
            None
            if rule_only is None or llm_only is None
            else ("rule" if rule_only > llm_only else "llm" if llm_only > rule_only else "tie")
        ),
        "matrix": queries.run(session, "agreement_matrix"),
        "triage": triage(queries.run(session, "disagreement_cases", exclude_family=exclude_family)),
    }


# Known defects, in the order they are checked. The first one that fits a disagreement explains
# it. Each needs the scorer it blames to be the one that was positive about the application.
TRIAGE_CAUSES = (
    ("healthcare_rule_scale", "Healthcare rule scale bug"),
    ("thin_profile_inflation", "Thin-profile LLM inflation"),
    ("austria_bonus", "Austria LLM bonus"),
    ("v2_inflation", "v2 score inflation"),
    ("unexplained", "Unexplained"),
)


def triage_cause(case: dict[str, Any]) -> str:
    """Attribute one disagreement to a known defect. A heuristic, labelled as such in the UI."""
    if case["job_family"] == HEALTHCARE and not case["rule_high"]:
        return "healthcare_rule_scale"
    if case["llm_high"] and case["profile_completeness"] < 0.4:
        return "thin_profile_inflation"
    if case["llm_high"] and case["job_country"] == "AT":
        return "austria_bonus"
    if case["llm_high"] and case["llm_model_version"] == "scorer-v2":
        return "v2_inflation"
    return "unexplained"


def triage(cases: list[dict[str, Any]]) -> dict[str, Any]:
    """Split the disagreements by cause, and say which scorer turned out right in each group.

    In a disagreement exactly one scorer liked the application, so the rule scorer was right
    when it liked a hire or interview, or when it disliked a rejection.
    """
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for case in cases:
        grouped[triage_cause(case)].append(case)

    causes = []
    for key, label in TRIAGE_CAUSES:
        group = grouped.get(key, [])
        rule_right = sum(case["rule_high"] == bool(case["label"]) for case in group)
        positives = sum(case["label"] for case in group)
        causes.append(
            {
                "cause": key,
                "label": label,
                "cases": len(group),
                "share": len(group) / len(cases) if cases else None,
                "positive_rate": positives / len(group) if group else None,
                "rule_right_rate": rule_right / len(group) if group else None,
            }
        )
    return {"disagreements": len(cases), "causes": causes}


def segments(session: Session, dimension: str, by: str | None = None) -> dict[str, Any]:
    if by is not None and by == dimension:
        raise ValueError("by must differ from dimension")
    aggregates = queries.run(session, "segment_metrics", dimension=dimension, by=by)
    labelled = queries.run(
        session, "labeled_scores", dimension=dimension, by=by, exclude_family=None
    )

    def key(row: dict[str, Any]) -> tuple[str, str]:
        return str(row["segment"]), str(row.get("subsegment", "overall"))

    grouped: dict[tuple[str, str], dict[str, list]] = defaultdict(
        lambda: {"labels": [], "rule": [], "llm": []}
    )
    for row in labelled:
        bucket = grouped[key(row)]
        bucket["labels"].append(row["label"])
        bucket["rule"].append(row["rule_score"])
        bucket["llm"].append(row["llm_score"])

    results = []
    for row in aggregates:
        name, sub = key(row)
        bucket = grouped.get((name, sub), {"labels": [], "rule": [], "llm": []})
        decided, positives = row["decided"], row["positives"]

        results.append(
            {
                **row,
                "segment": name,
                "subsegment": sub,
                "positive_rate": positives / decided if decided else None,
                "positive_rate_ci": _interval(wilson_interval(positives, decided)),
                "rule_auc": roc_auc(bucket["labels"], bucket["rule"]),
                "llm_auc": roc_auc(bucket["labels"], bucket["llm"]),
                "rule_auc_ci": _interval(auc_interval(bucket["labels"], bucket["rule"])),
                "llm_auc_ci": _interval(auc_interval(bucket["labels"], bucket["llm"])),
                # Segments below this size are shown but flagged, so a reader does not act
                # on a difference that the confidence interval cannot support.
                "is_small_sample": decided < MIN_SEGMENT_SIZE,
            }
        )

    return {
        "dimension": dimension,
        "by": by,
        "segments": results,
        "min_segment_size": MIN_SEGMENT_SIZE,
    }


def calibration(session: Session, scorer: str, exclude_family: str | None = None) -> dict[str, Any]:
    if scorer not in ("llm", "rule"):
        raise ValueError("scorer must be 'llm' or 'rule'")

    rows = queries.run(session, "calibration", scorer=scorer, exclude_family=exclude_family)
    for row in rows:
        interval = wilson_interval(row["positives"], row["decided"])
        row["positive_rate_ci"] = list(interval) if interval else None
        row["band_label"] = f"{(row['band'] - 1) * 10}-{row['band'] * 10}"
        row["is_small_sample"] = row["decided"] < MIN_SEGMENT_SIZE

    return {"scorer": scorer, "excluded_job_family": exclude_family, "bands": rows}


def recruiter_behaviour(session: Session) -> dict[str, Any]:
    return {
        "monthly": queries.run(session, "recruiter_engagement_monthly"),
        "funnel": queries.run_one(session, "recruiter_funnel"),
    }


def quality_gate(session: Session) -> dict[str, Any]:
    """Post-release drift check, comparing the current scorer version against the previous one.

    The rule scorer runs alongside on the same applications and did not change, so it acts
    as a control: if both drift, the applicant population moved; if only the LLM drifts, the
    model did.
    """
    rows = queries.run(session, "version_scores")

    # Release order, not name order: sorting names would put "scorer-v10" before "scorer-v2".
    versions = _release_order(rows)
    if len(versions) < 2:
        return {"status": "skipped", "reason": "fewer than two model versions present"}

    baseline_version, current_version = versions[-2], versions[-1]
    baseline = [row for row in rows if row["llm_model_version"] == baseline_version]
    current = [row for row in rows if row["llm_model_version"] == current_version]

    llm_psi = population_stability_index(
        [row["llm_score"] for row in baseline], [row["llm_score"] for row in current], LLM_PSI_EDGES
    )
    rule_psi = population_stability_index(
        [row["rule_score"] for row in baseline],
        [row["rule_score"] for row in current],
        RULE_PSI_EDGES,
    )

    threshold = settings.llm_flag_threshold
    baseline_flagged = sum(row["llm_score"] >= threshold for row in baseline) / len(baseline)
    current_flagged = sum(row["llm_score"] >= threshold for row in current) / len(current)

    status = "fail" if llm_psi >= PSI_FAIL else "warn" if llm_psi >= PSI_WARN else "pass"

    return {
        "status": status,
        "baseline_version": baseline_version,
        "current_version": current_version,
        "llm_psi": llm_psi,
        "rule_psi_control": rule_psi,
        "warn_at": PSI_WARN,
        "fail_at": PSI_FAIL,
        "mean_llm_score": {
            "baseline": sum(row["llm_score"] for row in baseline) / len(baseline),
            "current": sum(row["llm_score"] for row in current) / len(current),
        },
        "flag_rate_at_threshold": {
            "threshold": threshold,
            "baseline": baseline_flagged,
            "current": current_flagged,
        },
    }


def _release_order(rows: list[dict[str, Any]]) -> list[str]:
    """Versions in the order they first scored an application."""
    first_seen: dict[str, Any] = {}
    for row in rows:
        version = row["llm_model_version"]
        if version not in first_seen or row["created_at"] < first_seen[version]:
            first_seen[version] = row["created_at"]
    return sorted(first_seen, key=first_seen.__getitem__)


def sweep(session: Session, scorer: str) -> dict[str, Any]:
    """Flag rate, precision and recall at every threshold, one curve per model version."""
    if scorer not in ("llm", "rule"):
        raise ValueError("scorer must be 'llm' or 'rule'")
    rows = queries.run(session, "version_scores")
    column = f"{scorer}_score"
    thresholds = list(range(101)) if scorer == "llm" else [i / 100 for i in range(101)]

    versions = []
    for version in _release_order(rows):
        subset = [row for row in rows if row["llm_model_version"] == version]
        points = threshold_sweep(
            [row[column] for row in subset], [row["label"] for row in subset], thresholds
        )
        versions.append({"version": version, "points": points})

    return {
        "scorer": scorer,
        "current_threshold": settings.llm_flag_threshold if scorer == "llm" else 0.5,
        "versions": versions,
    }


# The drift baseline: the first three months, all scored by scorer-v1.
DRIFT_BASELINE_MONTHS = 3


def drift(session: Session) -> dict[str, Any]:
    """The quality gate as a time series: PSI of each month against the first months.

    The unchanged rule scorer is the control. If both lines move, the applicants changed;
    if only the LLM line moves, the model did.
    """
    rows = queries.run(session, "version_scores")
    by_month: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_month[str(row["created_at"])[:7]].append(row)

    months = sorted(by_month)
    baseline = [row for month in months[:DRIFT_BASELINE_MONTHS] for row in by_month[month]]

    def psi(column: str, edges: tuple[float, ...], subset: list[dict[str, Any]]) -> float | None:
        return population_stability_index(
            [row[column] for row in baseline], [row[column] for row in subset], edges
        )

    result = []
    for month in months:
        subset = by_month[month]
        versions = [row["llm_model_version"] for row in subset]
        result.append(
            {
                "month": month,
                "applications": len(subset),
                "version": max(set(versions), key=versions.count),
                "llm_psi": psi("llm_score", LLM_PSI_EDGES, subset),
                "rule_psi": psi("rule_score", RULE_PSI_EDGES, subset),
            }
        )

    return {
        "baseline_months": months[:DRIFT_BASELINE_MONTHS],
        "warn_at": PSI_WARN,
        "fail_at": PSI_FAIL,
        "months": result,
    }


def data_quality(session: Session) -> dict[str, Any]:
    """The evidence behind each assumption in the write-up, one check per assumption."""
    facts = queries.run_one(session, "data_quality")

    def check(key: str, label: str, value: str, decision: str, status: str) -> dict[str, str]:
        return {"key": key, "label": label, "value": value, "decision": decision, "status": status}

    low, high = facts["pending_rate_min"], facts["pending_rate_max"]
    return {
        "checks": [
            check(
                "pending",
                "Pending applications",
                f"{facts['pending_rate']:.1%} overall, {low:.1%} to {high:.1%} in every segment",
                "Left out of outcome metrics. The rate is flat, so missing at random.",
                "ok" if high - low < 0.03 else "warn",
            ),
            check(
                "duplicates",
                "Repeat applications to the same job",
                f"{facts['duplicate_pairs']:,}",
                "Kept. Each has its own scores, timestamps and decision.",
                "note",
            ),
            check(
                "no_events",
                "Applications with no recruiter events",
                f"{facts['without_events']:,}",
                "Kept through a LEFT JOIN, so engagement rates are not inflated.",
                "note",
            ),
            check(
                "ties",
                "Rule scores of exactly 0.500",
                f"{facts['ties_at_half']} ({facts['ties_bucketed_low']} bucketed low)",
                "The fit bucket is not a pure function of the score at the cut-off.",
                "warn" if facts["ties_bucketed_low"] else "ok",
            ),
            check(
                "shortlist_leak",
                "Positive rate when shortlisted",
                f"{facts['shortlisted_positive_rate']:.1%}",
                "Shortlisting records the decision, so it is never used as a predictor.",
                "warn" if facts["shortlisted_positive_rate"] == 1 else "ok",
            ),
            check(
                "cross_border",
                "Applications to a job in another country",
                f"{facts['cross_border']:,}",
                "Counted in the job's market, which is the one the posting serves.",
                "note",
            ),
            check(
                "idle_candidates",
                "Candidates with no applications",
                f"{facts['idle_candidates']:,}",
                "Not part of any metric.",
                "note",
            ),
        ],
        "facts": facts,
    }


JEV_BANDS = 10


def third_opinion(session: Session) -> dict[str, Any]:
    """Jev, scored with the same yardstick as the two production scorers.

    Jev never saw the scores or the outcomes, so this is an independent judgement. Its
    probability is used as a score for AUC, and checked for calibration directly.
    """
    rows = queries.run(session, "third_opinion")
    if not rows:
        return {"available": False}

    labels = [row["label"] for row in rows]
    scores = {name: [row[f"{name}_score"] for row in rows] for name in ("rule", "llm", "jev")}

    def scorer(name: str) -> dict[str, Any]:
        return {
            "auc": roc_auc(labels, scores[name]),
            "auc_ci": _interval(auc_interval(labels, scores[name])),
        }

    bands = []
    for band in range(JEV_BANDS):
        low, high = band / JEV_BANDS, (band + 1) / JEV_BANDS
        members = [
            row
            for row in rows
            if low <= row["jev_score"] < high or (band == JEV_BANDS - 1 and row["jev_score"] == 1)
        ]
        positives = sum(row["label"] for row in members)
        bands.append(
            {
                "band": f"{low:.1f}-{high:.1f}",
                "decided": len(members),
                "mean_probability": (
                    sum(row["jev_score"] for row in members) / len(members) if members else None
                ),
                "positive_rate": positives / len(members) if members else None,
                "positive_rate_ci": _interval(wilson_interval(positives, len(members))),
            }
        )

    def mean_by(field: str, value: str) -> dict[str, Any]:
        subset = [row for row in rows if row[field] == value]
        n = len(subset)
        return {
            "group": value,
            "decided": n,
            "mean_jev": sum(row["jev_score"] for row in subset) / n if n else None,
            "mean_llm": sum(row["llm_score"] for row in subset) / n if n else None,
            "positive_rate": sum(row["label"] for row in subset) / n if n else None,
        }

    return {
        "available": True,
        "model": rows[0]["model"],
        "decided": len(rows),
        "rule": scorer("rule"),
        "llm": scorer("llm"),
        "jev": scorer("jev"),
        "jev_vs_rule": compare_aucs(labels, scores["jev"], scores["rule"]),
        "jev_vs_llm": compare_aucs(labels, scores["jev"], scores["llm"]),
        "calibration": bands,
        "tiebreak": _tiebreak(session, {row["application_id"]: row for row in rows}),
        "by_country": [mean_by("job_country", country) for country in ("AT", "DE")],
        "by_profile_band": [
            mean_by("profile_band", band)
            for band in ("thin (<0.4)", "partial (0.4-0.7)", "complete (>=0.7)")
        ],
    }


def _tiebreak(session: Session, scored: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """On the cases where the two scorers disagree, how often each side would have been right."""
    cases = [
        case
        for case in queries.run(session, "disagreement_cases", exclude_family=None)
        if case["application_id"] in scored
    ]
    if not cases:
        return {"cases": 0}

    def accuracy(predictions: list[bool]) -> float:
        hits = sum(p == bool(case["label"]) for p, case in zip(predictions, cases, strict=True))
        return hits / len(cases)

    return {
        "cases": len(cases),
        "follow_rule": accuracy([case["rule_high"] for case in cases]),
        "follow_llm": accuracy([case["llm_high"] for case in cases]),
        "follow_jev": accuracy(
            [scored[case["application_id"]]["jev_score"] >= 0.5 for case in cases]
        ),
    }
