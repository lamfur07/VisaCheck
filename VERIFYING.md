# How to verify a destination

This is the checklist each daily verification run (and any human contributor) follows. The goal: every "Verified" badge must be backed by an official source checked on a specific date.

## 1. Pick the batch

* Open `VERIFICATION_QUEUE.md` and take the **first 10 unticked** countries.
* Skip any country that an **open** pull request titled `Verified rules: batch …` already covers.
* If such a PR is still open, create your branch **from that PR's branch** (stacked), so batches merge cleanly in order. Otherwise branch from `main`.
* Branch name: `verify-batch-<N>`.

## 2. Research each country (official sources only)

For each destination collect, from **government sources** (immigration ministry, foreign ministry, official eVisa portal, official legislation):

1. Visa-free nationalities and maximum stay.
2. Visa on arrival nationalities (and conditions).
3. eVisa / eTA eligibility, official portal URL, fee and processing time.
4. Exemptions based on residence permits or visas from other countries (e.g. valid US/UK/Schengen visa).
5. Transit rules.
6. Study and work: the main permit names and official pages.
7. Passport validity rule and any mandatory arrival registration.

Rules:

* News sites, airlines, IATA and the RapidAPI data may be used to **find** information, never as the only proof.
* If an official source can't be read or confirmed, make that nationality return `status: "check"` with an official link. **Never guess.**
* Compare with the RapidAPI answer for 5 common passports (US, IN, GB, CN, NG). List any disagreements in the PR.

## 3. Code it

* Add the destination to `js/rules.js` following the existing pattern (an object with `id`, `name`, `flag`, `links`, `verified: "YYYY-MM-DD"`, `evaluate(nat, ctx)`), then add it to `DESTINATIONS`.
* Schengen members: one line with `schengen(code, name, flag, portalUrl)`.
* Put a comment above each country's lists naming the official source URL and the date checked.
* Use ISO codes from `js/countries.js`. Every list entry must be a valid code.

## 4. Test

* Add at least **3 scenarios per country** to `tests/rules.test.js` (a visa-free case, a visa-required case, and a residence/transit/study case where relevant).
* All must pass:
  ```bash
  node tests/rules.test.js
  node tests/api.test.js
  python tests/ui_smoke.py
  ```

## 5. Ship

* Tick the countries in `VERIFICATION_QUEUE.md` with the date, e.g. `- [x] IN India (2026-11-21)`.
* Open a PR titled `Verified rules: batch <N> (<country names>)` with: the sources used per country, any API disagreements, and anything that stayed `check`.
* A human reviews and merges. Do not merge automatically.

## 6. Monthly re-checks (keep verified data current)

Rules change, so verified data must not go stale. On every daily run, **before** the new batch:

* Find verified destinations whose `verified` date in `js/rules.js` is **more than 30 days old**.
* Re-check the **5 oldest** against their official sources (same standard as above).
* Update any rule that changed, set `verified` to today's date, and adjust tests.
* Include them in the same PR under a heading **Re-checked**, listing what changed (or "no changes").

The site also cross-checks every verified result against the live API on each search, and warns visitors if they disagree. Treat any such disagreement you notice as a reason to re-check that country first.
