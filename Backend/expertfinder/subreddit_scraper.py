from ..scraper/scraper import fetch_page

async def scrape_subreddit_posts(
    client:httpx.AsyncClient,
    subreddit:str,
    topic:str,
    limit:int = 50
)->list[dict]:
    url = f"/r/{subreddit}/search.json"
    params = {
        "q":topic,
        "sort":"top",
        "limit":limit
    }
    response = fetch_page(client,url,params)

    items = response["data"]["children"]
    result = {}
    for item in items:
        data = item["data"]
        if data["author"]=="deleted" or data["author"] = None or data["author"] == "" or data[score] < 1:
            continue
        item[data["post"]]
    return results


async def fetch_post_comments(
    client:httpx.AsyncClient,
    subreddit:str,
    post_id:str
)->list[str]:
