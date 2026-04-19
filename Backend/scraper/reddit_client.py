import httpx
from contextlib import asynccontextmanager

REDDIT_BASE_URL = "https://www.reddit.com" 
REDDIT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

@asynccontextmanager
async def get_reddit_client():
    async with httpx.AsyncClient(
        base_url=REDDIT_BASE_URL,
        headers=REDDIT_HEADERS,
        timeout=30.0
    ) as client:
        yield client