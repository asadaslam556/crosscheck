# Data

<p>
  <img src="https://img.shields.io/badge/PostgreSQL-COPY-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/CSV-4%20files-217346?logo=files&logoColor=white" alt="CSV">
</p>

The four CSVs the project runs on. They came with the original exercise and are kept byte for byte as supplied: `.gitattributes` turns off line-ending conversion for them, because they use CRLF.

| File | Rows | One row is |
|---|---|---|
| `candidates.csv` | 1,500 | a candidate profile |
| `jobs.csv` | 80 | a job posting |
| `applications.csv` | 6,000 | one candidate applying to one job, with both scores and the recruiter's decision |
| `recruiter_events.csv` | 11,758 | one recruiter interaction with an application |

<p align="center"><img src="../docs/images/data-model.svg" alt="How the four tables join, and the view every query reads"></p>

## Columns

**candidates**: `candidate_id`, `country` (AT or DE), `years_experience`, `preferred_job_family`, `profile_completeness` (0 to 1)

**jobs**: `job_id`, `country`, `job_family` (Healthcare, IT, Logistics, Manufacturing, Office & Admin), `seniority` (junior, mid, senior), `created_at`

**applications**: `application_id`, `job_id`, `candidate_id`, `created_at`, `rule_score` (0 to 1), `rule_fit` (low, medium, good), `llm_score` (0 to 100), `llm_model_version` (scorer-v1, scorer-v2), `recruiter_decision` (rejected, interviewed, hired, or empty while pending), `decision_at`

**recruiter_events**: `event_id`, `application_id`, `recruiter_id`, `event_type` (profile_opened, ai_score_viewed, shortlisted), `created_at`

## Quirks worth knowing

- 504 applications (8.4%) are still pending and have no decision.
- 243 applications repeat a candidate and job pair. They're kept, since each has its own scores and decision.
- 109 applications have no recruiter events at all.
- Every shortlisted application ends in an interview or a hire, so `shortlisted` records the outcome rather than predicting it.
- Of the 12 rule scores of exactly 0.500, ten are bucketed medium and two low.

The Data & method page in the dashboard shows each of these with the decision made about it.

## derived/

`derived/jev_scores.csv` holds Jev's probability for each decided application, written by `backend/scripts/score_with_jev.py`. It's optional: the loader skips it when it's missing.
