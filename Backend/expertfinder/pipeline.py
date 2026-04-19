from .query_understanding import understand_query
from .signal_b import run_signal_b
from .subreddit_validator import validate_subreddits
from .relevance_filter import filter_relevant_content
from .subreddit_scraper import fetch_post_comments, scrape_subreddit_posts
from .scorer import score_candidates
from .profile_generator import generate_expert_profile
from ..scraper.reddit_client import get_reddit_client
import asyncio

async def run_expert_discovery(query: str) -> list[dict]:

    async with get_reddit_client() as client:
        query_insights = await understand_query(query)
        valid_subreddits = await validate_subreddits(client, query_insights["relevant_subreddits"], query)
        
        all_post_lists = await asyncio.gather(*[
            scrape_subreddit_posts(client, subreddit, query)
            for subreddit in valid_subreddits
        ])
        all_posts = [post for post_list in all_post_lists for post in post_list]
        
        all_comment_lists = await asyncio.gather(*[
            fetch_post_comments(client, post["subreddit"], post["id"], post["title"])
            for post in all_posts
        ])
        all_comments = [comment for comment_list in all_comment_lists for comment in comment_list]

        all_content = all_posts + all_comments
        posts_grouped_by_author = await filter_relevant_content(all_content, query_insights["expertise_signals"])

        preliminary_top_users = await score_candidates(posts_grouped_by_author)
        final_top_users = await run_signal_b(preliminary_top_users)

        final_top_users = await asyncio.gather(*[
            generate_expert_profile(user) for user in final_top_users
        ])

    return final_top_users