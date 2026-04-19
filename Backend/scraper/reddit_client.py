import httpx
from contextlib import asynccontextmanager

REDDIT_BASE_URL = "https://www.reddit.com" 
REDDIT_HEADERS = {"User-Agent":"Talk2X/1.0"}


@asynccontextmanager
async def get_reddit_client():
    async with httpx.AsyncClient(
        base_url=REDDIT_BASE_URL,
        headers=REDDIT_HEADERS,
        timeout=30.0
    ) as client:
        yield client