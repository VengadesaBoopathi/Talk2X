from .subreddit_validator import cosine_similarity
from ..rag.embeddings import embed_documents
from ..rag.chunking import chunk_content
import asyncio


def group_by_author(content: list[dict]) -> dict[str, list[dict]]:
    result = {}
    for post in content:
        author = post["author"]
        if author not in result:
            result[author] = []
        result[author].append(post)
    return result


async def embed_in_batches(texts: list[str], batch_size: int = 20) -> list[list[float]]:
    results = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        embeddings = await embed_documents(batch)
        results.extend(embeddings)
        await asyncio.sleep(1)
    return results


def _chunk_texts_for_post(post: dict) -> list[str]:
    """
    Extracts chunk texts from a post using the shared RecursiveCharacterTextSplitter.

    The expertfinder post dict has the same keys chunk_content expects
    (id, text, url, subreddit, created_utc, score) so we can call it directly.

    Returns list of chunk text strings (never empty — falls back to raw text).
    """
    chunks = chunk_content(post)
    if chunks:
        return [c["chunk_text"] for c in chunks]
    # Fallback: post has text but chunk_content returned nothing (shouldn't happen)
    raw = post.get("text", "").strip()
    return [raw] if raw else []


async def filter_relevant_content(
    content: list[dict],
    expertise_signals: list[str],
    threshold: float = 0.15,
) -> dict[str, list[dict]]:
    """
    Filters posts by semantic similarity to the expertise signals.

    Task 6 change (Signal A):
    Previously: each post → one embedding → one cosine score.
    Problem: a 1500-word post gets one blurred vector. If only 2 paragraphs
    are relevant, that relevance gets diluted by the rest of the post.

    Now: each post → N chunk embeddings → N cosine scores per signal →
    post_score = MAX score across all chunks.

    We use MAX (not mean) because we care whether *any part* of the post
    is deeply relevant to the expertise signals. A post where one paragraph
    nails the topic should pass the filter even if the rest is off-topic.

    The max chunk score is stored as post["avg_similarity"] to stay compatible
    with scorer.py which reads that field for Signal A computation. The name
    is a legacy misnomer — it is now the best-chunk similarity score.

    Args:
        content: List of post/comment dicts from subreddit_scraper
        expertise_signals: List of signal phrases from query_understanding
        threshold: Minimum score for a post to pass the filter

    Returns:
        Dict of author → list of posts that passed, each with avg_similarity set
    """
    if not content or not expertise_signals:
        return {}

    # Basic quality filters — unchanged
    content = [post for post in content if post.get("text", "").strip()]
    content = [post for post in content if not any(
        keyword in post.get("author", "").lower()
        for keyword in ["bot", "moderator", "mod", "auto", "spam", "admin"]
    )]
    content = [post for post in content if len(post.get("text", "").split()) >= 30]
    content = content[:150]

    if not content:
        return {}

    # ── Chunk every post ─────────────────────────────────────────────────────
    # Build a flat list of (post_index, chunk_text) pairs so we can batch
    # embed all chunks across all posts in one call sequence.
    # We track which post each chunk belongs to via post_index.
    post_chunk_map: list[tuple[int, str]] = []  # (post_index, chunk_text)
    for post_idx, post in enumerate(content):
        chunk_texts = _chunk_texts_for_post(post)
        for chunk_text in chunk_texts:
            post_chunk_map.append((post_idx, chunk_text))

    all_chunk_texts = [chunk_text for _, chunk_text in post_chunk_map]

    # Embed expertise signals and all chunks concurrently
    expertise_signals_embeddings, all_chunk_embeddings = await asyncio.gather(
        embed_documents(expertise_signals),
        embed_in_batches(all_chunk_texts),
    )

    # ── Score each post by its best chunk ────────────────────────────────────
    # Accumulate max similarity per post across all its chunks
    post_best_scores: list[float] = [0.0] * len(content)

    for flat_idx, (post_idx, _) in enumerate(post_chunk_map):
        chunk_embedding = all_chunk_embeddings[flat_idx]
        # Score this chunk against every expertise signal, take the average
        # across signals (we want the chunk to be relevant to the topic overall,
        # not just one signal phrase)
        signal_scores = [
            cosine_similarity(chunk_embedding, sig_emb)
            for sig_emb in expertise_signals_embeddings
        ]
        chunk_score = sum(signal_scores) / len(signal_scores)

        # Keep the best chunk score for this post
        if chunk_score > post_best_scores[post_idx]:
            post_best_scores[post_idx] = chunk_score

    # ── Apply threshold and build result ─────────────────────────────────────
    filtered_posts = []
    for post_idx, post in enumerate(content):
        best_score = post_best_scores[post_idx]
        if best_score >= threshold:
            # Store as avg_similarity for scorer.py compatibility
            post_with_score = {**post, "avg_similarity": best_score}
            filtered_posts.append(post_with_score)

    return group_by_author(filtered_posts)
