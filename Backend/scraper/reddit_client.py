import httpx
from contextlib import asynccontextmanager

REDDIT_BASE_URL = "https://old.reddit.com" 
REDDIT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
}
# REDDIT_HEADERS = {
#     "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
# }
# Use the specific format Reddit requests
# REDDIT_HEADERS = {
#     "User-Agent": "python:expert_discovery:v2.0.0"
# }
# REDDIT_HEADERS = {"User-Agent":"Talk2X/1.0"}
@asynccontextmanager
async def get_reddit_client():
    async with httpx.AsyncClient(
        base_url=REDDIT_BASE_URL,
        headers=REDDIT_HEADERS,
        timeout=30.0,
        follow_redirects=True
    ) as client:
        yield client