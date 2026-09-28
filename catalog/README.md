# Screening catalog

The curated catalog of screening checks behind `public.screening_catalog`. Each entry is one reviewed JSON file, `entries/<slug>.json`, and the files are the source of truth: the table is filled only by migrations generated from them.

- **Entry schema:** `src/lib/catalog/schema.ts` (Zod) is the single source of truth. It defines the validator, the TS types and the published JSON Schema, [`entry.schema.json`](entry.schema.json) (regenerate with `npm run catalog:schema`; never edit it by hand).
- **Factor vocabulary:** `src/lib/catalog/factors.ts`.
- **Tooling:** `scripts/catalog/` (`npm run catalog:check`, `catalog:migration`, `catalog:schema`).

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

## Shipping changes

1. **Edit files** in `catalog/entries/` (add, change, or retire; never delete).
2. **`npm run catalog:check`**: validates every entry and prints each problem with its file and field, e.g. `catalog/entries/foo.json: eligibility[0].age_max: must be ≥ age_min (80)`. Until you generate a migration, it also reports that the entries differ from the newest snapshot.
3. **`npm run catalog:migration`**: writes `supabase/migrations/<UTC yyyymmddhhmmss>_screening_catalog_snapshot.sql`, one idempotent upsert of every entry. It refuses when nothing changed since the newest snapshot. Never edit a generated snapshot; change the entries and generate a new one.
4. **Commit** the entry files together with the new snapshot migration, then open a **PR**. CI's `ci` job runs `catalog:check`.
5. After merge, the CI **`migrate`** job applies the snapshot to production (`supabase db push`), before `deploy`.

Upserts never delete rows, so a retired entry stays in the table and future exam records keep resolving.
