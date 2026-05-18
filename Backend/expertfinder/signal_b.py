import json
import google.generativeai as genai
import os
from dotenv import load_dotenv
import asyncio
import re

from ..rag.chunking import chunk_content

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY is None:
    raise ValueError("GEMINI_API_KEY not set in environment")

genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = genai.GenerativeModel("gemini-2.5-flash-lite")

# ── Task 4: minimum signal_b score to keep a candidate ───────────────────────
# Candidates below this threshold are dropped entirely before final ranking.
# A score of 0.4 means Gemini rated their posts 4/10 or below — not worth
# surfacing to the user as an "expert".
SIGNAL_B_MIN_THRESHOLD = 0.2

# ── Task 6: max chars per chunk sent to Gemini for Signal B evaluation ────────
# chunk_content splits at 512-token boundaries. We send the first N chunks
# from each candidate's top posts rather than trimming mid-sentence at [:300].
SIGNAL_B_MAX_CHUNKS = 4


def _prepare_post_text_for_signal_b(post: dict) -> str:
    """
    Task 6: Instead of truncating post text with [:300] (which cuts off
    mid-sentence and loses context), we run it through the same
    RecursiveCharacterTextSplitter used in the main RAG pipeline and
    take the first SIGNAL_B_MAX_CHUNKS chunks.

    This gives Gemini coherent, complete sentences to evaluate — not
    a fragment that happens to be 300 characters long.

    Args:
        post: Post dict with at minimum 'text', 'id', 'url', 'subreddit',
              'created_utc', 'score' keys (same shape as scraper output).

    Returns:
        Cleaned text string ready to send to the LLM.
    """
    chunks = chunk_content(post)
    if not chunks:
        return post.get("text", "")[:500]  # last-resort fallback

    # Take up to SIGNAL_B_MAX_CHUNKS chunks and join them
    selected = chunks[:SIGNAL_B_MAX_CHUNKS]
    return "\n".join(c["chunk_text"] for c in selected)


async def evaluate_single_candidate(candidate: dict) -> dict:
    """
    Calls Gemini to rate the technical depth of a candidate's top posts.
    Populates candidate["signal_b"] (0.0–1.0) and candidate["final_score"].

    Task 6 change: post text is now chunked instead of truncated at [:300].
    """
    top_posts = sorted(
        candidate["posts"], key=lambda x: x["avg_similarity"], reverse=True
    )[:3]

    # Task 6: use proper chunking instead of [:300] slice
    formatted_posts = "\n".join([
        f"- {_prepare_post_text_for_signal_b(post)}"
        for post in top_posts
    ])

    prompt = f"""
    Rate the technical depth of these Reddit posts on a scale of 1-10.
    Return only valid JSON with no markdown, no backticks: {{"score": <number>, "reasoning": "<string>"}}

    Posts:
    {formatted_posts}"""

    try:
        response = await GEMINI_MODEL.generate_content_async(prompt)
        text = response.text.strip()
        print(f"RAW SIGNAL B RESPONSE for {candidate['username']}: {repr(text)}")
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        parsed = json.loads(text)
        signal_b = parsed["score"] / 10
        candidate["signal_b"] = signal_b
        candidate["final_score"] = (
            (0.40 * signal_b)
            + (0.35 * candidate["signal_a"])
            + (0.25 * candidate["normalized_signal_c"])
        )
    except Exception as e:
        print(f"Signal B failed for {candidate['username']}: {e}")
        candidate["signal_b"] = 0.0
        candidate["final_score"] = (
            (0.35 * candidate["signal_a"])
            + (0.25 * candidate["normalized_signal_c"])
        )

    return candidate


async def run_signal_b(preliminary_top_users: list[dict]) -> list[dict]:
    """
    Evaluates all candidates with Gemini Signal B scoring, then:
      - Task 4: drops any candidate whose signal_b < SIGNAL_B_MIN_THRESHOLD
      - Returns up to top 5 by final_score

    Filtering BEFORE returning means low-quality users never reach the
    profile generation step or the frontend expert cards.
    """
    tasks = [evaluate_single_candidate(candidate) for candidate in preliminary_top_users]
    evaluated_candidates = await asyncio.gather(*tasks)

    # Task 4: hard filter — remove candidates that failed the quality bar
    before_filter = len(evaluated_candidates)
    evaluated_candidates = [
        c for c in evaluated_candidates
        if c.get("signal_b", 0.0) >= SIGNAL_B_MIN_THRESHOLD
    ]
    dropped = before_filter - len(evaluated_candidates)
    if dropped > 0:
        print(
            f"SIGNAL B FILTER: dropped {dropped} candidate(s) "
            f"below threshold {SIGNAL_B_MIN_THRESHOLD}"
        )

    evaluated_candidates.sort(key=lambda x: x["final_score"], reverse=True)
    return evaluated_candidates[:5]
