-- Row counts for the health check. One row, so a reachable but empty database shows up too.
SELECT (SELECT count(*) FROM candidates)       AS candidates,
       (SELECT count(*) FROM jobs)             AS jobs,
       (SELECT count(*) FROM applications)     AS applications,
       (SELECT count(*) FROM recruiter_events) AS recruiter_events;
