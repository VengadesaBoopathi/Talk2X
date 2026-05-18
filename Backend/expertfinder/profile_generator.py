import json
import re
import os
from datetime import datetime

import google.generativeai as genai
from dotenv import load_dotenv

from ..rag.chunking import chunk_content

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY is None:
    raise ValueError("GEMINI_API_KEY not set in environment")

genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = genai.GenerativeModel("gemini-2.5-flash-lite")


def _format_posts_for_profile(posts: list[dict]) -> str:
    """
    Formats posts for the profile prompt using chunked text.

    Uses up to 5 posts sorted by similarity score descending.
    Each post is chunked via the shared RecursiveCharacterTextSplitter and
    only the first 3 chunks are included — enough for Gemini to understand
    the post without blowing up the context window when posts are very long.

    Title and subreddit are always included as context even if the post body
    gets chunked down.
    """
    top = sorted(posts, key=lambda x: x.get("avg_similarity", 0), reverse=True)[:5]
    parts = []
    for i, post in enumerate(top, 1):
        title = post.get("title", "").strip()
        subreddit = post.get("subreddit", "")
        header = f"Post {i}"
        if title:
            header += f' — "{title}"'
        if subreddit:
            header += f" (r/{subreddit})"

        # Chunk the post, take first 3 chunks for the prompt
        chunks = chunk_content(post)
        if chunks:
            body = "\n".join(c["chunk_text"] for c in chunks[:3])
        else:
            # Fallback: post had text but chunker returned nothing
            body = post.get("text", "").strip()[:800]

        parts.append(f"{header}:\n{body}")
    return "\n\n".join(parts)


async def generate_expert_profile(candidate: dict) -> dict:
    """
    Task 5: Generates a structured expert profile from a candidate's posts.

    The prompt is designed to work well with as few as ONE post by asking
    Gemini to reason from observable signals in the text rather than
    requiring a large sample size.

    Observable signals it looks for:
    - Vocabulary and jargon choices  ->  style
    - What the person explains confidently vs hedges on  ->  knowledge_boundaries
    - Which concepts they go deep on vs skim  ->  topics
    - The subreddits the posts come from  ->  top_subreddits

    Even one good post has enough signal for all four fields.

    Task 6: Post text is now passed through chunk_content before being
    inserted into the prompt — no more raw unbounded post text.
    """
    formatted_posts = _format_posts_for_profile(candidate["posts"])
    post_count = len(candidate["posts"])

    prompt = f"""
You are analysing Reddit posts written by a single user to build an expert profile.
You have {post_count} post(s) to work with. Even with a single post, extract every
observable signal carefully — vocabulary, tone, what they explain confidently, what
they hedge on, which subreddits they post in.

Username: {candidate['username']}

Posts:
{formatted_posts}

Return a JSON object with EXACTLY these four fields:

{{
  "topics": [
    "List of specific topics this person demonstrates real knowledge of. "
    "Infer from the concepts they explain, the jargon they use correctly, "
    "and the depth of their reasoning. Be specific — not 'machine learning' "
    "but 'transformer fine-tuning on low-resource datasets'."
  ],
  "style": "One paragraph describing HOW this person communicates: "
           "Do they use analogies? Step-by-step breakdowns? Blunt opinions? "
           "Technical jargon or plain English? Tone: patient, arrogant, "
           "collaborative, didactic? Vocabulary level? Reading their posts, "
           "what would a stranger immediately notice about their writing voice?",
  "top_subreddits": [
    "Subreddits the posts are from. List only what appears in the posts — "
    "do not invent subreddits."
  ],
  "knowledge_boundaries": "One paragraph on the LIMITS of this person's knowledge "
                          "as visible from their posts. Where do they hedge, "
                          "oversimplify, or go quiet? What adjacent topics do "
                          "they avoid or get wrong? If you cannot determine "
                          "boundaries from the available posts, say so explicitly "
                          "rather than inventing limitations."
}}

Rules:
- Return ONLY valid JSON. No markdown. No backticks. No explanation.
- If you only have one post, do your best — do not return empty arrays or blanks.
- Do not hallucinate topics or subreddits not evidenced by the posts.
- knowledge_boundaries must be honest — do not just say "no limitations found".
"""

    try:
        response = await GEMINI_MODEL.generate_content_async(prompt)
        text = response.text.strip()
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        profile = json.loads(text)
        candidate["profile"] = profile
    except Exception as e:
        print(f"Profile generation failed for {candidate['username']}: {e}")
        candidate["profile"] = {
            "topics": [],
            "style": "",
            "top_subreddits": [],
            "knowledge_boundaries": "",
        }

    candidate["generated_at"] = datetime.utcnow().isoformat()
    return candidate
