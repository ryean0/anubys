# Anubys

Launch page for Anubys, a CI-native agent regression model harness. It reads a results file and shows one suite status: Pass, Block, Insufficient evidence, or Invalid run. Insufficient evidence can carry a Likely regression warning. In-site links and assets stay relative. Canonical, Open Graph, Twitter, and JSON-LD URLs are absolute `https://anubys.dev/` addresses. The Pages artifact is still the `agent-regression-gate` folder.

Live site: https://anubys.dev/

The site files live in `agent-regression-gate/`. GitHub Actions uploads that folder as the Pages artifact. The custom domain is set in repository Settings → Pages, so no CNAME file is shipped, and the site is served at the URL above.

The owner must set **Settings → Pages → Source** to **GitHub Actions**. The deploy job tries to turn that source on. If the token cannot, the job stays green and prints a reminder, and the live URL stays a 404 until the setting is saved and the workflow is re-run.

## Local preview

```bash
npm test
npm run preview
```

Open http://127.0.0.1:4173/agent-regression-gate/

`npm test` runs the site tests, then checks that every route, the favicon, stylesheet, scripts, results file, and Open Graph image resolve. Share URLs must be `https://anubys.dev/`. In-site links stay relative.

## Swap in a real results file

The results panel fetches `agent-regression-gate/data/results.preliminary.json` on load. That path is the only place to drop real harness output. `harness run` exists. The swap waits on the scorer that writes `results.json`. Replace the file in place when that scorer lands. Keep the filename: the results panel requests that path and no other. The shipped sample is harness results schema 2.1.0. Version 1 and 2.0.0 files still parse. The shape is described in `agent-regression-gate/schema/results.schema.json`.

The checked-in file is a preliminary example (`"status": "preliminary"`, `"schema_version": "2.1.0"`), so the results panel renders before a real run is copied in. Schema 2.1.0 records `run_kind`, `baseline_pool_model_id`, `min_valid_fraction_per_scenario`, equal `rollouts_per_scenario` counts, and `verdicts.diagnostics`. Model ids are `verdicts.overall.model_ids.baseline` and `verdicts.overall.model_ids.candidate`. Screening, baseline, and aa share one model id. A gate run may use a different candidate id, and its baseline id must equal `baseline_pool_model_id`. The sample diagnostics include `example.clean.v1` (family `example.clean`) and `example.broken.v1` (family `example.broken`). The suite label is `verdicts.overall.verdict`. `likely_regression` is a boolean on that verdict, not a separate status. A run summary is a separate file (`data/run_summary.example.json`, `schema_version` `1.1.0`, which adds `model_version`), not a field of results.json. The panel still reads `1.0.0` summaries. When delta and the CI level are missing, the panel shows δ = 5 pp / 90%.

- Preliminary: copy the product example (`docs/examples/results.preliminary.json` from the product repository) over `data/results.preliminary.json`. Leave `"status": "preliminary"`. The page shows the preliminary banner.
- Final: copy the harness final results file over the same path. Set `"status": "final"`. The preliminary banner is replaced by the final banner. On schema 2.1.0 the label is `verdicts.overall.verdict`: pass, block, insufficient_evidence, or invalid_run. Older files still map `likely_regression: false` to Pass, `true` to Block, `null` without `invalid_run` to Insufficient evidence, and `invalid_run: true` to Invalid run.

No HTML, CSS, or script change is required.

## Private Pages

This repository is public, so GitHub Pages serves the site to anyone. On a paid GitHub plan (Pro, Team, or Enterprise), the same Actions deployment can be switched to private Pages from a private repository. Private Pages is visible only to people with read access to the repository.
