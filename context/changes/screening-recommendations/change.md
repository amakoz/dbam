---
change_id: screening-recommendations
title: Screening recommendations
status: preparing
created: 2026-09-28
updated: 2026-09-29
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-29 (from F-01 impl review F3): **the launch gate is an S-02 requirement.** Until the POZ doctor has signed off (roadmap #27), recommendations may render only catalog entries with `reviewed_by is not null`, or render the rest in a clearly labelled pre-launch mode. Points for the medical review:
  - Moje Zdrowie evidence level (3 vs the rubric's 2)
  - the PSA age range (50+ vs USPSTF 55–69)
  - "powyżej X" read as X+
  - colonoscopy 120 mo inferred from an exclusion
  - LDCT 50–54 risk factors
