-- One row of facts behind the assumptions in README and ANALYSIS. Each column backs one
-- check on the Data & method page; service.py turns them into statuses.
WITH pending_by_segment AS (
    SELECT avg((NOT is_decided)::int) AS rate FROM scored_applications GROUP BY job_family
    UNION ALL
    SELECT avg((NOT is_decided)::int) FROM scored_applications GROUP BY job_country
    UNION ALL
    SELECT avg((NOT is_decided)::int) FROM scored_applications GROUP BY seniority
    UNION ALL
    SELECT avg((NOT is_decided)::int) FROM scored_applications GROUP BY llm_model_version
),
shortlisted AS (
    SELECT DISTINCT application_id FROM recruiter_events WHERE event_type = 'shortlisted'
)
SELECT (SELECT count(*) FROM applications)                                       AS applications,
       (SELECT avg((NOT is_decided)::int) FROM scored_applications)::float8      AS pending_rate,
       (SELECT min(rate) FROM pending_by_segment)::float8                         AS pending_rate_min,
       (SELECT max(rate) FROM pending_by_segment)::float8                         AS pending_rate_max,
       (SELECT count(*) - count(DISTINCT (job_id, candidate_id)) FROM applications)
                                                                                 AS duplicate_pairs,
       (SELECT count(*) FROM applications a
         WHERE NOT EXISTS (SELECT 1 FROM recruiter_events e
                            WHERE e.application_id = a.application_id))          AS without_events,
       (SELECT count(*) FROM applications WHERE rule_score = 0.5)                AS ties_at_half,
       (SELECT count(*) FROM applications
         WHERE rule_score = 0.5 AND rule_fit = 'low')                            AS ties_bucketed_low,
       (SELECT count(*) FROM scored_applications
         WHERE job_country <> candidate_country)                                 AS cross_border,
       (SELECT count(*) FROM candidates c
         WHERE NOT EXISTS (SELECT 1 FROM applications a
                            WHERE a.candidate_id = c.candidate_id))              AS idle_candidates,
       (SELECT avg(s.is_positive::int) FROM scored_applications s
          JOIN shortlisted USING (application_id) WHERE s.is_decided)::float8    AS shortlisted_positive_rate;
