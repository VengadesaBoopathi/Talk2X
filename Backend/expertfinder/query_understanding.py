import asyncio
import os
import google.generativeai as genai
from dotenv import load_dotenv
import json
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY is None:
    raise ValueError("GEMINI_API_KEY not set in environment")

genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = genai.GenerativeModel("gemini-2.5-flash")

async def understand_query(query: str)->dict:
    system_prompt = f"""
    You are an expert analyst identifying genuine domain expertise on Reddit.

    Given a topic query, return a JSON object with exactly these fields:

    {{
        "core_topic": "canonical name of the topic",
        "related_concepts": ["list of deep sub-topics that only genuine experts discuss"],
        "relevant_subreddits": ["list of subreddit names without r/ prefix"],
        "expertise_signals": ["specific phrases, terminology, and concepts that distinguish genuine experts from beginners in this domain"]
    }}

    Rules:
    - Return ONLY valid JSON. No markdown. No backticks. No explanation.
    - expertise_signals must be specific technical terms, not generic phrases like 'deep knowledge'
    - relevant_subreddits must be real active Reddit communities
    - related_concepts must go beyond surface level — include niche sub-topics

    Query: {query}
    """
    result = await GEMINI_MODEL.generate_content_async(system_prompt)

    try:
        parsed = json.loads(result.text)
        return parsed
    except json.JSONDecodeError:
        raise ValueError(f"Gemini returned invalid JSON {result.text}")