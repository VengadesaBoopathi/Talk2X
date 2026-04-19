from .query_understanding import understand_query
from .signal_b import run_signal_b
from .subreddit_validator import validate_subreddits
from .relevance_filter import filter_relevant_content
from .subreddit_scraper import fetch_post_comments, scrape_subreddit_posts
from .scorer import score_candidates
from .profile_generator import generate_expert_profile
from ..scraper.reddit_client import get_reddit_client
import asyncio
REDDIT_SEMAPHORE = asyncio.Semaphore(5)
import httpx

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

    
async def run_expert_discovery(query: str) -> list[dict]:
    async with get_reddit_client() as client:
        query_insights = await understand_query(query)
        print("QUERY INSIGHTS:", query_insights)
        
        valid_subreddits = await validate_subreddits(client, query_insights["relevant_subreddits"], query)
        print("VALID SUBREDDITS:", valid_subreddits)
        
        all_post_lists = await asyncio.gather(*[
            scrape_subreddit_safe(client, subreddit, query)
            for subreddit in valid_subreddits
        ])
        all_posts = [post for post_list in all_post_lists for post in post_list]
        print("TOTAL POSTS:", len(all_posts))
        
        all_comment_lists = await asyncio.gather(*[
            fetch_post_comments_safe(client, post)
            for post in all_posts
        ])
        all_comments = [comment for comment_list in all_comment_lists for comment in comment_list]
        print("TOTAL COMMENTS:", len(all_comments))
        
        all_content = all_posts + all_comments
        print("TOTAL CONTENT:", len(all_content))
        
        posts_grouped_by_author = await filter_relevant_content(all_content, query_insights["expertise_signals"])
        print("AUTHORS AFTER FILTER:", list(posts_grouped_by_author.keys()))
        
        preliminary_top_users = await score_candidates(posts_grouped_by_author)
        print("PRELIMINARY TOP USERS:", len(preliminary_top_users))
        
        final_top_users = await run_signal_b(preliminary_top_users)
        print("FINAL TOP USERS:", len(final_top_users))

        final_top_users = await asyncio.gather(*[
            generate_expert_profile(user) for user in final_top_users
        ])

    return final_top_users