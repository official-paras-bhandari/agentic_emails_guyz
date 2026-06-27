"""Resource guards for Playwright rendering."""

import threading
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator, Optional
from urllib.parse import urlparse

import redis

from src.config import config


@dataclass
class RenderLease:
    acquired: bool
    reason: Optional[str] = None


class RenderLimiter:
    """Redis-backed render semaphore with a local fallback for development."""

    def __init__(self, redis_url: str = config.REDIS_URL):
        self.redis_url = redis_url
        self._redis = None
        self._local_lock = threading.Lock()
        self._local_counts: dict[str, int] = {}

    def domain_for_url(self, url: str) -> str:
        parsed = urlparse(url)
        return parsed.netloc.lower().lstrip("www.") or "unknown"

    @contextmanager
    def lease(self, url: str, user_id: Optional[str] = None) -> Iterator[RenderLease]:
        domain = self.domain_for_url(url)
        keys_and_limits = [
            ("render:global:semaphore", config.MAX_CONCURRENT_RENDERS_GLOBAL),
            (f"render:domain:{domain}", config.MAX_CONCURRENT_RENDERS_PER_DOMAIN),
        ]
        if user_id:
            keys_and_limits.append((f"render:user:{user_id}", config.MAX_CONCURRENT_RENDERS_PER_USER))

        acquired_keys: list[str] = []
        try:
            for key, limit in keys_and_limits:
                if not self._acquire(key, limit):
                    self._release_many(acquired_keys)
                    yield RenderLease(False, reason=f"render_limit_reached:{key}")
                    return
                acquired_keys.append(key)
            yield RenderLease(True)
        finally:
            self._release_many(acquired_keys)

    def can_render_page(self, job_id: Optional[str], domain: str) -> bool:
        if not job_id:
            return True
        job_key = f"render:job:{job_id}:pages"
        domain_key = f"render:job:{job_id}:domain:{domain}:pages"
        acquired = []
        try:
            if not self._acquire(job_key, config.MAX_RENDERED_PAGES_PER_JOB):
                return False
            acquired.append(job_key)
            if not self._acquire(domain_key, config.MAX_RENDERED_PAGES_PER_DOMAIN_PER_JOB):
                return False
            return True
        finally:
            if len(acquired) == 1:
                self._release_many(acquired)

    def _client(self):
        if self._redis is None:
            self._redis = redis.Redis.from_url(self.redis_url, socket_connect_timeout=0.2, socket_timeout=0.2)
        return self._redis

    def _acquire(self, key: str, limit: int) -> bool:
        try:
            client = self._client()
            count = client.incr(key)
            client.expire(key, max(config.MAX_RENDER_TIME_SECONDS * 2, 60))
            if count > limit:
                client.decr(key)
                return False
            return True
        except Exception:
            with self._local_lock:
                count = self._local_counts.get(key, 0)
                if count >= limit:
                    return False
                self._local_counts[key] = count + 1
                return True

    def _release_many(self, keys: list[str]) -> None:
        for key in reversed(keys):
            try:
                client = self._client()
                remaining = client.decr(key)
                if remaining <= 0:
                    client.delete(key)
            except Exception:
                with self._local_lock:
                    count = self._local_counts.get(key, 0)
                    if count <= 1:
                        self._local_counts.pop(key, None)
                    else:
                        self._local_counts[key] = count - 1


render_limiter = RenderLimiter()
