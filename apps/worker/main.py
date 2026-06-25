"""Compatibility entry point for running the worker API directly."""

import os

import uvicorn

from src.main import app


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
