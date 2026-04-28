from .query_understanding import understand_query
from .signal_b import run_signal_b
from .subreddit_validator import validate_subreddits
from .relevance_filter import filter_relevant_content
from .subreddit_scraper import fetch_post_comments, scrape_subreddit_posts
from .scorer import score_candidates
from .profile_generator import generate_expert_profile
from ..scraper.reddit_client import get_reddit_client
import asyncio
from typing import AsyncGenerator
import httpx

REDDIT_SEMAPHORE = asyncio.Semaphore(5)

async def scrape_subreddit_safe(client, subreddit, query):
    async with REDDIT_SEMAPHORE:
        return await scrape_subreddit_posts(client, subreddit, query)

async def fetch_post_comments_safe(client, post):
    async with REDDIT_SEMAPHORE:
        try:
            return await fetch_post_comments(
                client, post["subreddit"], post["id"], post["title"]
            )
        except httpx.HTTPStatusError:
            return []

async def run_expert_discovery_stream(query: str) -> AsyncGenerator[dict, None]:
    """
    Runs the expert discovery pipeline and yields SSE-compatible events
    after each step completes, with intermediate results as data payload.

    Yields dicts with keys: type (str), data (dict)
    """
    async with get_reddit_client() as client:

        # ── Step 1: Query Understanding ──
        query_insights = await understand_query(query)
        yield {
            "type": "step_query",
            "data": {
                "core_topic": query_insights.get("core_topic", ""),
                "related_concepts": query_insights.get("related_concepts", []),
                "relevant_subreddits": query_insights.get("relevant_subreddits", []),
                "expertise_signals": query_insights.get("expertise_signals", []),
            }
        }

        # ── Step 2: Subreddit Validation ──
        valid_subreddits = await validate_subreddits(
            client, query_insights["relevant_subreddits"], query
        )
        yield {
            "type": "step_validate",
            "data": {
                "valid_subreddits": valid_subreddits,
                "total_checked": len(query_insights["relevant_subreddits"]),
                "total_valid": len(valid_subreddits),
            }
        }

        # ── Step 3: Post + Comment Retrieval ──
        all_post_lists = await asyncio.gather(*[
            scrape_subreddit_safe(client, subreddit, query)
            for subreddit in valid_subreddits
        ])
        all_posts = [post for post_list in all_post_lists for post in post_list]

        all_comment_lists = await asyncio.gather(*[
            fetch_post_comments_safe(client, post)
            for post in all_posts
        ])
        all_comments = [comment for comment_list in all_comment_lists for comment in comment_list]
        all_content = all_posts + all_comments

        # Posts per subreddit summary
        subreddit_post_counts = {}
        for post in all_posts:
            sub = post.get("subreddit", "unknown")
            subreddit_post_counts[sub] = subreddit_post_counts.get(sub, 0) + 1

        yield {
            "type": "step_scrape",
            "data": {
                "total_posts": len(all_posts),
                "total_comments": len(all_comments),
                "total_content": len(all_content),
                "per_subreddit": subreddit_post_counts,
            }
        }

        # ── Step 4: Relevance Filter ──
        posts_grouped_by_author = await filter_relevant_content(
            all_content, query_insights["expertise_signals"]
        )
        authors_found = list(posts_grouped_by_author.keys())

        # Build author summary with post count and avg similarity
        author_summary = []
        for author, posts in posts_grouped_by_author.items():
            avg_sim = sum(p.get("avg_similarity", 0) for p in posts) / len(posts) if posts else 0
            author_summary.append({
                "username": author,
                "post_count": len(posts),
                "avg_similarity": round(avg_sim, 3),
            })
        author_summary.sort(key=lambda x: x["avg_similarity"], reverse=True)

        yield {
            "type": "step_filter",
            "data": {
                "authors_found": len(authors_found),
                "authors": author_summary[:20],  # top 20 for display
                "dropped": len(all_content) - sum(len(p) for p in posts_grouped_by_author.values()),
            }
        }

        # ── Step 5: Scoring ──
        preliminary_top_users = await score_candidates(posts_grouped_by_author)
        final_top_users = await run_signal_b(preliminary_top_users)

        scoring_summary = []
        for user in final_top_users:
            scoring_summary.append({
                "username": user["username"],
                "signal_a": round(user.get("signal_a", 0), 3),
                "signal_b": round(user.get("signal_b", 0), 3),
                "signal_c": round(user.get("normalized_signal_c", 0), 3),
                "final_score": round(user.get("final_score", 0), 3),
            })

        yield {
            "type": "step_score",
            "data": {
                "top_users": scoring_summary,
            }
        }

        # ── Step 6: Profile Generation ──
        final_top_users = list(await asyncio.gather(*[
            generate_expert_profile(user) for user in final_top_users
        ]))

        yield {
            "type": "done",
            "data": {
                "experts": final_top_users,
            }
        }


# Keep old function for backward compatibility if needed
async def run_expert_discovery(query: str) -> list[dict]:
    """
    Non-streaming version — collects all stream events and returns final result.
    """
    result = []
    async for event in run_expert_discovery_stream(query):
        if event["type"] == "done":
            result = event["data"].get("experts", [])
    return result
