#!/usr/bin/env python3
"""
Super Mega Translation Agent
Professional multi-lingual translation with context awareness and quality assurance
"""

import os
import json
import requests
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from googletrans import Translator
import openai

class TranslationAgent:
    """
    Professional translation agent with multiple provider support
    """
    
    def __init__(self):
        self.google_api_key = os.getenv('GOOGLE_TRANSLATE_API_KEY')
        self.deepl_api_key = os.getenv('DEEPL_API_KEY')
        self.azure_api_key = os.getenv('AZURE_TRANSLATOR_API_KEY')
        self.openai_api_key = os.getenv('OPENAI_API_KEY')
        
        # Initialize available translators
        self.translators = {}
        self.setup_translators()
        
        # Language configurations
        self.supported_languages = {
            'en': 'English',
            'es': 'Spanish', 
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'zh': 'Chinese (Simplified)',
            'ja': 'Japanese',
            'ko': 'Korean',
            'ar': 'Arabic',
            'hi': 'Hindi',
            'tr': 'Turkish',
            'pl': 'Polish',
            'nl': 'Dutch',
            'sv': 'Swedish',
            'da': 'Danish',
            'no': 'Norwegian',
            'fi': 'Finnish'
        }
        
        # Quality scoring criteria
        self.quality_metrics = {
            'length_consistency': 0.2,
            'context_preservation': 0.3,
            'cultural_adaptation': 0.2,
            'technical_accuracy': 0.3
        }
        
    def setup_translators(self):
        """Initialize available translation services"""
        
        try:
            # Google Translate (free tier)
            self.translators['google_free'] = Translator()
            print("✅ Google Translate (free) initialized")
        except Exception as e:
            print(f"⚠️ Google Translate (free) initialization failed: {e}")
        
        if self.google_api_key:
            self.translators['google_api'] = 'google_cloud'
            print("✅ Google Cloud Translation API available")
        
        if self.deepl_api_key:
            self.translators['deepl'] = 'deepl_api'
            print("✅ DeepL API available")
            
        if self.azure_api_key:
            self.translators['azure'] = 'azure_translator'
            print("✅ Azure Translator available")
            
        if self.openai_api_key:
            self.translators['openai'] = 'openai_translation'
            print("✅ OpenAI Translation available")
    
    def translate_content(self, 
                         text: str,
                         source_lang: str,
                         target_lang: str,
                         content_type: str = 'general',
                         preserve_formatting: bool = True,
                         cultural_adaptation: bool = True) -> Dict:
        """
        Translate content with quality assurance
        
        Args:
            text: Text to translate
            source_lang: Source language code
            target_lang: Target language code
            content_type: Type of content (marketing, technical, legal, etc.)
            preserve_formatting: Whether to preserve original formatting
            cultural_adaptation: Whether to adapt for cultural context
            
        Returns:
            Dict with translation results and quality metrics
        """
        
        if source_lang not in self.supported_languages:
            return {'error': f'Source language {source_lang} not supported'}
            
        if target_lang not in self.supported_languages:
            return {'error': f'Target language {target_lang} not supported'}
        
        # Try multiple translation services for quality comparison
        translations = {}
        
        # Google Translate (free)
        if 'google_free' in self.translators:
            translations['google_free'] = self._translate_google_free(text, source_lang, target_lang)
        
        # OpenAI Translation (context-aware)
        if 'openai' in self.translators:
            translations['openai'] = self._translate_openai(text, source_lang, target_lang, content_type, cultural_adaptation)
        
        # DeepL API (if available)
        if 'deepl' in self.translators:
            translations['deepl'] = self._translate_deepl(text, source_lang, target_lang)
        
        # Select best translation
        best_translation = self._select_best_translation(translations, text, content_type)
        
        # Calculate quality score
        quality_score = self._calculate_translation_quality(text, best_translation, source_lang, target_lang)
        
        return {
            'original_text': text,
            'translated_text': best_translation,
            'source_language': self.supported_languages[source_lang],
            'target_language': self.supported_languages[target_lang],
            'content_type': content_type,
            'quality_score': quality_score,
            'translation_method': 'multi_provider_comparison',
            'cultural_adaptation': cultural_adaptation,
            'timestamp': datetime.now().isoformat(),
            'word_count_original': len(text.split()),
            'word_count_translated': len(best_translation.split()),
            'all_translations': translations if len(translations) > 1 else None
        }
    
    def _translate_google_free(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate using free Google Translate"""
        try:
            translator = self.translators['google_free']
            result = translator.translate(text, src=source_lang, dest=target_lang)
            return result.text
        except Exception as e:
            print(f"Google Translate error: {e}")
            return text
    
    def _translate_openai(self, text: str, source_lang: str, target_lang: str, content_type: str, cultural_adaptation: bool) -> str:
        """Translate using OpenAI with context awareness"""
        
        if not self.openai_api_key:
            return text
            
        source_language_name = self.supported_languages[source_lang]
        target_language_name = self.supported_languages[target_lang]
        
        context_prompt = f"""
        You are a professional translator specializing in {content_type} content.
        
        Translate the following {source_language_name} text to {target_language_name}:
        
        Requirements:
        - Maintain original meaning and tone
        - Adapt for {target_language_name} cultural context: {'Yes' if cultural_adaptation else 'No'}
        - Preserve any technical terminology appropriately
        - Keep the same level of formality
        
        Text to translate:
        {text}
        
        Provide only the translation, no explanations.
        """
        
        try:
            openai.api_key = self.openai_api_key
            response = openai.ChatCompletion.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "You are an expert professional translator."},
                    {"role": "user", "content": context_prompt}
                ],
                max_tokens=1500,
                temperature=0.3
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            print(f"OpenAI translation error: {e}")
            return text
    
    def _translate_deepl(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate using DeepL API"""
        
        if not self.deepl_api_key:
            return text
            
        try:
            url = "https://api-free.deepl.com/v2/translate"
            
            params = {
                'auth_key': self.deepl_api_key,
                'text': text,
                'source_lang': source_lang.upper(),
                'target_lang': target_lang.upper()
            }
            
            response = requests.post(url, data=params)
            result = response.json()
            
            if 'translations' in result:
                return result['translations'][0]['text']
            else:
                print(f"DeepL error: {result}")
                return text
                
        except Exception as e:
            print(f"DeepL translation error: {e}")
            return text
    
    def _select_best_translation(self, translations: Dict, original_text: str, content_type: str) -> str:
        """Select the best translation from available options"""
        
        if not translations:
            return original_text
            
        if len(translations) == 1:
            return list(translations.values())[0]
        
        # Priority order based on quality and context awareness
        priority_order = ['openai', 'deepl', 'google_free']
        
        for provider in priority_order:
            if provider in translations:
                return translations[provider]
        
        # Fallback to first available
        return list(translations.values())[0]
    
    def _calculate_translation_quality(self, original: str, translated: str, source_lang: str, target_lang: str) -> float:
        """Calculate translation quality score"""
        
        score = 100.0
        
        # Length consistency check
        original_length = len(original.split())
        translated_length = len(translated.split())
        
        if original_length > 0:
            length_ratio = translated_length / original_length
            
            # Expect some variance in length between languages
            if length_ratio < 0.5 or length_ratio > 2.0:
                score -= 20
            elif length_ratio < 0.7 or length_ratio > 1.5:
                score -= 10
        
        # Check for untranslated content (same as original)
        if original == translated and source_lang != target_lang:
            score -= 30
        
        # Check for common translation issues
        if '[' in translated or ']' in translated:
            score -= 5  # Possible untranslated placeholders
            
        # Bonus for proper capitalization
        if translated and translated[0].isupper():
            score += 5
            
        return max(0.0, min(100.0, score))
    
    def batch_translate(self, texts: List[str], source_lang: str, target_lang: str, content_type: str = 'general') -> List[Dict]:
        """Translate multiple texts efficiently"""
        
        results = []
        
        for i, text in enumerate(texts):
            print(f"Translating {i+1}/{len(texts)}: {text[:50]}...")
            
            result = self.translate_content(
                text=text,
                source_lang=source_lang,
                target_lang=target_lang,
                content_type=content_type
            )
            
            results.append(result)
            
        return results
    
    def detect_language(self, text: str) -> Dict:
        """Detect the language of given text"""
        
        if 'google_free' in self.translators:
            try:
                translator = self.translators['google_free']
                detection = translator.detect(text)
                
                return {
                    'detected_language': detection.lang,
                    'language_name': self.supported_languages.get(detection.lang, 'Unknown'),
                    'confidence': detection.confidence,
                    'method': 'google_translate'
                }
                
            except Exception as e:
                print(f"Language detection error: {e}")
                
        return {
            'detected_language': 'unknown',
            'language_name': 'Unknown',
            'confidence': 0.0,
            'method': 'failed'
        }
    
    def get_supported_languages(self) -> Dict[str, str]:
        """Get list of supported languages"""
        return self.supported_languages.copy()
    
    def validate_translation_quality(self, original: str, translated: str, threshold: float = 70.0) -> bool:
        """Validate if translation meets quality threshold"""
        
        quality_score = self._calculate_translation_quality(original, translated, 'en', 'es')  # Generic check
        return quality_score >= threshold

# Usage example and testing
if __name__ == "__main__":
    agent = TranslationAgent()
    
    # Test translation
    test_content = """
    Super Mega Inc provides enterprise AI solutions that transform business operations. 
    Our advanced agents deliver measurable results with professional reliability.
    """
    
    result = agent.translate_content(
        text=test_content,
        source_lang='en',
        target_lang='es',
        content_type='marketing',
        cultural_adaptation=True
    )
    
    print("Translation Result:")
    print("=" * 50)
    print(f"Original: {result['original_text']}")
    print(f"Translated: {result['translated_text']}")
    print(f"Quality Score: {result['quality_score']}/100")
    print(f"Method: {result['translation_method']}")
    
    # Test language detection
    detection = agent.detect_language("Bonjour, comment allez-vous?")
    print(f"\nLanguage Detection: {detection}")
