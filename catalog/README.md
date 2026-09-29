# Screening catalog

The curated catalog of screening checks behind `public.screening_catalog`. Each entry is one reviewed JSON file, `entries/<slug>.json`, and the files are the source of truth: the table is filled only by migrations generated from them.

- **Entry schema:** `src/lib/catalog/schema.ts` (Zod) is the single source of truth. It defines the validator, the TS types and the published JSON Schema, [`entry.schema.json`](entry.schema.json) (regenerate with `npm run catalog:schema`; never edit it by hand).
- **Factor vocabulary:** `src/lib/catalog/factors.ts`.
- **Tooling:** `scripts/catalog/` (`npm run catalog:check`, `catalog:migration`, `catalog:schema`, `catalog:draft`).

## Lifecycle

`draft → active → retired`

- **`draft`:** shipped to the database like every other entry, but hidden from users by row-level security. New and unverified entries stay here.
- **`active`:** visible to everyone and used for recommendations. Only the owner sets this, after reviewing the entry against its sources.
- **`retired`:** still visible, so existing exam records keep resolving, but no longer recommended.

**Never delete an entry.** Set `"status": "retired"` instead. The slug is the entry's permanent identity, so never rename it either. `catalog:check` fails when a slug that an earlier snapshot migration shipped has no file anymore.

## Entry fields

The fields mirror the table columns (without `created_at`/`updated_at`). Unknown keys are rejected.

| Field                                             | Meaning                                                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                                            | Permanent id: lowercase words joined by single hyphens, ≤ 64 characters. Must equal the file name (`<slug>.json`).                                                   |
| `status`                                          | `draft`, `active` or `retired` (see [Lifecycle](#lifecycle)).                                                                                                        |
| `name_pl`, `name_en`                              | Display name, Polish and English.                                                                                                                                    |
| `summary_pl`, `summary_en`                        | Plain-language summary. Informational only: no diagnosis, no risk scores.                                                                                            |
| `how_to_access_pl`, `how_to_access_en`            | How to get the check (e.g. NFZ program, referral from a POZ doctor).                                                                                                 |
| `eligibility`                                     | Eligibility branches, at least one (see [Eligibility](#eligibility)).                                                                                                |
| `interval_kind`                                   | `fixed`, `no_known_interval`, `shared_decision` or `per_program` (see [Interval](#interval)).                                                                        |
| `interval_months`                                 | 1–240. Required when `interval_kind` is `fixed`; absent or `null` otherwise.                                                                                         |
| `interval_overrides`                              | Conditional intervals, `[]` when there are none.                                                                                                                     |
| `evidence_level`                                  | 3 = organised NFZ program, EU core cancer screening or USPSTF A/B; 2 = Polish society recommendation or Moje Zdrowie item; 1 = shared decision, USPSTF C/I or pilot. |
| `evidence_source`                                 | Who backs the evidence level, e.g. `NFZ program; EU Council Rec. 2022`.                                                                                              |
| `burden_weight`                                   | Disease burden in Poland, 0–5. Only a tie-breaker when sorting.                                                                                                      |
| `nfz_funded`, `referral_required`                 | Whether NFZ pays for it, and whether it needs a referral.                                                                                                            |
| `sources`                                         | At least one: `url` (https), `title`, `publisher`, `quote` (verbatim from the source, supporting the rules) and `accessed` (`YYYY-MM-DD`, not in the future).        |
| `reviewed_by`, `last_reviewed`, `next_review_due` | Medical sign-off (reviewer, `YYYY-MM-DD` dates). Absent or `null` until a POZ doctor reviews the entry.                                                              |

### Eligibility

`eligibility` is a list of branches: `{ "sex"?: "female" | "male", "age_min": 50, "age_max"?: 69, "requires": [conditions] }`.

- An entry is eligible when **any** branch matches.
- A branch matches when all of these hold:
  - `sex` is absent or equal to the profile's sex;
  - `age_min ≤ age ≤ age_max`, inclusive, where `age = current year − birth year` (NFZ counts by birth year) and an absent `age_max` means no upper bound;
  - every condition in `requires` holds (`[]` means none).
- A condition is `{ "factor": "<factor id>", "op": "eq" | "in" | "gte" | "lte", "value": … }`. The op and value must fit the factor's kind:
  - `number`: `eq`, `gte` or `lte` with a number;
  - `boolean`: `eq` with `true` or `false`;
  - `enum`: `eq` with one allowed value, or `in` with a non-empty array of them.
- A condition whose profile value is `null` is false (e.g. `pack_years` for a never-smoker).
- A condition on a factor the profile does not collect makes its branch **unknown**, never true.

### Interval

- `interval_months` applies when `interval_kind` is `fixed`.
- The **first** entry in `interval_overrides` whose `when` matches replaces it. `when` is `{ "age_min"?, "age_max"?, "requires"? }` and matches like a branch without `sex`; absent fields do not restrict.
- The other kinds have no computable next due date and must be shown as such: `no_known_interval` (no sourced interval), `shared_decision` (decided with a doctor), `per_program` (set by the program itself).

### Factor vocabulary

Age and sex are branch fields, not factors. The closed list of factors lives in `src/lib/catalog/factors.ts`; add a factor there before using it in a rule.

| Factor                             | Kind                               | Collected by the profile     |
| ---------------------------------- | ---------------------------------- | ---------------------------- |
| `smoking_status`                   | enum: `never`, `current`, `former` | yes (`smoking_status`)       |
| `pack_years`                       | number                             | yes (`pack_years`)           |
| `years_since_quitting`             | number                             | yes (`years_since_quitting`) |
| `family_history_crc_first_degree`  | boolean                            | no                           |
| `family_history_breast_ovarian`    | boolean                            | no                           |
| `occupational_carcinogen_exposure` | boolean                            | no                           |
| `bmi`                              | number                             | no                           |
| `hypertension`                     | boolean                            | no                           |
| `dyslipidemia`                     | boolean                            | no                           |
| `diabetes`                         | boolean                            | no                           |
| `cardiovascular_disease`           | boolean                            | no                           |
| `fatty_liver`                      | boolean                            | no                           |
| `hiv_or_immunosuppression`         | boolean                            | no                           |
| `pregnancy`                        | boolean                            | no                           |
| `prior_cancer`                     | boolean                            | no                           |
| `hysterectomy`                     | boolean                            | no                           |
| `questionnaire_flags_risk`         | boolean                            | no                           |

## Drafting with Claude

`npm run catalog:draft` asks Claude Opus 5 to research a topic on the live web and draft new entries. It writes only entries that pass the same validator as hand-written ones and have a new slug. Every drafted file is `"status": "draft"` with null review fields, so nothing reaches users until you review it.

### Credentials

Run `ant auth login` once, or export `ANTHROPIC_API_KEY` in the shell you run the script from. The script never reads `.env` or `.dev.vars`. Never add the key there, to `.env.example`, or as a Cloudflare or GitHub secret: the drafter runs only on your machine.

### Running it

```sh
# Try a small batch first, without writing entry files:
npm run catalog:draft -- --topic "mammografia NFZ" --max 2 --dry-run

# Draft up to 5 entries, with the research report as background:
npm run catalog:draft -- --topic "badania przesiewowe raka NFZ" \
  --source context/foundation/screening-catalog-research.md --max 5
```

- **Options:**
  - `--topic` (required);
  - `--source <path>`: a background document, included in the prompt as leads only;
  - `--max <n>`: at most n entries, default 5;
  - `--max-searches <n>`: web search cap, default 20;
  - `--dry-run`: validate and report without writing entry files.
- **Output:** the script prints each valid entry with its sources and quotes, skips slugs that already exist (as a file or in a shipped snapshot), and lists invalid entries with their errors.
- **Audit:** every raw response, with the request and token usage, is saved to `catalog/.draft-runs/<timestamp>.json` (gitignored), even when the run fails.
- **Cost:** every run is billed: Opus 5 input and output tokens, plus a fee per web search. A run with the research report as `--source` sends a large prompt, and every `pause_turn` continuation re-sends it. The script prints the token and search counts at the end. Start with `--max 5` or less.

### Review checklist

Open every drafted file and, for each entry:

1. Open every `sources[].url` and confirm that the `quote` appears on the page verbatim.
2. Check `eligibility` (ages, sex, `requires`), `interval_kind`, `interval_months` and `interval_overrides` against the quotes. Remember that ages count by birth year. An unsourced interval must not be `fixed`.
3. Check `nfz_funded`, `referral_required` and `evidence_level` against the sources.
4. Read the PL and EN text. It must be informational only: no diagnosis, no risk scores, and a pointer to a POZ doctor.
5. Fix what is wrong. If the entry cannot be sourced, discard the new file: a draft that was never committed or shipped in a snapshot is not yet part of the catalog, so the never-delete rule does not apply to it.
6. Set `"status": "active"` on entries that pass. Leave `reviewed_by`, `last_reviewed` and `next_review_due` as `null` until a POZ doctor signs off.

Then continue with [Shipping changes](#shipping-changes).

## Shipping changes

1. **Edit files** in `catalog/entries/` (add, change, or retire; never delete).
2. **`npm run catalog:check`**: validates every entry and prints each problem with its file and field, e.g. `catalog/entries/foo.json: eligibility[0].age_max: must be ≥ age_min (80)`. Until you generate a migration, it also reports that the entries differ from the newest snapshot.
3. **`npm run catalog:migration`**: writes `supabase/migrations/<UTC yyyymmddhhmmss>_screening_catalog_snapshot.sql`, one idempotent upsert of every entry. It refuses when nothing changed since the newest snapshot. Never edit a generated snapshot; change the entries and generate a new one.
4. **Commit** the entry files together with the new snapshot migration, then open a **PR**. CI's `ci` job runs `catalog:check`.
5. After merge, the CI **`migrate`** job applies the snapshot to production (`supabase db push`), before `deploy`.

Upserts never delete rows, so a retired entry stays in the table and future exam records keep resolving.
