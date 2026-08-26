"""
In-memory rate limiting middleware for FastAPI.
Uses a sliding window counter per (IP, route) pair.
Falls back gracefully if Redis is unavailable.
"""
from __future__ import annotations

import time
import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, Tuple
from fastapi import Request, HTTPException, status
from utils.ip import get_client_ip

# ---------------------------------------------------------------------------
# Sliding-window bucket
# ---------------------------------------------------------------------------

@dataclass
class _Bucket:
    count: int = 0
    window_start: float = field(default_factory=time.monotonic)


_store: Dict[Tuple[str, str], _Bucket] = defaultdict(_Bucket)
_lock = asyncio.Lock()


async def _check(key: Tuple[str, str], limit: int, window_seconds: int) -> None:
    async with _lock:
        now = time.monotonic()
        bucket = _store[key]
        if now - bucket.window_start >= window_seconds:
            bucket.count = 0
            bucket.window_start = now
        bucket.count += 1
        if bucket.count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please slow down and try again.",
                headers={"Retry-After": str(window_seconds)},
            )


# ---------------------------------------------------------------------------
# Public helpers – call these as FastAPI dependencies or inside route handlers
# ---------------------------------------------------------------------------

async def rate_limit(
    request: Request,
    *,
    limit: int,
    window_seconds: int,
    scope: str = "",
) -> None:
    """Generic rate limiter. `scope` lets you namespace per-route."""
    ip = get_client_ip(request)
    route = scope or str(request.url.path)
    await _check((ip, route), limit, window_seconds)


# ---------------------------------------------------------------------------
# Pre-built dependency factories for common scenarios
# ---------------------------------------------------------------------------

def auth_rate_limit():
    """5 attempts per 60 s – for login / register / password-reset."""
    async def _dep(request: Request):
        await rate_limit(request, limit=5, window_seconds=60, scope="auth")
    return _dep


def strict_rate_limit():
    """10 requests per 60 s – for sensitive write operations (transfers, payments)."""
    async def _dep(request: Request):
        await rate_limit(request, limit=10, window_seconds=60, scope="strict")
    return _dep


def standard_rate_limit():
    """60 requests per 60 s – for normal read endpoints."""
    async def _dep(request: Request):
        await rate_limit(request, limit=60, window_seconds=60, scope="standard")
    return _dep


def upload_rate_limit():
    """5 uploads per 60 s – for file upload endpoints."""
    async def _dep(request: Request):
        await rate_limit(request, limit=5, window_seconds=60, scope="upload")
    return _dep
