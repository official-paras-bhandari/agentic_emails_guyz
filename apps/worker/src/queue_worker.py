import os
import sys
import platform
from redis import Redis
from rq import Worker, SimpleWorker, Queue

# Ensure we can import from src
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config import config

# Note: The worker needs to be able to import all dependencies used in workflows
listen = ["agentic_outreach_jobs"]

def start_worker():
    conn = Redis.from_url(config.REDIS_URL)
    queues = [Queue(name, connection=conn) for name in listen]
    worker_class = SimpleWorker if platform.system() == "Darwin" or os.getenv("RQ_SIMPLE_WORKER") == "true" else Worker
    worker = worker_class(queues, connection=conn)
    print("Starting Durable Job Worker...")
    worker.work()

if __name__ == "__main__":
    start_worker()
