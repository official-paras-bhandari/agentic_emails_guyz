"""Source health cadence and automatic status rules."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional


@dataclass(frozen=True)
class SourceHealthInput:
    source_id: str
    status: str
    failure_rate_7d: float = 0.0
    robots_disallows: bool = False
    repeated_403_429: bool = False
    temporary_block: bool = False
    last_checked_at: Optional[datetime] = None
    recent_failures: bool = False


@dataclass(frozen=True)
class SourceStatusDecision:
    new_status: str
    reason: str
    should_write_event: bool


class SourceHealthChecker:
    """Implements v2.1 source-health cadence and status transitions."""

    def next_check_after(self, status: str, recent_failures: bool = False, temporary_block: bool = False) -> Optional[timedelta]:
        normalized = (status or "unknown").lower()
        if normalized == "unknown":
            return None
        if normalized == "blocked" and not temporary_block:
            return None
        if recent_failures:
            return timedelta(days=1)
        if normalized == "approved":
            return timedelta(days=7)
        if normalized == "limited":
            return timedelta(days=3)
        if normalized == "blocked":
            return timedelta(days=1)
        return timedelta(days=7)

    def due_for_check(self, source: SourceHealthInput, now: Optional[datetime] = None) -> bool:
        cadence = self.next_check_after(source.status, source.recent_failures, source.temporary_block)
        if cadence is None:
            return False
        if source.last_checked_at is None:
            return True
        now = now or datetime.now(timezone.utc)
        checked_at = source.last_checked_at
        if checked_at.tzinfo is None:
            checked_at = checked_at.replace(tzinfo=timezone.utc)
        return checked_at + cadence <= now

    def decide_status(self, source: SourceHealthInput) -> SourceStatusDecision:
        current = (source.status or "unknown").lower()
        if source.robots_disallows:
            return self._decision(current, "blocked", "robots_disallows_crawl_path")
        if source.failure_rate_7d > 0.8 and current == "limited":
            return self._decision(current, "manual_only", "failure_rate_7d_above_80_percent")
        if source.failure_rate_7d > 0.5 and current == "approved":
            return self._decision(current, "limited", "failure_rate_7d_above_50_percent")
        if source.repeated_403_429 and current == "approved":
            return self._decision(current, "limited", "repeated_403_429_reduce_rate_limit")
        return SourceStatusDecision(new_status=current, reason="no_change", should_write_event=False)

    @staticmethod
    def _decision(old_status: str, new_status: str, reason: str) -> SourceStatusDecision:
        return SourceStatusDecision(
            new_status=new_status,
            reason=reason,
            should_write_event=old_status != new_status,
        )


source_health_checker = SourceHealthChecker()
