async def validate_subreddits(
    client:httpx.AsyncClient,
    subreddits:list[str],
    query:str,
    threshold:float=0.4
)->list[str]: