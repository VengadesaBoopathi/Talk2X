import json
import google.generativeai as genai
import os
from dotenv import load_dotenv
import asyncio
from datetime import datetime
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY is None:
    raise ValueError("GEMINI_API_KEY not set in environment")

genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = genai.GenerativeModel("gemini-2.5-flash")

async def generate_expert_profile(candidate: dict) -> dict:
    top_posts = sorted(candidate["posts"], key=lambda x: x["avg_similarity"], reverse=True)[:5]
    formatted_posts = "\n".join([f"- {post['text']}" for post in top_posts])
    prompt = f"""
    Create a concise expert profile for a Reddit user based on the following information:
    - Username: {candidate['username']}    
    - Top posts: {formatted_posts}

    Return the profile as a JSON object with the following structure:
    {{
    "topics": ["list of topics this user knows deeply"],
    "style": "how they explain things - analogies, tone, vocabulary",
    "top_subreddits": ["subreddits they dominate"],
    "knowledge_boundaries": "topics where their posts show limited knowledge"
    }}
    Return ONLY valid JSON. No markdown. No backticks. No explanation.
    """
    
    try:
        response = await GEMINI_MODEL.generate_content_async(prompt)
        profile = json.loads(response.text)
        candidate["profile"] = profile
        candidate["generated_at"] = datetime.utcnow().isoformat()
    except Exception:
        candidate["profile"] = {
            "topics": [],
            "style": "",
            "top_subreddits": [],
            "knowledge_boundaries": ""
        }
        candidate["generated_at"] = datetime.utcnow().isoformat()
    
    return candidate