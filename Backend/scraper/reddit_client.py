import httpx

REDDIT_BASE_URL = "https://www.reddit.com" 
REDDIT_HEADERS ={"User-Agent":"Talk2X/1.0"}

async def get_reddit_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url = REDDIT_BASE_URL,
        headers = REDDIT_HEADERS,
        timeout = 30.0
    )

