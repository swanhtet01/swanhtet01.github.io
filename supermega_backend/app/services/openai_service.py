import os
from typing import Dict

class OpenAIService:
    def __init__(self):
        # Lazy import to avoid mandatory dependency at import time
        self.api_key = os.getenv('OPENAI_API_KEY')

    def _client(self):
        import openai
        if not self.api_key:
            raise RuntimeError('OPENAI_API_KEY not set')
        openai.api_key = self.api_key
        return openai

    def generate_linkedin_post(self, topic: str, audience: str, brand: str) -> Dict:
        """Generate a LinkedIn-style post. Real OpenAI call if API key set; fallback otherwise."""
        try:
            openai = self._client()
            system = (
                "You are a senior B2B content strategist creating concise, high-signal LinkedIn posts that drive engagement."
            )
            prompt = (
                f"Create a LinkedIn post for {brand} about '{topic}' for {audience}.\n"
                "Constraints: 120-220 words, 1-2 short paragraphs, 1 bullet list if helpful, max 3 hashtags, professional but warm tone."
            )
            resp = openai.ChatCompletion.create(
                model=os.getenv('OPENAI_MODEL', 'gpt-4o-mini'),
                messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                temperature=0.6,
                max_tokens=300,
            )
            content = resp.choices[0].message["content"].strip()
            quality = self._score_quality(content)
            return {"content": content, "quality": quality, "source": "openai"}
        except Exception as e:
            # Safe fallback to keep demo working without key
            content = f"[Draft] {brand} on {topic}: actionable insights for {audience}. #AI #Strategy #Execution"
            return {"content": content, "quality": 65, "source": "fallback", "error": str(e)}

    def _score_quality(self, content: str) -> int:
        words = len(content.split())
        word_score = min(max((words - 80), 0), 140) / 140 * 50  # 0..50
        sentences = max(content.count('.') + content.count('!') + content.count('?'), 1)
        sentence_score = 25 if 2 <= sentences <= 8 else 12
        unique_ratio = len(set(content.lower().split())) / max(words, 1)
        keyword_score = 25 if unique_ratio > 0.5 else 12
        return int(word_score + sentence_score + keyword_score)
