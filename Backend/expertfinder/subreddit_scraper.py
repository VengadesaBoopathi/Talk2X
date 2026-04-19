from ..scraper.scraper import fetch_page
import httpx
async def scrape_subreddit_posts(
    client:httpx.AsyncClient,
    subreddit:str,
    topic:str,
    limit:int = 5
)->list[dict]:
    url = f"/r/{subreddit}/search.json"
    params = {
        "q":topic,
        "sort":"top",
        "limit":limit
    }
    response = await fetch_page(client,url,params)

    items = response["data"]["children"]
    result = []
    for item in items:
        data = item["data"]
        if (data["author"] == "[deleted]"
        or data["author"] is None 
        or data["author"] == "" 
        or data["score"] < 1):
            continue
        temp ={}

        temp["author"] = data["author"]
        text = data.get("selftext", "") or data.get("body", "")
        if not text.strip():
            continue
        temp["text"] = text
        temp["title"] = data["title"]
        temp["url"] = f"https://reddit.com{data.get('permalink','')}"
        temp["subreddit"] = data["subreddit"]
        temp["score"] = data["score"]
        temp["created_utc"] = data["created_utc"]
        temp["id"] = data["id"]

        result.append(temp)
    return result

async def fetch_post_comments(
    client:httpx.AsyncClient,
    subreddit:str,
    post_id:str,
    post_title:str
)->list[dict]:
    url = f"/r/{subreddit}/comments/{post_id}.json"
    response = await fetch_page(client,url,{})

    items = response[1]["data"]["children"][:5]
    result =[]
    for item in items:
        if item.get("kind") != "t1":
            continue
        data = item["data"]
        if (data["author"] == "[deleted]"
        or data["author"] is None 
        or data["author"] == "" 
        or data["score"] < 1):
            continue
        temp ={}

        temp["author"] = data["author"]
        text = data.get("selftext", "") or data.get("body", "")
        if not text.strip():
            continue
        temp["text"] = text
        temp["title"] = post_title
        temp["url"] = f"https://reddit.com{data.get('permalink','')}"
        temp["score"] = data["score"]
        temp["created_utc"] = data["created_utc"]
        temp["id"] = data["id"]

        result.append(temp)
    return result

