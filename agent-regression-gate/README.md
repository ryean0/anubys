# Anubys

Self-contained static site for Anubys, a CI-native agent regression model harness. v0.1 writes `run_summary.json` plus a CLI summary. CI is a README workflow snippet. The packaged GitHub Action, a second model provider, per-family breakdown, `export-replay`, an HTML report, and the company AWS account move are deferred to v0.2, post-v0.1. The landing page is visual; method, gate, results, performance, integrations, and how it works each have their own `index.html`. Docs are static pages under `docs/` (introduction, quickstart, concepts, guides, reference, changelog, and roadmap). Asset paths stay relative (`./css`, `./js`, `./data`, or `../` from a nested route). Canonical, Open Graph, Twitter, and JSON-LD URLs are absolute `https://anubys.dev/` addresses.

Optional prefix: set `data-base` on `<html>` (`./` on the landing page, `../` on a nested route). That prefix is only for scripts that fetch site files. Canonical and Open Graph URLs stay on `https://anubys.dev/`. In-site links stay relative.

## Go live

GitHub Actions uploads this folder as the Pages artifact. The custom domain is set in the repository Pages settings, so this folder does not include a CNAME file. The public site is https://anubys.dev/.

This folder is not the portfolio site. The portfolio pages were not changed.

## Results file

`data/results.preliminary.json` is the only results file the results panel reads on load, and the only place to drop real harness output. `harness run` exists. The swap waits on the scorer that writes `results.json`. The performance page reads example check timings from `data/timing.sample.json`. That file has the shape of a future `timing` field. Measured numbers are not in it yet. A results file with no `timing` field leaves the efficiency panel empty. The shipped sample is harness results schema 2.1.0 (`schema/results.schema.json`): `schema_version` `"2.1.0"`, `run_kind` (`screening`, `baseline`, `aa`, or `gate`), `baseline_pool_model_id`, `min_valid_fraction_per_scenario` (an exact string such as `"0.6"`), and `rollouts_per_scenario.baseline` equal to `rollouts_per_scenario.candidate`. Model ids are `verdicts.overall.model_ids.baseline` and `model_ids.candidate`. Screening, baseline, and aa share one id. A gate run may use a different candidate id, and its baseline id must equal `baseline_pool_model_id`. `verdicts.overall` has `verdict`, numeric `delta`, `difference_ci` (`lower`, `upper`, `level` 0.9), and required `likely_regression`. Diagnostics are `verdicts.diagnostics`: scenario id, family id, scheduled rollouts, integer miss counts, missing cassette keys, and optional numeric pass rates. The bundled rows include `example.clean.v1` (family `example.clean`) and `example.broken.v1` (family `example.broken`). There is no per-arm `model_id`. `suite_id` is optional and defaults to `tau_retail`. A run summary is a separate file, `data/run_summary.example.json` (`schema/run_summary.schema.json`, `schema_version` `"1.1.0"`, a byte-for-byte copy of the harness schema at main `63f2ba2`), not a field of results.json. Version 1.1.0 adds `model_version`. The panel still reads `"1.0.0"` summaries. That contract is `schema/run_summary-1.0.0.schema.json`. It may include `planned_rollouts`, `completed_rollouts`, `infra_misses`, `stopped` (null or `monthly_cap`), `total_cost_usd`, `total_cached_input_tokens`, `rollout_duration_p50_s`, and `rollout_duration_max_s`. `schema/step.schema.json` is the harness Step contract. `thinking_tokens` and `cached_tokens` are optional and may be null. Version 1 and 2.0.0 files still parse, including a per-arm `model_id` on those older files. When delta and the CI level are absent the panel shows δ = 5 pp / 90%.

A `preliminary` status shows the banner. `final` removes it. On schema 2.1.0 the label is `verdicts.overall.verdict`: Pass, Block, Insufficient evidence, or Invalid run. `likely_regression` is a boolean on that verdict. It is true only when the verdict is insufficient evidence and the difference is below the margin. Likely regression is a spec flag, not computed in v0.1 (deferred to v0.2). Spend is logged per run, measured from the A/A and Block runs. v0.1 does not compute a derived cost per verdict. Older files still use `likely_regression` false, true, null, and `invalid_run`. Diagnostic rows stay diagnostics.

## Checks

```bash
npm test
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/`.
