import asyncio
import httpx
from ..db.crud import get_or_create_user,get_user,should_rescrape,update_scrape_complete,update_scrape_status,log_scrape_error
from sqlalchemy.orm import Session
from .reddit_client import REDDIT_BASE_URL,REDDIT_HEADERS
from ..db.database import get_db,SessionLocal
from ..rag.ingestion import ingest_user_content

async def scrape_user_background(username:str)->None:
    db = SessionLocal()
    try:
        await scrape_user(db,username)
        db.commit()
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()

async def scrape_user(db: Session, username: str) -> dict:
    """
    Main scraping entry point for a Reddit user.
    
    Args:
        db: SQLAlchemy session managed by caller
        username: Reddit username to scrape
        
    Returns:
        dict with keys: posts, comments, skipped
    """

    if not should_rescrape(db,username):
        return {"posts": 0, "comments": 0, "skipped": True}
    user = get_or_create_user(db,username)
    after_timestamp = user.last_scraped_at.timestamp() if user.last_scraped_at else None

    try:
        update_scrape_status(db,username,"in_progress")
        async with httpx.AsyncClient(
            base_url=REDDIT_BASE_URL,
            headers=REDDIT_HEADERS,
            timeout=30.0
        ) as client:
            comments,posts  = await asyncio.gather(
                fetch_all_content(client,username,"comments",after_timestamp),
                fetch_all_content(client,username,"submitted",after_timestamp)
            ) 
            await ingest_user_content(username,posts,comments)
            update_scrape_complete(db,username,len(posts),len(comments))
        return {"posts": len(posts), "comments": len(comments), "skipped": False}
    except Exception as error:
        log_scrape_error(db,username,str(error))
        update_scrape_status(db,username,"failed")
        raise


async def fetch_all_content(client: httpx.AsyncClient,username: str,content_type: str,after_timestamp: float | None) -> list[dict]:
    """
    Fetches all posts or comments for a username newer than after_timestamp.
    Handles pagination automatically via after cursor.
    
    Args:
        client: Configured httpx AsyncClient
        username: Reddit username
        content_type: "submitted" for posts, "comments" for comments
        after_timestamp: Unix timestamp - only fetch content newer than this
        
    Returns:
        List of dicts with id, text, title, url, subreddit, created_utc, score
    """
    url = f"/user/{username}/{content_type}.json"
    after_cursor = None
    results = []

    while True:
        params = {"limit": 100}
        if after_cursor is not None:
            params["after"] = after_cursor

        response = await fetch_page(client, url, params)
        items = response["data"]["children"]

        if not items:
            break

        for item in items:
            data = item["data"]
            if after_timestamp is not None and data["created_utc"] <= after_timestamp: 
                continue
            
            results.append({
                "id": data["id"],
                "text": data.get("body") or data.get("selftext", ""),
                "title": data.get("title", ""),
                "url": f"https://reddit.com{data.get('permalink', '')}",
                "subreddit": data.get("subreddit", ""),
                "created_utc": data["created_utc"],
                "score": data.get("score", 0)
            })

        after_cursor = response["data"].get("after")

        if not after_cursor:
            break
    return results

async def fetch_page(client: httpx.AsyncClient,url: str,params: dict) -> dict:
    """
    Makes a single GET request to Reddit JSON API.
    Retries up to 3 times with exponential backoff on 429.
    
    Args:
        client: Configured httpx AsyncClient
        url: Endpoint URL
        params: Query parameters
        
    Returns:
        Parsed JSON response as dict
        
    Raises:
        httpx.HTTPStatusError: On 404 or other non-200 responses
        httpx.RequestError: On network failures
    """
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            response = await client.get(url, params=params)
            
            if response.status_code == 429:
                if attempt == max_retries - 1:
                    raise httpx.HTTPStatusError(
                        "Rate limit exceeded after max retries",
                        request=response.request,
                        response=response
                    )
                wait = 2 ** attempt
                await asyncio.sleep(wait)
                continue
            elif response.status_code == 404:
                raise httpx.HTTPStatusError(
                    "UserName not Found",
                    request = response.request,
                    response = response
                )
            elif response.status_code != 200:
                raise httpx.HTTPStatusError(
                    f"Unexpected error occured{response.status_code}",
                    request=response.request,
                    response=response
                )
            else:
                return response.json()

            
        except httpx.RequestError as error:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2 ** attempt)

    raise httpx.RequestError("Max retries exceeded with no successful response")