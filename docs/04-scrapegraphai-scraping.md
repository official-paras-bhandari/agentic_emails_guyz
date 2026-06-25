# Lead discovery and scraping

The Python worker plans a bounded search, extracts public business data, normalizes it, and reports signed events to the web backend. Each job is limited by site count, pages per site, concurrency, and a global timeout.

`MOCK_MODE=true` provides deterministic local fixtures. Live mode requires a configured model/provider. Failures are raised to RQ for retry and are also reported to the job record. Cancellation is checked between stages and sites.
