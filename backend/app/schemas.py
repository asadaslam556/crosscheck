"""Response shapes for the API.

Every field the dashboard reads is declared here, so /api/docs shows real schemas and the
frontend types are generated from them. Rows that only feed a table and are never picked
apart field by field stay as plain dicts.
"""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel

Row = dict[str, Any]
Interval = list[float] | None


class Health(BaseModel):
    status: str
    tables: dict[str, int] | None = None


class Comparison(BaseModel):
    """Rule minus LLM AUC (or Jev minus another scorer) from a paired DeLong test."""

    difference: float
    interval: list[float]
    p_value: float


class AtThreshold(BaseModel):
    threshold: float
    flagged: int
    flagged_rate: float | None
    precision: float | None
    recall: float | None


class ScorerMetrics(BaseModel):
    n: int
    auc: float | None
    auc_ci: Interval
    at_threshold: AtThreshold
    precision_at_k: dict[str, float | None]


class AucPair(BaseModel):
    rule: float | None
    llm: float | None
    n: int


class VerdictView(BaseModel):
    key: str
    label: str
    rule: float | None
    llm: float | None
    rule_ci: Interval
    llm_ci: Interval
    n: int
    comparison: Comparison | None


class ScoreShift(BaseModel):
    baseline: float
    current: float


class FlagShift(BaseModel):
    threshold: float
    baseline: float
    current: float


class QualityGate(BaseModel):
    status: Literal["pass", "warn", "fail", "skipped"]
    baseline_version: str | None = None
    current_version: str | None = None
    llm_psi: float | None = None
    rule_psi_control: float | None = None
    warn_at: float | None = None
    fail_at: float | None = None
    mean_llm_score: ScoreShift | None = None
    flag_rate_at_threshold: FlagShift | None = None
    reason: str | None = None


class Counts(BaseModel):
    total_applications: int
    decided: int
    pending: int
    pending_rate: float
    positive_rate: float
    hire_rate: float
    jobs: int
    candidates: int
    first_application: datetime
    last_application: datetime


class Overview(BaseModel):
    counts: Counts
    pooled: AucPair
    excluding_healthcare: AucPair
    verdict: list[VerdictView]
    quality_gate: QualityGate


class RescaleEffect(BaseModel):
    decided: int
    moved_out_of_low: int
    moved_positive_rate: float | None


class Effectiveness(BaseModel):
    excluded_job_family: str | None
    rescaled_job_family: str | None
    rescale_factor: float | None
    rescale_effect: RescaleEffect | None
    distribution_by_decision: list[Row]
    rule: ScorerMetrics
    llm: ScorerMetrics
    comparison: Comparison | None


class Quadrant(BaseModel):
    quadrant: str
    decided: int
    positives: int
    positive_rate: float


class TriageCause(BaseModel):
    cause: str
    label: str
    cases: int
    share: float | None
    positive_rate: float | None
    rule_right_rate: float | None


class Triage(BaseModel):
    disagreements: int
    causes: list[TriageCause]


class MatrixCell(BaseModel):
    rule_fit: str
    llm_band: str
    decided: int
    positives: int
    positive_rate: float


class Agreement(BaseModel):
    excluded_job_family: str | None
    quadrants: list[Quadrant]
    agreement_rate: float | None
    winner_on_disagreement: str | None
    matrix: list[MatrixCell]
    triage: Triage


class Segment(BaseModel):
    segment: str
    subsegment: str
    applications: int
    decided: int
    positives: int
    positive_rate: float | None
    positive_rate_ci: Interval
    mean_rule_score: float
    mean_llm_score: float
    good_fit_rate: float
    low_fit_rate: float
    rule_auc: float | None
    llm_auc: float | None
    rule_auc_ci: Interval
    llm_auc_ci: Interval
    is_small_sample: bool


class Segments(BaseModel):
    dimension: str
    by: str | None
    segments: list[Segment]
    min_segment_size: int


class CalibrationBand(BaseModel):
    llm_model_version: str
    band: int
    band_label: str
    decided: int
    positives: int
    positive_rate: float
    positive_rate_ci: Interval
    mean_score: float
    is_small_sample: bool


class Calibration(BaseModel):
    scorer: str
    excluded_job_family: str | None
    bands: list[CalibrationBand]


class MonthlyEngagement(BaseModel):
    month: date
    applications: int
    profile_opened_rate: float
    ai_score_viewed_rate: float
    shortlisted_rate: float


class Funnel(BaseModel):
    applications: int
    profile_opened: int
    ai_score_viewed: int
    shortlisted: int
    no_events: int
    positive_rate_when_shortlisted: float
    positive_rate_when_not_shortlisted: float
    positive_rate_when_ai_viewed: float
    positive_rate_when_ai_not_viewed: float


class RecruiterBehaviour(BaseModel):
    monthly: list[MonthlyEngagement]
    funnel: Funnel


class JobSummary(BaseModel):
    mean: float | None
    interval: Interval
    median: float | None


class FamilyWithinJob(BaseModel):
    job_family: str
    jobs: int
    rule: JobSummary
    llm: JobSummary


class JobAuc(BaseModel):
    job_id: str
    job_family: str
    decided: int
    rule_auc: float
    llm_auc: float


class WithinJob(BaseModel):
    jobs: int
    rule: JobSummary
    llm: JobSummary
    rule_wins: int
    by_family: list[FamilyWithinJob]
    per_job: list[JobAuc]


class SweepPoint(BaseModel):
    threshold: float
    flagged_rate: float | None
    precision: float | None
    recall: float | None


class SweepCurve(BaseModel):
    version: str
    points: list[SweepPoint]


class ThresholdSweep(BaseModel):
    scorer: str
    current_threshold: float
    versions: list[SweepCurve]


class DriftMonth(BaseModel):
    month: str
    applications: int
    version: str
    llm_psi: float | None
    rule_psi: float | None


class Drift(BaseModel):
    baseline_months: list[str]
    warn_at: float
    fail_at: float
    months: list[DriftMonth]


class Check(BaseModel):
    key: str
    label: str
    value: str
    decision: str
    status: Literal["ok", "note", "warn"]


class DataQuality(BaseModel):
    checks: list[Check]
    facts: Row


class ScorerAuc(BaseModel):
    auc: float | None
    auc_ci: Interval


class JevBand(BaseModel):
    band: str
    decided: int
    mean_probability: float | None
    positive_rate: float | None
    positive_rate_ci: Interval


class Tiebreak(BaseModel):
    cases: int
    follow_rule: float | None = None
    follow_llm: float | None = None
    follow_jev: float | None = None


class GroupMeans(BaseModel):
    group: str
    decided: int
    mean_jev: float | None
    mean_llm: float | None
    positive_rate: float | None


class ThirdOpinion(BaseModel):
    available: bool
    model: str | None = None
    decided: int | None = None
    rule: ScorerAuc | None = None
    llm: ScorerAuc | None = None
    jev: ScorerAuc | None = None
    jev_vs_rule: Comparison | None = None
    jev_vs_llm: Comparison | None = None
    calibration: list[JevBand] | None = None
    tiebreak: Tiebreak | None = None
    by_country: list[GroupMeans] | None = None
    by_profile_band: list[GroupMeans] | None = None
