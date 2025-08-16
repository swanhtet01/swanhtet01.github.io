#!/usr/bin/env python3
"""
Super Mega Image Generation Agent
Professional AI-powered visual content creation with brand consistency
"""

import os
import json
import requests
import openai
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from PIL import Image, ImageDraw, ImageFont
import io
import base64

class ImageGenerationAgent:
    """
    Professional image generation agent with multiple AI providers
    """
    
    def __init__(self):
        self.openai_api_key = os.getenv('OPENAI_API_KEY')
        self.stability_api_key = os.getenv('STABILITY_API_KEY')
        self.midjourney_api_key = os.getenv('MIDJOURNEY_API_KEY')  # When available
        
        # Brand configuration
        self.brand_config = {
            'primary_colors': ['#ff6b6b', '#4ecdc4', '#45b7d1'],
            'secondary_colors': ['#0a0e1a', '#1a1a2e', '#0f0f23'],
            'brand_fonts': ['Inter', 'Helvetica', 'Arial'],
            'logo_path': 'images/logo.png',
            'style_guidelines': {
                'professional': 'Clean, modern, corporate aesthetic',
                'creative': 'Innovative, dynamic, artistic elements', 
                'technical': 'Precise, detailed, technical visualization',
                'marketing': 'Engaging, persuasive, customer-focused'
            }
        }
        
        # Image templates and styles
        self.image_types = {
            'social_media': {
                'dimensions': [(1080, 1080), (1200, 630), (1024, 512)],
                'formats': ['Instagram Square', 'Facebook Post', 'Twitter Header'],
                'text_overlay': True
            },
            'blog_header': {
                'dimensions': [(1200, 600), (1920, 1080)],
                'formats': ['Standard Header', 'Hero Image'],
                'text_overlay': True
            },
            'product_showcase': {
                'dimensions': [(800, 800), (1200, 800)],
                'formats': ['Product Square', 'Product Banner'],
                'text_overlay': False
            },
            'presentation': {
                'dimensions': [(1920, 1080), (1280, 720)],
                'formats': ['Full HD', 'HD'],
                'text_overlay': True
            }
        }
        
        # Initialize available providers
        self.providers = {}
        self.setup_providers()
    
    def setup_providers(self):
        """Initialize available image generation providers"""
        
        if self.openai_api_key:
            openai.api_key = self.openai_api_key
            self.providers['dalle3'] = 'OpenAI DALL-E 3'
            print("✅ OpenAI DALL-E 3 available")
        
        if self.stability_api_key:
            self.providers['stable_diffusion'] = 'Stability AI'
            print("✅ Stability AI available")
        
        # Placeholder for other providers
        self.providers['template'] = 'Template Generation'
        print("✅ Template-based generation available")
    
    def generate_image(self,
                      prompt: str,
                      image_type: str = 'social_media',
                      style: str = 'professional',
                      dimensions: Tuple[int, int] = (1024, 1024),
                      text_overlay: str = '',
                      brand_integration: bool = True) -> Dict:
        """
        Generate image based on parameters
        
        Args:
            prompt: Image description/prompt
            image_type: Type of image (social_media, blog_header, etc.)
            style: Brand style (professional, creative, technical, marketing)
            dimensions: Image dimensions (width, height)
            text_overlay: Text to overlay on image
            brand_integration: Whether to integrate brand elements
            
        Returns:
            Dict with generated image data and metadata
        """
        
        # Enhance prompt with brand context
        enhanced_prompt = self._enhance_prompt_with_brand(prompt, style, brand_integration)
        
        # Try providers in order of preference
        image_data = None
        generation_method = 'failed'
        
        if 'dalle3' in self.providers:
            image_data, generation_method = self._generate_dalle3(enhanced_prompt, dimensions)
        
        if not image_data and 'stable_diffusion' in self.providers:
            image_data, generation_method = self._generate_stable_diffusion(enhanced_prompt, dimensions)
        
        if not image_data:
            image_data, generation_method = self._generate_template_image(prompt, style, dimensions)
        
        # Add text overlay if requested
        if text_overlay and image_data:
            image_data = self._add_text_overlay(image_data, text_overlay, style)
        
        # Add brand elements if requested
        if brand_integration and image_data:
            image_data = self._add_brand_elements(image_data)
        
        return {
            'image_data': image_data,
            'prompt': prompt,
            'enhanced_prompt': enhanced_prompt,
            'image_type': image_type,
            'style': style,
            'dimensions': dimensions,
            'text_overlay': text_overlay,
            'brand_integration': brand_integration,
            'generation_method': generation_method,
            'timestamp': datetime.now().isoformat(),
            'quality_score': self._calculate_image_quality_score(image_data, prompt),
            'file_size_estimate': len(image_data) if image_data else 0
        }
    
    def _enhance_prompt_with_brand(self, prompt: str, style: str, brand_integration: bool) -> str:
        """Enhance prompt with brand-specific context"""
        
        style_description = self.brand_config['style_guidelines'].get(style, 'professional')
        
        enhanced = f"{prompt}, {style_description}"
        
        if brand_integration:
            enhanced += f", incorporating corporate colors {', '.join(self.brand_config['primary_colors'])}"
            enhanced += ", modern professional aesthetic"
            enhanced += ", high quality, 4K resolution"
        
        # Add technical quality specifications
        enhanced += ", sharp focus, professional lighting, clean composition"
        
        return enhanced
    
    def _generate_dalle3(self, prompt: str, dimensions: Tuple[int, int]) -> Tuple[Optional[str], str]:
        """Generate image using DALL-E 3"""
        
        try:
            # DALL-E 3 specific size handling
            dalle_size = "1024x1024"  # Default
            if dimensions[0] > dimensions[1]:
                dalle_size = "1792x1024"  # Landscape
            elif dimensions[1] > dimensions[0]:
                dalle_size = "1024x1792"  # Portrait
            
            response = openai.Image.create(
                model="dall-e-3",
                prompt=prompt[:4000],  # DALL-E 3 prompt limit
                size=dalle_size,
                quality="hd",
                response_format="b64_json",
                n=1
            )
            
            image_data = response.data[0].b64_json
            return image_data, 'DALL-E 3'
            
        except Exception as e:
            print(f"DALL-E 3 generation error: {e}")
            return None, 'failed'
    
    def _generate_stable_diffusion(self, prompt: str, dimensions: Tuple[int, int]) -> Tuple[Optional[str], str]:
        """Generate image using Stability AI"""
        
        try:
            url = "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image"
            
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.stability_api_key}",
            }
            
            body = {
                "text_prompts": [
                    {
                        "text": prompt,
                        "weight": 1
                    }
                ],
                "cfg_scale": 7,
                "height": dimensions[1],
                "width": dimensions[0],
                "steps": 30,
                "samples": 1,
            }
            
            response = requests.post(url, headers=headers, json=body)
            
            if response.status_code == 200:
                data = response.json()
                image_data = data["artifacts"][0]["base64"]
                return image_data, 'Stability AI'
            else:
                print(f"Stability AI error: {response.status_code}")
                return None, 'failed'
                
        except Exception as e:
            print(f"Stability AI generation error: {e}")
            return None, 'failed'
    
    def _generate_template_image(self, prompt: str, style: str, dimensions: Tuple[int, int]) -> Tuple[str, str]:
        """Generate template-based image as fallback"""
        
        # Create a professional template image
        img = Image.new('RGB', dimensions, color=self.brand_config['secondary_colors'][0])
        draw = ImageDraw.Draw(img)
        
        # Add gradient background
        for i in range(dimensions[1]):
            alpha = i / dimensions[1]
            color = self._interpolate_color(
                self.brand_config['secondary_colors'][0], 
                self.brand_config['primary_colors'][0], 
                alpha * 0.3
            )
            draw.line([(0, i), (dimensions[0], i)], fill=color)
        
        # Add geometric shapes for visual interest
        center_x, center_y = dimensions[0] // 2, dimensions[1] // 2
        
        # Draw circles
        for radius in [100, 150, 200]:
            draw.ellipse(
                [center_x - radius, center_y - radius, center_x + radius, center_y + radius],
                outline=self.brand_config['primary_colors'][1],
                width=2
            )
        
        # Add text placeholder
        try:
            # Try to load font (fallback to default if not available)
            font_size = min(dimensions) // 20
            font = ImageFont.load_default()
        except:
            font = ImageFont.load_default()
        
        text_lines = [
            "SUPER MEGA",
            "Enterprise AI Solutions",
            prompt[:30] + "..." if len(prompt) > 30 else prompt
        ]
        
        y_offset = center_y - (len(text_lines) * 30) // 2
        for line in text_lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            text_width = bbox[2] - bbox[0]
            x = (dimensions[0] - text_width) // 2
            draw.text((x, y_offset), line, fill='white', font=font)
            y_offset += 40
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG', optimize=True, quality=95)
        image_data = base64.b64encode(buffer.getvalue()).decode()
        
        return image_data, 'Template Generation'
    
    def _interpolate_color(self, color1: str, color2: str, alpha: float) -> str:
        """Interpolate between two hex colors"""
        
        # Convert hex to RGB
        c1 = tuple(int(color1[i:i+2], 16) for i in (1, 3, 5))
        c2 = tuple(int(color2[i:i+2], 16) for i in (1, 3, 5))
        
        # Interpolate
        result = tuple(int(c1[i] + (c2[i] - c1[i]) * alpha) for i in range(3))
        
        # Convert back to hex
        return f"#{result[0]:02x}{result[1]:02x}{result[2]:02x}"
    
    def _add_text_overlay(self, image_data: str, text: str, style: str) -> str:
        """Add text overlay to image"""
        
        try:
            # Decode base64 image
            img_bytes = base64.b64decode(image_data)
            img = Image.open(io.BytesIO(img_bytes))
            draw = ImageDraw.Draw(img)
            
            # Configure text style based on brand style
            font_size = min(img.size) // 15
            font = ImageFont.load_default()
            
            # Position text (bottom center with padding)
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            x = (img.size[0] - text_width) // 2
            y = img.size[1] - text_height - 50
            
            # Add semi-transparent background
            padding = 20
            background_bbox = [x - padding, y - padding, x + text_width + padding, y + text_height + padding]
            overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            overlay_draw.rectangle(background_bbox, fill=(0, 0, 0, 128))
            
            img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
            draw = ImageDraw.Draw(img)
            
            # Draw text
            draw.text((x, y), text, fill='white', font=font)
            
            # Convert back to base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True, quality=95)
            return base64.b64encode(buffer.getvalue()).decode()
            
        except Exception as e:
            print(f"Text overlay error: {e}")
            return image_data
    
    def _add_brand_elements(self, image_data: str) -> str:
        """Add brand logo and elements to image"""
        
        try:
            # Decode base64 image
            img_bytes = base64.b64decode(image_data)
            img = Image.open(io.BytesIO(img_bytes))
            
            # Add Super Mega watermark in corner
            draw = ImageDraw.Draw(img)
            font = ImageFont.load_default()
            
            watermark_text = "SUPER MEGA"
            bbox = draw.textbbox((0, 0), watermark_text, font=font)
            text_width = bbox[2] - bbox[0]
            
            # Position in bottom right
            x = img.size[0] - text_width - 20
            y = img.size[1] - 40
            
            # Semi-transparent background
            overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            overlay_draw.rectangle([x-10, y-5, x+text_width+10, y+25], fill=(0, 0, 0, 100))
            
            img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
            draw = ImageDraw.Draw(img)
            
            # Draw watermark
            draw.text((x, y), watermark_text, fill=self.brand_config['primary_colors'][1], font=font)
            
            # Convert back to base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True, quality=95)
            return base64.b64encode(buffer.getvalue()).decode()
            
        except Exception as e:
            print(f"Brand elements error: {e}")
            return image_data
    
    def _calculate_image_quality_score(self, image_data: Optional[str], prompt: str) -> float:
        """Calculate image quality score"""
        
        if not image_data:
            return 0.0
        
        score = 100.0
        
        # Basic checks
        if len(image_data) < 1000:  # Too small
            score -= 50
        
        # Prompt relevance (simplified check)
        if len(prompt) < 10:
            score -= 10
        elif len(prompt) > 1000:
            score -= 5
        
        return max(0.0, min(100.0, score))
    
    def batch_generate_images(self, prompts: List[str], **kwargs) -> List[Dict]:
        """Generate multiple images efficiently"""
        
        results = []
        
        for i, prompt in enumerate(prompts):
            print(f"Generating image {i+1}/{len(prompts)}: {prompt[:50]}...")
            
            result = self.generate_image(prompt=prompt, **kwargs)
            results.append(result)
        
        return results
    
    def create_social_media_set(self, base_prompt: str, platforms: List[str]) -> Dict:
        """Create a set of images optimized for different social platforms"""
        
        platform_specs = {
            'instagram_square': (1080, 1080),
            'instagram_story': (1080, 1920),
            'facebook_post': (1200, 630),
            'twitter_post': (1024, 512),
            'linkedin_post': (1200, 627)
        }
        
        results = {}
        
        for platform in platforms:
            if platform in platform_specs:
                dimensions = platform_specs[platform]
                
                result = self.generate_image(
                    prompt=base_prompt,
                    image_type='social_media',
                    dimensions=dimensions,
                    brand_integration=True
                )
                
                results[platform] = result
        
        return results
    
    def save_image(self, image_data: str, filename: str, format: str = 'PNG') -> bool:
        """Save base64 image data to file"""
        
        try:
            img_bytes = base64.b64decode(image_data)
            
            with open(filename, 'wb') as f:
                f.write(img_bytes)
            
            print(f"✅ Image saved: {filename}")
            return True
            
        except Exception as e:
            print(f"❌ Error saving image: {e}")
            return False

# Usage example and testing
if __name__ == "__main__":
    agent = ImageGenerationAgent()
    
    # Test image generation
    result = agent.generate_image(
        prompt="Modern office workspace with AI technology, professional business environment",
        image_type="social_media",
        style="professional",
        dimensions=(1080, 1080),
        text_overlay="Super Mega AI Solutions",
        brand_integration=True
    )
    
    print("Image Generation Result:")
    print("=" * 50)
    print(f"Generation Method: {result['generation_method']}")
    print(f"Quality Score: {result['quality_score']}/100")
    print(f"Dimensions: {result['dimensions']}")
    print(f"File Size: {result['file_size_estimate']} bytes")
    
    # Save the image
    if result['image_data']:
        agent.save_image(result['image_data'], 'test_generated_image.png')
    else:
        print("No image data generated")
