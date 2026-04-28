from ..scraper.scraper import fetch_page
import httpx

async def scrape_subreddit_posts(
    client: httpx.AsyncClient,
    subreddit: str,
    topic: str,
    limit: int = 15
) -> list[dict]:
    """
    Scrapes top posts from a subreddit matching a topic query.
    Filters deleted authors, low scores, empty text, and link-only posts.

    Args:
        client: Configured httpx AsyncClient
        subreddit: Subreddit name to search in
        topic: Search query string
        limit: Max number of posts to return

    Returns:
        List of post dicts with author, text, title, url, score, created_utc, id
    """
    url = f"/r/{subreddit}/search.json"
    params = {
        "q": topic,
        "sort": "top",
        "t": "all",        # all time — not just today
        "limit": limit,
        "restrict_sr": "on"  # restrict to this subreddit only
    }
    response = await fetch_page(client, url, params)
    items = response["data"]["children"]
    result = []

    for item in items:
        data = item["data"]
        author = data.get("author", "")

        if (not author
            or author == "[deleted]"
            or author == "AutoModerator"
            or any(k in author.lower() for k in ["bot", "mod", "auto", "spam", "admin"])
            or data.get("score", 0) < 5):  # minimum 5 upvotes
            continue

        text = data.get("selftext", "") or data.get("body", "")
        if not text.strip():
            continue

        # Filter link-only posts and removed posts
        if text.strip() in ("[removed]", "[deleted]"):
            continue

        # Minimum 30 words — removes one-liner posts
        if len(text.split()) < 30:
            continue

        result.append({
            "author": author,
            "text": text,
            "title": data.get("title", ""),
            "url": f"https://reddit.com{data.get('permalink', '')}",
            "subreddit": data.get("subreddit", ""),
            "score": data.get("score", 0),
            "created_utc": data.get("created_utc", 0),
            "id": data["id"]
        })

    return result


async def fetch_post_comments(
    client: httpx.AsyncClient,
    subreddit: str,
    post_id: str,
    post_title: str,
    limit: int = 5
) -> list[dict]:
    """
    Fetches top comments for a given post.
    Filters bots, deleted authors, low scores, and short comments.

    Args:
        client: Configured httpx AsyncClient
        subreddit: Subreddit name
        post_id: Reddit post ID
        post_title: Title of the parent post
        limit: Max number of comments to return

    Returns:
        List of comment dicts with author, text, title, url, score, created_utc, id
    """
    url = f"/r/{subreddit}/comments/{post_id}.json"
    response = await fetch_page(client, url, {})
    items = response[1]["data"]["children"][:limit]
    result = []

    for item in items:
        if item.get("kind") != "t1":
            continue

        data = item["data"]
        author = data.get("author", "")

        if (not author
            or author == "[deleted]"
            or author == "AutoModerator"
            or any(k in author.lower() for k in ["bot", "mod", "auto", "spam", "admin"])
            or data.get("score", 0) < 5):  # minimum 5 upvotes
            continue

        text = data.get("body", "") or data.get("selftext", "")
        if not text.strip():
            continue

        if text.strip() in ("[removed]", "[deleted]"):
            continue

        # Minimum 50 words for comments — short comments are noise
        if len(text.split()) < 50:
            continue

        result.append({
            "author": author,
            "text": text,
            "title": post_title,
            "url": f"https://reddit.com{data.get('permalink', '')}",
            "subreddit": subreddit,
            "score": data.get("score", 0),
            "created_utc": data.get("created_utc", 0),
            "id": data["id"]
        })

    return result