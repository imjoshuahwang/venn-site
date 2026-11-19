# 0004: Minor detection uses applications.level

Date: 2026-11-18. Status: accepted.

Under-18 is `applications.level = 'high_school'`, read through `isMinor()` and the `minor` field of `consent_state`. A date-of-birth question would be more exact (a high-school senior can be 18), but `level` is already collected on the apply form, so it adds no new question or stored personal data. Minors continue to the parent co-sign route (#128). Revisit if #128 needs exact age.
