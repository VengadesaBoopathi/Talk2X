from .vector_store import get_or_create_collection,similarity_search

async def retrieve(username: str,query: str,n_results: int = 5) -> list[dict]:
    """
    Retrieves most relevant chunks for a query from a user's vector store.

    Args:
        username: Reddit username to search
        query: Natural language query string
        n_results: Number of chunks to retrieve

    Returns:
        List of dicts with text, score, url, subreddit, created_utc
    """
    vector_embeddings = get_or_create_collection(username)
    results = similarity_search(vector_embeddings,query,n_results)
    return results