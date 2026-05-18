from ..scraper.scraper import fetch_page
import httpx
from ..rag.embeddings import embed_query, embed_documents


async def _get_subreddit_description_from_posts(
    client: httpx.AsyncClient,
    subreddit: str,
) -> str:
    """
    Task 3 fallback: when a subreddit's about.json has no description,
    fetch its top 2 posts and use their titles + selftext as a proxy
    for what the subreddit is actually about.

    This handles niche or lightly-moderated subreddits that never filled
    in their sidebar — they're still valid communities, just not well-described.

    Args:
        client: Configured httpx AsyncClient
        subreddit: Subreddit name without r/ prefix

    Returns:
        Concatenated text from top-2 posts (titles + body), or empty string
        if fetch fails or no posts are found.
    """
    try:
        url = f"/r/{subreddit}/top.json"
        params = {"limit": 2, "t": "month"}
        response = await fetch_page(client, url, params)
        items = response["data"]["children"]

        if not items:
            return ""

        texts = []
        for item in items[:2]:
            data = item["data"]
            title = data.get("title", "")
            body = data.get("selftext", "") or ""
            # Use title always; add body only if it's not a link post
            combined = f"{title} {body}".strip()
            if combined:
                texts.append(combined)

        return " ".join(texts)

    except Exception as e:
        print(f"POST FALLBACK ERROR for r/{subreddit}: {type(e).__name__} - {e}")
        return ""


async def validate_subreddits(
    client: httpx.AsyncClient,
    subreddits: list[str],
    query: str,
    threshold: float = 0.15,
) -> list[str]:
    valid_subreddits = []
    descriptions = []
    result = []

    for subreddit in subreddits:
        try:
            url = f"/r/{subreddit}/about.json"
            response = await fetch_page(client, url, {})

            print(f"DEBUG {subreddit}: Full response type: {type(response)}")
            print(
                f"RAW RESPONSE {subreddit}: "
                f"{response['data'].get('public_description', 'EMPTY')} | "
                f"{response['data'].get('title', 'EMPTY')}"
            )

            description = (
                response["data"].get("public_description", "")
                or response["data"].get("description", "")
                or response["data"].get("display_name", "")
            )
            title = response["data"].get("title", "")
            text = f"{title} {description}".strip()

            print(f"TEXT FOR {subreddit}: '{text}'")

            # ── Task 3: fallback to top-2 posts if about section is empty ──
            if not text:
                print(
                    f"ABOUT SECTION EMPTY for r/{subreddit} — "
                    f"falling back to top-2 posts"
                )
                text = await _get_subreddit_description_from_posts(client, subreddit)
                if text:
                    print(f"POST FALLBACK TEXT for r/{subreddit}: '{text[:120]}...'")
                else:
                    print(f"POST FALLBACK ALSO EMPTY for r/{subreddit} — skipping")
                    continue

            valid_subreddits.append(subreddit)
            descriptions.append(text)

        except httpx.HTTPStatusError as e:
            print(
                f"HTTP ERROR for {subreddit}: "
                f"{e.response.status_code} - {e.response.text}"
            )
            continue
        except KeyError as e:
            print(f"KEY ERROR for {subreddit}: Missing key {e} in response: {response}")
            continue
        except Exception as e:
            print(f"UNEXPECTED ERROR for {subreddit}: {type(e).__name__} - {e}")
            continue

    print(f"VALID SUBREDDITS BEFORE EMBEDDING: {valid_subreddits}")
    print(f"DESCRIPTIONS COUNT: {len(descriptions)}")

    if not valid_subreddits:
        return []

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
