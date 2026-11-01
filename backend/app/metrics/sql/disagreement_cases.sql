-- Decided applications where the two scorers land on opposite sides of their own medians,
-- with the fields the triage rules in service.py look at.
WITH decided AS (
    SELECT *
    FROM scored_applications
    WHERE is_decided
      AND (CAST(:exclude_family AS TEXT) IS NULL OR job_family <> CAST(:exclude_family AS TEXT))
),
cuts AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY rule_score) AS rule_median,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY llm_score)  AS llm_median
    FROM decided
)
SELECT d.application_id,
       d.job_family,
       d.job_country,
       d.llm_model_version,
       d.profile_completeness::float8 AS profile_completeness,
       d.rule_score >= c.rule_median  AS rule_high,
       d.llm_score >= c.llm_median    AS llm_high,
       d.is_positive::int             AS label
FROM decided d
         CROSS JOIN cuts c
WHERE (d.rule_score >= c.rule_median) <> (d.llm_score >= c.llm_median);
