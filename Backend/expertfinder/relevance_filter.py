from .subreddit_validator import cosine_similarity
from ..rag.embeddings import embed_documents
import asyncio

def group_by_author(content: list[dict]) -> dict[str, list[dict]]:
    result = {}
    for post in content:
        author = post["author"]
        if author not in result:
            result[author] = []
        result[author].append(post)
    return result

async def embed_in_batches(texts: list[str],batch_size:int=20)->list[list[float]]:
    results=[]
    for i in range(0,len(texts),batch_size):
        batch = texts[i:i+batch_size]
        embeddings  = await embed_documents(batch)
        results.extend(embeddings)
        await asyncio.sleep(1)
    return results

async def filter_relevant_content(content:list[dict],expertise_signals:list[str],threshold:float =0.45)-> dict[str, list[dict]]:
    if not content or not expertise_signals:
        return {}
    content = [post for post in content if post.get("text", "").strip()]
    content = [post for post in content if not any(
        keyword in post.get("author", "").lower()
        for keyword in ["bot", "moderator", "mod", "auto", "spam", "admin"]
    )]
    content = [post for post in content if len(post.get("text", "").split()) >= 30]
    content = content[:150]
    if not content:
        return {}
    filtered_post =[]
    content_texts = [post["text"] for post in content]
    expertise_signals_embeddings,content_embeddings = await asyncio.gather(embed_documents(expertise_signals),embed_in_batches(content_texts))
    
    for j, post_embedding in enumerate(content_embeddings):
        scores = [
            cosine_similarity(post_embedding, sig_emb) for sig_emb in expertise_signals_embeddings
        ]
        avg_score = sum(scores) / len(scores)
        if avg_score >= threshold:
            post_with_score = {**content[j],"avg_similarity":avg_score}
            filtered_post.append(post_with_score)
    
    return group_by_author(filtered_post)
    


