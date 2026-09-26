# Preventive Exam Recommender for Poland: Catalog Sources, Tiering Model, Profile Data and Compliance (MVP Research Report)

Your rules-based design (a curated, versioned catalog filtered deterministically in the browser, with no profile sent to an AI) is the right MVP architecture: Poland's own screening programs are defined by crisp, machine-readable criteria (age by birth year, sex, interval, a few risk factors), the official NFZ "Kalendarz badań" already works on age+sex alone, and keeping the profile on the user's device can take the developer out of the GDPR "controller" role for health data altogether, according to the French regulator CNIL.

## TL;DR

- **Catalog (F-01):** Build the core from the four NFZ/Ministry of Health programs plus the "Moje Zdrowie" adult health check (mammography 45–74 every 2 years; cervical HPV HR test every 5 years or cytology every 3 years at 25–64; screening colonoscopy 50–65, or 40–49 with a first-degree relative with colorectal cancer; LDCT for heavy smokers 55–74, set by the Minister of Health regulation of 14 July 2026 (Dz.U. 2026 poz. 976), with NFZ contracts starting no earlier than 1 October 2026; the "Moje Zdrowie" lab panel every 5 years at 20–49 and every 3 years from 50). Add Polish society guidance (PTD for diabetes, PTNT/PTK for blood pressure) and use USPSTF grades and the 2022 EU Council Recommendation as the evidence layer. Use AI only offline to draft entries, and have a named family-medicine doctor sign off each entry with a source and review date.
- **Prioritization:** Use a transparent three-tier model: Tier 1 "Ważne" (organised NFZ screening or A/B-grade evidence, and the user is overdue or has never done it, or a risk factor makes them eligible for a high-risk program); Tier 2 "Warto zaplanować" (recommended but not yet due, or society-level checks like glucose, lipids and BP); Tier 3 "Porozmawiaj z lekarzem" (shared-decision tests such as PSA). The score is deterministic and every output shows its rule and source.
- **Data and compliance:** Must-have fields are birth year, sex at birth, last-exam dates, and smoking history (pack-years plus years since quitting). Everything else is optional. Compute and store on the device by default. Anything you sync to Supabase is Art. 9 GDPR health data and needs separate explicit consent. Keep the intended purpose strictly informational ("what public screening you are eligible for and when"), not diagnostic or individual-risk prediction, to stay outside MDR medical-device software under MDCG 2019-11.

## Key Findings

1. **Poland's screening landscape changed substantially in 2025–2026, so any catalog built from older blog posts will be wrong.** "Profilaktyka 40 PLUS" ended on 30 April 2025 and was replaced by "Moje Zdrowie – bilans zdrowia osoby dorosłej" (from 5 May 2025, open to everyone 20+). The cervical program switched to HPV HR primary testing in July 2025. Mammography widened to 45–74 in November 2023. A national LDCT lung program enters the guaranteed-benefits basket on 1 October 2026.
2. **An official Polish age+sex recommender already exists: Akademia NFZ "Kalendarz badań".** You select sex and age and it generates a list of exams and recommendations, including programs you can join, vaccines, and guidance for pregnancy. Commercial equivalents include Medicover's "Kalkulator badań profilaktycznych" (age+sex), Diagnostyka's "Profilaktometr" (per diag.pl, it gives a percentage score and shows whether your tests are "wciąż aktualne lub… wygasające i nieaktualne" – still current, expiring or out of date; the same app's AI assistant "LiDia" "rekomenduje badania na podstawie wskazanych objawów" – recommends tests based on the symptoms you enter), and an AI assistant on Cyfrowa Poradnia. Your differentiation should be (a) risk-factor refinement (family history, pack-years), (b) overdue tracking based on the user's last-exam dates, (c) explicit NFZ eligibility with "no referral needed" flags, and (d) per-item sources.
3. **IKP does not publish a general recommendation engine.** The closest it offers is the "Moje Zdrowie" questionnaire, filled in via IKP, mojeIKP or at the POZ clinic. It generates referrals, the results are reported to IKP, and POZ staff build an Indywidualny Plan Zdrowotny (IPZ, individual health plan). Your app should point users to that questionnaire, not compete with it.
4. **Machine-readable international sources exist, but they are US-centric.** The USPSTF Prevention TaskForce API returns JSON filtered by age, sex, pregnancy, tobacco, sexual activity and grade. It requires a token (requested via uspstfpda@ahrq.gov), and AHRQ recommends caching the whole dataset locally, which it refreshes about weekly. The ODPHP MyHealthfinder API v4 is free, has no rate limit, and can be cached; older versions were switched off on 13 August 2026. AHRQ's CDS Connect repository of CQL/FHIR artifacts went offline on 28 April 2025 and now continues as the HL7 "CDS Connect Community Edition" and CQL Studio. Use these as a cross-check and grading layer, not as your Polish catalog.
5. **An LLM generating the list at runtime is the wrong tool here.** The eligibility rules are short and deterministic, and they change by regulation (e.g., birth-year age counting, the 10-year colonoscopy exclusion, a 36-month wait before the first HPV test after cytology). Deterministic filtering gives reproducibility, auditability and a clean MDR/GDPR story. AI adds value upstream: extracting rules from source PDFs into your schema, flagging guideline changes, and drafting plain-language explanations for doctor review.
6. **Local-only processing is a real legal lever.** In its September 2024 mobile-app recommendation, CNIL states that for a health app that stores data only locally, with no outside connection and for purely personal purposes, the publisher "only supplies software" and "the GDPR is not applicable to the software provided." The EDPB (Guidelines 2/2023) adds that use of localStorage inside the browser is not "gaining access" under ePrivacy Art. 5(3) as long as the information does not leave the device. Any analytics, sync or third-party script that sends data out reverses this.

## Details

### 1. Sources for the exam catalog (blocker F-01)

**Tier A – Polish official programs (the backbone; NFZ-funded, no referral unless noted)**

| Program (Polish name) | Who | Interval | Key rules for the rule engine |
|---|---|---|---|
| Program profilaktyki raka piersi (mammografia) | Women 45–74 | Every 24 months | Age counted by **birth year**; no referral; 12-month interval for certain women after breast-cancer treatment (route these to a doctor instead of the engine). Range widened from 50–69 on 1 Nov 2023. |
| Program profilaktyki raka szyjki macicy | Women 25–64 | HPV HR test every 5 years (negative result), or classic cytology every 3 years; 12 months with risk factors | Since July 2025 the HPV HR test with genotyping is the primary test, with reflex liquid-based cytology (LBC) on the same sample if positive. The first HPV test can be done 36 months after the last program cytology. Risk factors for yearly testing: HIV, immunosuppressive drugs, positive HPV of genotypes other than 16/18. |
| Program badań przesiewowych raka jelita grubego (kolonoskopia) | 50–65; 40–49 with a first-degree relative with colorectal cancer | Once per 10 years | Excluded if colonoscopy in the last 10 years or symptoms suggestive of cancer; no referral; qualification by questionnaire at the facility. |
| Ogólnopolski program wczesnego wykrywania raka płuca (NDTK/LDCT) | 55–74 with ≥20 pack-years, currently smoking or quit ≤15 years ago; 50–74 with ≥20 pack-years plus an additional risk factor (e.g., ≥2 years occupational exposure to asbestos, silica, beryllium, nickel, chromium, cadmium, arsenic, diesel exhaust, soot; radon) | Per program | Legal basis: Minister of Health regulation of 14 July 2026, Dz.U. 2026 poz. 976 (published 22 July 2026), with NFZ contracts starting "nie wcześniej niż" (no earlier than) 1 October 2026, per a Balticmed summary; the earlier pilot ran 2021–2023 in 26 centres, then 2024–2025. Mark this entry `status: pending_verification` until you have checked the eligibility and interval details in the Dz.U. text itself. |
| Moje Zdrowie – bilans zdrowia osoby dorosłej | Everyone 20+ | Every 5 years at 20–49; every 3 years from 50 (birth year counts) | Basic panel for everyone: morfologia (CBC), glucose, creatinine with eGFR, lipid profile, TSH, urinalysis. Extended panel depends on age and questionnaire: ALT, AST, GGT, anti-HCV, Lp(a), PSA for men 50+, FIT (occult blood) test. Also SCORE2/SCORE2-OP/SCORE2-Diabetes for 40+ with CV risk, a cognitive screen at 60+, and an IPZ. Eligible 12 months after the last 40 PLUS test. |

Map these as your "NFZ-funded = true" entries. The Narodowy Portal Onkologiczny (onkologia.pacjent.gov.pl) "Mapa programów profilaktycznych" and pacjent.gov.pl program pages are the canonical citations. Each voivodeship NFZ branch republishes them, which is useful as corroboration.

**Tier B – Polish scientific societies (for checks without a dedicated screening program)**
- **Polskie Towarzystwo Diabetologiczne (PTD), 2025 recommendations:** screen for type 2 diabetes every 3 years in everyone over 45, and **annually regardless of age** in people with overweight/obesity, dyslipidaemia, hypertension, fatty liver disease or any cardiovascular disease, using fasting glucose, OGTT or HbA1c. PTD updates annually, so plan an annual review.
- **PTNT/PTK 2024 hypertension guidelines** (joint Polish Society of Hypertension / Polish Cardiac Society position by Prejbisz et al., free to download from "Nadciśnienie Tętnicze w Praktyce"): citing NFZ data for 2018–2022, the guidelines put the number of affected adults at "około 11 milionów" (about 11 million), i.e. 34–35% of Polish adults, and control is achieved in only ~33%. This makes blood-pressure measurement a high-yield Tier 2 item for all adults. Have your medical reviewer confirm the exact measurement interval against the PTNT/PTK text; the ESC 2024 guideline is the likely reference.
- **Not verified in this research (assign to your reviewer):** PTGiP (Polish Society of Gynaecologists and Obstetricians) positions beyond the national cervical program; Kolegium Lekarzy Rodzinnych w Polsce / PTMR adult preventive-check recommendations. PTMR has published national-consultant guidance on diabetes in POZ encouraging patients over 35 to join the prevention program every 5 years, but that predates "Moje Zdrowie". Occupational medicine (badania wstępne/okresowe under the Labour Code) is employer-driven and exposure-specific. Keep it out of the MVP catalog and show only a static note.

**Tier C – International evidence layer (for grades and gap-filling)**
- **USPSTF.** Grades A/B mean "recommended". Example: 2024 breast screening is biennial mammography at 40–74 (Grade B), with an I statement for 75+ and for supplemental imaging in dense breasts. The colorectal range is 45–75. Prostate PSA at 55–69 is a C grade (individual decision); confirm the current statement via the API before encoding. Use the grades to set `evidence_grade`, not to override Polish program ages.
- **Council Recommendation of 9 December 2022 (EU).** It replaced the 2003 recommendation (breast, cervical, colorectal). It asks Member States to explore LDCT for high-risk smokers, evaluate organised prostate screening using PSA with MRI follow-up, and use H. pylori screen-and-treat where gastric cancer burden is high. It suggests breast screening at 45–74 and cervical intervals adapted to HPV vaccination history. This is a strong justification for placing PSA in Tier 3 ("talk to your doctor") rather than Tier 1: the EU framing is "pilot and research", not "screen everyone".
- **European Commission Initiatives on breast/colorectal/cervical cancer** (JRC "Cancer Screening, Diagnosis and Care" portal) serve as the quality-assurance reference behind the Council Recommendation.
- **NICE/UK NHS screening programmes, the Canadian Task Force and WHO** were not researched in depth here. They are useful as a sanity check where Polish and US sources diverge (e.g., PSA, breast start age).

**Tier D – Machine-readable tools**
- **USPSTF Prevention TaskForce API:** REST/JSON, with parameters like `age`, `sex`, `pregnant`, `tobacco`, `sexuallyActive`, `grade`. It needs a token, so cache the full dataset and refresh weekly. It supports ETag/Last-Modified for change detection, which is useful for an "evidence changed, re-review" alert.
- **MyHealthfinder API v4 (ODPHP):** free, cacheable, consumer language, English/Spanish. Its UX pattern (age and sex required, everything else optional) is a good model for your form.
- **FHIR/CQL/CDS Hooks:** overkill for a solo MVP with no EHR integration. Note them as a future path if you ever integrate with P1/IKP data. The AHRQ repository is offline; its successor is the HL7 Community Edition/CQL Studio.

**AI-generated vs. curated catalog**

| Criterion | LLM generates list per user | Curated rules catalog (your S-02 decision) |
|---|---|---|
| Accuracy on Polish rules (birth-year counting, 10-year exclusions, 2025 HPV switch) | Prone to stale or hallucinated rules; models trained before mid-2025 will still describe "40 PLUS" | Exact, citable |
| Reproducibility | Same profile can yield different lists | Identical output, testable with unit tests |
| Liability and MDR | Free-text, individualised output looks like clinical decision support | Fixed, published criteria plus source link, so it reads as public-health information |
| GDPR | Requires sending the profile (Art. 9 data) to an AI provider, often outside the EEA | Can run entirely client-side |
| Cost/latency | Per-request tokens | Near zero |

**Recommended content workflow:**
1. Collect source PDFs and pages (NFZ program pages, pacjent.gov.pl, PTD 2025, PTNT/PTK 2024, the EU Council Recommendation, USPSTF).
2. Use an LLM offline to extract candidate entries into your JSON schema, with a verbatim quote and URL for each rule.
3. You check the extraction against the quote, and the medical reviewer approves it.
4. Publish a versioned catalog (e.g., `catalog v2026.10`) with `last_reviewed` and `next_review_due`.
5. Re-run extraction and diff when a source changes (the USPSTF ETag, the annual PTD update, NFZ regulation changes).

**Who verifies:** realistically, one licensed family-medicine doctor (lekarz specjalista medycyny rodzinnej) acting as medical advisor. Ideally they work in POZ, since POZ runs "Moje Zdrowie". Arrange a short written engagement defining their scope (content review, not individual patient advice). A gynaecologist is a nice-to-have for the women's entries. Put the reviewer's name, PWZ number (with consent) and review date on an "O treściach" (about the content) page.

### 2. Prioritization / grouping

Base priority on four defensible inputs, all traceable to sources:

1. **Program/evidence strength** (`evidence_level`): 3 = organised NFZ screening program or EU Council core cancer (breast, cervical, colorectal) or USPSTF A/B; 2 = Polish society recommendation or "Moje Zdrowie" panel item; 1 = shared-decision/C-grade/"pilot" (PSA, USPSTF C/I).
2. **Due status** (`due_status`), computed from the user's last-exam date and `interval_months`: never done or overdue = +2; due within 6 months = +1; up to date = 0 (and show the next due date).
3. **Risk modifier** (`risk_boost`): +1 when a user-declared risk factor either unlocks eligibility (family history of CRC at 40–49; ≥20 pack-years for LDCT) or shortens the interval (PTD annual glucose with obesity/hypertension; yearly HPV with HIV/immunosuppression).
4. **Burden in Poland** (`burden_weight`, used only as a tie-breaker): per the Krajowy Rejestr Nowotworów analytic report, lung cancer causes 26% of male cancer deaths (LUX MED cites 25.4%) and, per the KRN/NIO bulletin "Nowotwory złośliwe w Polsce w 2023 roku", 18.6% of female cancer deaths versus 14.6% for breast; colorectal cancer is the second cancer killer (13% of male cancer deaths). So LDCT and colonoscopy should sort above other Tier 1 items when scores tie.

**Tier rule (simple, explainable):**
- **Tier 1 "Ważne – zrób/umów teraz":** `evidence_level = 3` AND `due_status ≥ +1`, OR any risk-unlocked high-risk program (LDCT, colonoscopy at 40–49).
- **Tier 2 "Warto zaplanować":** `evidence_level = 2`, OR `evidence_level = 3` that is up to date (show "next due").
- **Tier 3 "Porozmawiaj z lekarzem":** `evidence_level = 1` (e.g., PSA 50+ is in "Moje Zdrowie" but has C-grade/pilot-level evidence). Always shown with a benefits/harms note.
- **Override banner (not a tier):** if the user reports symptoms or a prior cancer, stop the screening logic and show "Screening programs are for people without symptoms; see your GP." Both the colorectal and mammography programs exclude or re-route these people.

Sort within each tier by `due_status`, then `risk_boost`, then `burden_weight`. Show the "why" for each item, e.g. "Age 52 (by birth year) + no colonoscopy recorded → NFZ program 50–65, no referral needed. Source: NFZ, reviewed 2026-09."

**Catalog entry schema (Supabase table `exam_rule`, publicly readable, contains no personal data):**

| Field | Type | Example |
|---|---|---|
| `id`, `slug` | text | `crc_colonoscopy_nfz` |
| `name_pl`, `name_en`, `plain_summary_pl` | text | "Kolonoskopia przesiewowa" |
| `target_sex` | enum (female/male/any) | any |
| `age_min`, `age_max`, `age_basis` | int, int, enum (birth_year/exact) | 50, 65, birth_year |
| `interval_months` | int | 120 |
| `interval_rules` | jsonb (conditional intervals) | `{"hiv_or_immunosuppressed": 12}` |
| `eligibility_conditions` | jsonb (JSONLogic) | `{"or":[{"between":[50,"age",65]},{"and":[{"between":[40,"age",49]}, {"==":["fh_crc_first_degree",true]}]}]}` |
| `exclusions` | jsonb | colonoscopy < 10 y; symptoms |
| `risk_factors_boost` | text[] | `["fh_crc_first_degree"]` |
| `evidence_level`, `evidence_grade_source` | int, text | 3, "NFZ program; EU Council Rec. 2022; USPSTF A/B" |
| `burden_weight` | int | 3 |
| `nfz_funded`, `nfz_program_name` | bool, text | true, "Program badań przesiewowych raka jelita grubego" |
| `referral_required`, `how_to_access_pl` | bool, text | false, "zgłoś się do placówki realizującej program" |
| `sources` | jsonb [{url, title, quote, accessed}] | NFZ page, quote |
| `status` | enum (active/pending_verification/retired) | active |
| `version`, `reviewed_by`, `last_reviewed`, `next_review_due` | text/date | 2026.10, "lek. …", 2026-09-20, 2027-03-20 |

Evaluate `eligibility_conditions` with a tiny JSONLogic library in the browser, so rules are data and not code. The reviewer can read them, and you can unit-test with fixture profiles (e.g., "woman born 1980, last cytology 2021").

### 3. Profile data to collect

**Must-have (drives Tier 1):**
- **Birth year**, not the full date of birth. NFZ programs count age by birth year, so this is both sufficient and data-minimising.
- **Sex at birth** (female/male), used for organ-based screening. Offer an optional "I have a cervix / breasts / prostate" override for trans and intersex users, following the USPSTF wording on people "assigned female at birth".
- **Last date of each exam**, month/year precision with "never / don't know": mammography, cervical test (and whether it was cytology or HPV), colonoscopy, LDCT, "Moje Zdrowie"/40 PLUS.
- **Smoking:** never / current / former, pack-years (with a calculator: packs per day × years), and years since quitting (needed for LDCT).

**Optional refiners (each unlocks or modifies a specific rule; say which in the UI):**
- First-degree relative with colorectal cancer (unlocks colonoscopy at 40–49).
- Occupational exposure to asbestos, silica, diesel exhaust etc., or radon (unlocks LDCT at 50–54).
- Height/weight for BMI, and known hypertension, dyslipidaemia, fatty liver or cardiovascular disease (switch PTD glucose screening to annual).
- HIV or immunosuppressive treatment (yearly cervical testing). This is highly sensitive; ask it last, with an explanation, and never sync it.
- Pregnancy (pause the adult list and point to prenatal care).
- Hysterectomy or prior cancer treatment (route to a doctor).
- Family history of breast/ovarian cancer or BRCA (show "genetic counselling" info rather than changing intervals).

**Leave out of the MVP:** alcohol, sexual activity/STI, HPV vaccination status (only relevant once Poland adapts cervical intervals to vaccination history, as the EU Council suggests), and occupation beyond the exposure question. Each extra field adds Art. 9 exposure without changing a Polish program rule.

### 4. GDPR and MDR implications

- **What counts as health data:** almost every field above is "data concerning health" under Art. 9. If you process it on your servers, you need explicit consent under Art. 9(2)(a), separate from terms of service, never pre-ticked, and withdrawable. The Art. 9(2)(h) "preventive medicine" route is meant for health professionals bound by secrecy, not a consumer app. UODO's health-sector code of conduct says consent-based processing will be "a rare situation" for providers. That is the flip side: for a consumer app, consent is your realistic basis.
- **Local-first design:** CNIL's September 2024 recommendation sets two conditions for the GDPR not to apply to a software supplier:
  1. Processing is initiated by and under the control of the user, for their own purposes.
  2. It happens in a sealed environment where the supplier "can no longer act on the data downstream."
  
  CNIL's own health-app example is an app that stores data locally, without outside connection, for exclusively personal purposes. The EDPB is more cautious: it recalls that recital 18 makes the GDPR apply to those who "provide the means" for household processing. Treat CNIL's test as your design spec, and still follow privacy-by-design (recital 78) as good practice.
- **What breaks local-only status:** analytics, error reporting (e.g., Sentry), CDN fonts, or sync that transmit anything. Under the CJEU's Fashion ID ruling (C-40/17), embedding a third-party script that transmits data makes you a joint controller for that transmission. EDPB Guidelines 2/2023 ¶53 say sending locally produced information back to a server is "gaining access" under ePrivacy Art. 5(3). Concretely: serve the catalog as static JSON, run no tracking on the results page, and self-host fonts.
- **Optional account/sync (later):** Supabase in an EU region with RLS; an explicit Art. 9 consent screen; a DPIA (health data plus new technology makes one advisable); a processor agreement; deletion and export; and ideally client-side encryption of the profile blob so the server holds only ciphertext.
- **MDR 2017/745:** under MDCG 2019-11 (rev. 1, June 2025), qualification turns on the **intended purpose you claim** in labelling and marketing. Software for lifestyle, wellness or administrative purposes is not medical-device software. Under Rule 11, software that provides information used for diagnostic or therapeutic decisions starts at class IIa, which would require a notified body, so it is out of reach for a solo MVP. Stay informational:
  - Frame outputs as "which publicly funded screening programs and guideline checks you are eligible for, and when" (eligibility and scheduling against published criteria).
  - Never compute individual disease risk (no own SCORE2 or cancer-risk calculators), interpret results, or say "you have/don't have X".
  - Put a visible "not medical advice, not a medical device" statement and "consult your POZ doctor" call to action on every page.
  - Write and keep a short qualification memo against MDCG 2019-11 explaining why the app is not MDSW. OpenRegulatory recommends documenting the decision "even when the answer is 'not a medical device'".

### 5. Sample core catalog for Polish adults (MVP seed)

| # | Exam | Sex / age | Interval | NFZ-funded / referral | Primary source | Suggested tier |
|---|---|---|---|---|---|---|
| 1 | Mammografia | F 45–74 | 24 mo | Yes / no referral | NFZ breast program; USPSTF B (40–74) | 1 if due |
| 2 | Test HPV HR (or cytologia) | F 25–64 | 60 mo HPV / 36 mo cytology; 12 mo if risk | Yes / no referral | NFZ cervical program (July 2025) | 1 if due |
| 3 | Kolonoskopia przesiewowa | All 50–65; 40–49 with family history | 120 mo | Yes / no referral | NFZ CRC program; EU Council 2022 | 1 if due |
| 4 | NDTK (LDCT) płuc | All 55–74 with ≥20 pack-years, quit ≤15 y; 50–74 with extra risk | Per program | Yes (from 1 Oct 2026) / no referral reported | NFZ/NIO lung program; EU Council 2022 (explore) | 1 (risk-unlocked) |
| 5 | Moje Zdrowie – bilans (CBC, glucose, creatinine/eGFR, lipids, TSH, urinalysis) | All 20–49 / 50+ | 60 mo / 36 mo | Yes / via IKP questionnaire or POZ | pacjent.gov.pl; MZ | 1 if never/overdue, else 2 |
| 6 | Glukoza na czczo / HbA1c | All 45+; any age with risk factors | 36 mo; 12 mo with risk | Via POZ / "Moje Zdrowie" | PTD 2025 | 2 (1 if risk and overdue) |
| 7 | Pomiar ciśnienia tętniczego | All adults | Reviewer to confirm per PTNT/PTK 2024 | POZ / pharmacies can measure | PTNT/PTK 2024 | 2 |
| 8 | Lipidogram (+ Lp(a) once at 20–40) | All adults | With "Moje Zdrowie" | Yes, in "Moje Zdrowie" | MZ program scope | 2 |
| 9 | Ocena ryzyka SCORE2 | All 40+ | With "Moje Zdrowie" | Yes, done by POZ | MZ program scope | 2 (point to POZ; don't compute in-app) |
| 10 | Anty-HCV | Adults with liver risk factors (per questionnaire) | Per POZ | Yes, extended "Moje Zdrowie" | MZ program scope | 2 |
| 11 | FIT (krew utajona w kale) | Per "Moje Zdrowie" questionnaire | Per POZ | Yes, extended "Moje Zdrowie" | MZ program scope | 2 (colonoscopy stays the Tier 1 item) |
| 12 | PSA | M 50+ | Shared decision | Yes, extended "Moje Zdrowie" | MZ scope; USPSTF C; EU Council "evaluate" | 3 |
| 13 | Ocena funkcji poznawczych | All 60+ | With "Moje Zdrowie" | Yes | MZ program scope | 2 |
| 14 | Szczepienia (vaccination review) | All adults | Per IPZ | Partly | "Moje Zdrowie" IPZ | 2 (informational link) |

## Recommendations

1. **Lock the architecture:**
   - Static, versioned catalog in Supabase (public read, no personal data).
   - Profile in `localStorage`/IndexedDB.
   - JSONLogic evaluation in the browser.
   - No third-party scripts on profile or result pages.
   - Drop Astra DB for the MVP: a vector database only makes sense for a RAG chatbot, which you should defer.
2. **Seed the catalog with rows 1–5 first** (the NFZ programs plus "Moje Zdrowie"), then rows 6–14. Mark LDCT `pending_verification` until you have checked the text of the Minister of Health regulation of 14 July 2026 (Dz.U. 2026 poz. 976), under which NFZ contracts start no earlier than 1 October 2026.
3. **Recruit one POZ family doctor as medical reviewer** before public launch. Show reviewer, sources and review date on each item, and schedule reviews every 6 months, plus event-driven reviews on NFZ changes and PTD's annual update.
4. **Use AI where it is safe:** offline extraction of rules into the schema with verbatim quotes, change detection, and pre-generated plain-language summaries (reviewed, stored as static text). Treat an optional "ask about this exam" chatbot as v2. It should get only the exam ID, never the profile, and be covered by its own consent if it ever does.
5. **Write two short compliance documents now:** an MDR qualification memo (intended purpose: informational eligibility/scheduling) and a privacy note explaining local-only processing. Add the DPIA and an Art. 9 consent flow only when you introduce sync.
6. **Differentiate from Akademia NFZ "Kalendarz badań"** through overdue tracking, risk-factor unlocking, "no referral needed" and how-to-access instructions, and reminders stored locally (e.g., .ics export instead of server-side push).

## Caveats

- **Launch dates.** The LDCT program rests on the Minister of Health regulation of 14 July 2026 (Dz.U. 2026 poz. 976, published 22 July 2026), with NFZ contracts starting "nie wcześniej niż" (no earlier than) 1 October 2026, just days after this report's date; this detail comes from a Balticmed summary and press reports (Forsal, Onkopedia). Verify eligibility details and intervals in the Dz.U. text itself.
- **Missing sources.** PTGiP, KLRwP/PTMR adult preventive schedules, NICE, the Canadian Task Force and WHO were not verified in this research. Blood-pressure and prostate intervals are flagged for reviewer confirmation.
- **Uptake figure.** In a parliamentary answer citing Centrum e-Zdrowia, reported by Rynek Zdrowia, Deputy Health Minister Tomasz Maciejewski said that by April 2026 more than 3.6 million people had submitted the "Moje Zdrowie" questionnaire and more than 1.6 million had completed the health check.
- **Regulators disagree on local-only apps.** The CNIL position is persuasive but French; the EDPB is more cautious, and no UODO statement on health apps was found. Local-only design reduces, but does not legally guarantee freedom from, GDPR obligations. Any network transmission of profile data restores full Art. 9 duties.
- **Not legal advice.** This report is research, not legal or medical advice. A one-hour consult with a Polish data-protection lawyer before adding sync is inexpensive insurance.