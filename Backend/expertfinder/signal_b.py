import json
import google.generativeai as genai
import os
from dotenv import load_dotenv
import asyncio
load_dotenv()
import re 

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY is None:
    raise ValueError("GEMINI_API_KEY not set in environment")

genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = genai.GenerativeModel("gemini-2.5-flash-lite")


async def evaluate_single_candidate(candidate: dict) -> dict:
    top_posts = sorted(candidate["posts"], key=lambda x: x["avg_similarity"], reverse=True)[:3]
    formatted_posts = "\n".join([f"- {post['text'][:300]}" for post in top_posts])

    prompt = f"""
    Rate the technical depth of these Reddit posts on a scale of 1-10.
    Return only valid JSON with no markdown, no backticks: {{"score": <number>, "reasoning": "<string>"}}

    Posts:
    {formatted_posts}"""
    
    try:
        response = await GEMINI_MODEL.generate_content_async(prompt)
        # Strip markdown code fences if present
        text = response.text.strip()
        print(f"RAW SIGNAL B RESPONSE for {candidate["username"]}:{repr(text)}" )
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        parsed = json.loads(text)
        signal_b = parsed["score"] / 10
        candidate["signal_b"] = signal_b
        candidate["final_score"] = (
            (0.40 * signal_b) +
            (0.35 * candidate["signal_a"]) +
            (0.25 * candidate["normalized_signal_c"])
        )
    except Exception as e:
        print(f"Signal B failed for {candidate['username']}: {e}")
        candidate["signal_b"] = 0.0
        candidate["final_score"] = (
            (0.35 * candidate["signal_a"]) +
            (0.25 * candidate["normalized_signal_c"])
        )
    
    return candidate


async def run_signal_b(preliminary_top_users: list[dict]) -> list[dict]:    
    tasks = [evaluate_single_candidate(candidate) for candidate in preliminary_top_users]
    evaluated_candidates = await asyncio.gather(*tasks)
    evaluated_candidates.sort(key=lambda x: x["final_score"], reverse=True)
    return evaluated_candidates[:5]
