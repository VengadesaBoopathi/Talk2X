def compute_signal_a(posts:list[dict])->float:
    if not posts:
        return 0.0
    number_of_rel_posts = len(posts)
    total_cosine_similarity = sum(post["avg_similarity"] for post in posts)
    return total_cosine_similarity/number_of_rel_posts

def compute_signal_c(posts:list[dict],signal_a:float)->float:
    return  len(posts)*signal_a

async def score_candidates(grouped_candidates: dict[str, list[dict]]) -> list[dict]:
    if not grouped_candidates:
        return []
    
    candidates = []
    for author, posts in grouped_candidates.items():
        signal_a = compute_signal_a(posts)
        signal_c = compute_signal_c(posts, signal_a)
        candidates.append({
            "username": author,
            "posts": posts,
            "signal_a": signal_a,
            "signal_c": signal_c
        })
    
    max_c = max(c["signal_c"] for c in candidates)
    
    for candidate in candidates:
        normalized_c = candidate["signal_c"] / max_c if max_c > 0 else 0
        candidate["normalized_c"] = normalized_c
        candidate["preliminary_score"] = (0.35 * candidate["signal_a"]) + (0.25 * normalized_c)
    
    candidates.sort(key=lambda x: x["preliminary_score"], reverse=True)
    return candidates[:5]