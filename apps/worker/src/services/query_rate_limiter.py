"""
QueryRateLimiter — controls the pace of DuckDuckGo search queries.

Splits queries into batches with delays between them to avoid rate limiting.
"""

import random
import time
from typing import Callable, Any, List, Iterator


class QueryRateLimiter:
    """Rate-limit a list of search queries into safe batches."""

    def __init__(
        self,
        batch_size: int = 10,
        min_delay: float = 1.0,
        max_delay: float = 3.0,
        max_batches: int = 20,
    ):
        self.batch_size = batch_size
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.max_batches = max_batches
        self._queries_run = 0

    def batch_queries(self, queries: List[str]) -> List[List[str]]:
        """Split queries into batches."""
        batches = []
        for i in range(0, len(queries), self.batch_size):
            if len(batches) >= self.max_batches:
                break
            batches.append(queries[i : i + self.batch_size])
        return batches

    def run_with_limits(
        self,
        queries: List[str],
        process_batch: Callable[[List[str]], Any],
        stop_early: Callable[[], bool] | None = None,
    ) -> List[Any]:
        """
        Run queries in rate-limited batches.

        Args:
            queries: All queries to run.
            process_batch: Function that processes a batch of queries and returns results.
            stop_early: Optional callable that returns True when enough leads are found.

        Returns:
            List of results from each batch.
        """
        batches = self.batch_queries(queries)
        results = []

        for batch_idx, batch in enumerate(batches):
            # Check if we should stop early
            if stop_early and stop_early():
                break

            # Add delay between batches (not before the first one)
            if batch_idx > 0:
                delay = random.uniform(self.min_delay, self.max_delay)
                time.sleep(delay)

            # Process this batch
            try:
                result = process_batch(batch)
                results.append(result)
                self._queries_run += len(batch)
            except Exception as e:
                print(f"[QueryRateLimiter] Batch {batch_idx} failed: {e}")
                results.append(None)

        return results

    @property
    def queries_run(self) -> int:
        return self._queries_run

    def reset(self):
        self._queries_run = 0
