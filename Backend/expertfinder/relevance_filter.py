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

async def filter_relevant_content(content:list[dict],expertise_signals:list[str],threshold:float =0.3)-> dict[str, list[dict]]:
    if not content or not expertise_signals:
        return {}

    filtered_post =[]
    content_texts = [post["text"] for post in content]
    expertise_signals_embeddings,content_embeddings = await asyncio.gather(embed_documents(expertise_signals),embed_documents(content_texts))
    
    for j, post_embedding in enumerate(content_embeddings):
        scores = [
            cosine_similarity(post_embedding, sig_emb) for sig_emb in expertise_signals_embeddings
        ]
        avg_score = sum(scores) / len(scores)
        if avg_score >= threshold:
            post_with_score = {**content[j],"avg_similarity":avg_score}
            filtered_post.append(post_with_score)
    
    return group_by_author(filtered_post)
    


