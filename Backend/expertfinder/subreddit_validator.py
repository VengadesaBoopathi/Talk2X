from ..scraper.scraper import fetch_page
import httpx
from ..rag.embeddings import embed_query
from ..rag.embeddings import embed_documents

async def validate_subreddits(client:httpx.AsyncClient,subreddits:list[str],query:str,threshold:float=0.55)->list[str]:
    valid_subreddits = []
    descriptions = []
    result =[]

    for subreddit in subreddits:
        try:
            url = f"/r/{subreddit}/about.json"
            response = await fetch_page(client, url, {})
            
            print(f"DEBUG {subreddit}: Full response type: {type(response)}")
            
            print(f"RAW RESPONSE {subreddit}: {response['data'].get('public_description', 'EMPTY')} | {response['data'].get('title', 'EMPTY')}")
            
            description = (response["data"].get("public_description", "") or 
                           response["data"].get("description", "") or 
                           response["data"].get("display_name", ""))
            title = response["data"].get("title", "")
            text = f"{title} {description}".strip()
            
            print(f"TEXT FOR {subreddit}: '{text}'")
            
            if not text:
                continue
                
            valid_subreddits.append(subreddit)
            descriptions.append(text)

        except httpx.HTTPStatusError as e:
            print(f"HTTP ERROR for {subreddit}: {e.response.status_code} - {e.response.text}")
            continue
        except KeyError as e:
            print(f"KEY ERROR for {subreddit}: Missing key {e} in response: {response}")
            continue
        except Exception as e:
            print(f"UNEXPECTED ERROR for {subreddit}: {type(e).__name__} - {e}")
            continue
            
    print(f"VALID SUBREDDITS BEFORE EMBEDDING: {valid_subreddits}")
    print(f"DESCRIPTIONS COUNT: {len(descriptions)}")

    subreddit_embeddings = await embed_documents(descriptions)
    query_embedding = await embed_query(query)

    for i, subreddit_embedding in enumerate(subreddit_embeddings):
        score = cosine_similarity(subreddit_embedding, query_embedding)
        print(f"SUBREDDIT: {valid_subreddits[i]} SCORE: {score}")
        if score >= threshold:
            result.append(valid_subreddits[i])
    return result

def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot_product = sum(x * y for x, y in zip(a, b))
    magnitude_a = sum(x ** 2 for x in a) ** 0.5
    magnitude_b = sum(x ** 2 for x in b) ** 0.5
    if magnitude_a == 0 or magnitude_b == 0:
        return 0.0
    return dot_product / (magnitude_a * magnitude_b)