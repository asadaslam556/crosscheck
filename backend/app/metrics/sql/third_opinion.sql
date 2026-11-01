-- Decided applications that Jev scored, next to the two production scores, for comparing
-- all three on exactly the same rows.
SELECT s.application_id,
       s.job_country,
       s.profile_band,
       s.is_positive::int  AS label,
       s.rule_score::float8 AS rule_score,
       s.llm_score::float8  AS llm_score,
       j.probability::float8 AS jev_score,
       j.model
FROM scored_applications s
         JOIN jev_scores j USING (application_id)
WHERE s.is_decided;
