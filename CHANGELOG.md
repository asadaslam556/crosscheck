# Changelog

<p>
  <a href="https://github.com/asadaslam556/crosscheck/releases"><img src="https://img.shields.io/github/v/release/asadaslam556/crosscheck?logo=github" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/versioning-SemVer-3F4551?logo=semver" alt="SemVer">
</p>

## 2.1.0

- Jev (`jev-1.14.0`) scored all 5,496 decided applications, and the results are committed. It ranks below both production scorers (AUC 0.671), its probabilities run low, and as a tiebreaker it is a coin flip, but it repeats none of the LLM's biases.
- The Third opinion page leads with that summary, and no chart clips its 100% label any more.

## 2.0.0

What I built after the take-home was submitted. The conclusions are the same, with more evidence behind them.

**Analysis**
- AUC inside each job posting, which is how recruiters use the scores. The rule scorer wins there too, 0.759 to 0.724.
- DeLong intervals on every AUC, and a paired test for the rule-against-LLM gap.
- A simulated Healthcare fix: pooled rule AUC goes from 0.689 to 0.762.
- A threshold sweep per model version. A v2 threshold of 78 restores v1's flag rate.
- Monthly drift against the first three months, with the rule scorer as the control.
- Disagreement triage: about half of the 1,872 disagreements trace back to a known defect.
- Optional third opinion from TypeSafe's Jev, graded on the same yardstick.
- A data-quality endpoint that backs each assumption with a number.

**Fixes**
- The quality gate ordered model versions by name, so `scorer-v10` would have come before `scorer-v2`. It now orders them by release date.
- `/api/health` now checks the database.
- A few numbers in the write-up were off by a rounding step or described the wrong comparison.

**Engineering**
- Integration tests against a real Postgres that pin every published number.
- Typed API responses, with the frontend types generated from them.
- `python -m app.gate` for running the release gate in a pipeline.
- A new dashboard: a page per finding, interactive what-ifs, dark mode, works on a phone.
- Production Docker image with nginx, and Postgres no longer clashes with a local install.
- CI, and a live demo on GitHub Pages built in static mode.

## 1.0.0

The take-home as submitted: the PostgreSQL data layer, seven metric endpoints, the metric test suite, a two-page dashboard and the analysis.
