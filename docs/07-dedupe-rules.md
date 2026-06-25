# Deduplication rules

Lead identity is checked within a workspace using normalized exact values: email, domain, phone, business name plus suburb, and source URL. Unsafe substring domain matching is not used.

Every duplicate is skipped before creation and recorded in progress/audit output. Re-running the same discovery job must not increase the lead count.
