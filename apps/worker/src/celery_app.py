"""Celery Beat schedule for source health maintenance tasks."""

from celery import Celery

from src.config import config


celery_app = Celery("agentic_outreach_worker", broker=config.REDIS_URL, backend=config.REDIS_URL)

celery_app.conf.beat_schedule = {
    "source_health_check_daily": {
        "task": "src.celery_app.source_health_check_daily",
        "schedule": 24 * 60 * 60,
    },
    "source_robots_refresh": {
        "task": "src.celery_app.source_robots_refresh",
        "schedule": 24 * 60 * 60,
    },
    "source_failure_rate_rollup": {
        "task": "src.celery_app.source_failure_rate_rollup",
        "schedule": 60 * 60,
    },
    "source_auto_status_update": {
        "task": "src.celery_app.source_auto_status_update",
        "schedule": 60 * 60,
    },
}


@celery_app.task(name="src.celery_app.source_health_check_daily")
def source_health_check_daily():
    return {"status": "scheduled", "task": "source_health_check_daily"}


@celery_app.task(name="src.celery_app.source_robots_refresh")
def source_robots_refresh():
    return {"status": "scheduled", "task": "source_robots_refresh"}


@celery_app.task(name="src.celery_app.source_failure_rate_rollup")
def source_failure_rate_rollup():
    return {"status": "scheduled", "task": "source_failure_rate_rollup"}


@celery_app.task(name="src.celery_app.source_auto_status_update")
def source_auto_status_update():
    return {"status": "scheduled", "task": "source_auto_status_update"}
