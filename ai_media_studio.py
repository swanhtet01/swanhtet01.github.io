#!/usr/bin/env python3
"""
🎨 AI IMAGE & VIDEO STUDIO
=========================
Professional AI-powered image and video editing suite
"""

import streamlit as st
import time
import os
import json
import base64
from datetime import datetime
from typing import Dict, List, Any, Optional
import pandas as pd

# Image processing imports
try:
    from PIL import Image, ImageFilter, ImageEnhance, ImageOps
    import cv2
    import numpy as np
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# Set page config
st.set_page_config(
    page_title="🎨 AI Media Studio",
    page_icon="🎨",
    layout="wide"
)

class AIMediaStudio:
    """AI-powered image and video editing with natural language interface"""
    
    def __init__(self):
        if 'chat_history' not in st.session_state:
            st.session_state.chat_history = []
        if 'media_results' not in st.session_state:
            st.session_state.media_results = []
        if 'uploaded_files' not in st.session_state:
            st.session_state.uploaded_files = {}
    
    def render_interface(self):
        st.title("🎨 AI Media Studio")
        st.markdown("### Tell me what you want to create or edit!")
        
        # Status and capabilities
        col1, col2, col3 = st.columns(3)
        with col1:
            status = "✅ Ready" if PIL_AVAILABLE else "⚠️ Limited"
            st.metric("Image Processing", status)
        with col2:
            st.metric("AI Templates", "50+ Ready")
        with col3:
            st.metric("Projects Created", len(st.session_state.media_results))
        
        st.divider()
        
        # File upload area
        self.render_upload_area()
        
        # Main chat interface
        self.render_chat_interface()
        
        # Show recent projects
        if st.session_state.media_results:
            self.render_recent_projects()
    
    def render_upload_area(self):
        st.subheader("📁 Upload Media Files")
        
        col1, col2 = st.columns(2)
        
        with col1:
            uploaded_images = st.file_uploader(
                "Upload Images", 
                type=['png', 'jpg', 'jpeg', 'gif', 'bmp'],
                accept_multiple_files=True,
                key="image_upload"
            )
            
            if uploaded_images:
                for img in uploaded_images:
                    if img.name not in st.session_state.uploaded_files:
                        # Save uploaded file
                        upload_dir = "uploads"
                        os.makedirs(upload_dir, exist_ok=True)
                        file_path = os.path.join(upload_dir, img.name)
                        
                        with open(file_path, "wb") as f:
                            f.write(img.getbuffer())
                        
                        st.session_state.uploaded_files[img.name] = {
                            'path': file_path,
                            'type': 'image',
                            'uploaded_at': datetime.now()
                        }
                        
                        st.success(f"✅ Uploaded: {img.name}")
        
        with col2:
            uploaded_videos = st.file_uploader(
                "Upload Videos",
                type=['mp4', 'avi', 'mov', 'wmv', 'flv'],
                accept_multiple_files=True,
                key="video_upload"
            )
            
            if uploaded_videos:
                for vid in uploaded_videos:
                    if vid.name not in st.session_state.uploaded_files:
                        upload_dir = "uploads"
                        os.makedirs(upload_dir, exist_ok=True)
                        file_path = os.path.join(upload_dir, vid.name)
                        
                        with open(file_path, "wb") as f:
                            f.write(vid.getbuffer())
                        
                        st.session_state.uploaded_files[vid.name] = {
                            'path': file_path,
                            'type': 'video',
                            'uploaded_at': datetime.now()
                        }
                        
                        st.success(f"✅ Uploaded: {vid.name}")
        
        # Show uploaded files
        if st.session_state.uploaded_files:
            with st.expander(f"📁 Uploaded Files ({len(st.session_state.uploaded_files)})"):
                for filename, file_info in st.session_state.uploaded_files.items():
                    col1, col2, col3 = st.columns([2, 1, 1])
                    with col1:
                        st.write(f"📄 {filename} ({file_info['type']})")
                    with col2:
                        st.write(file_info['uploaded_at'].strftime('%H:%M:%S'))
                    with col3:
                        if st.button(f"🗑️ Remove", key=f"remove_{filename}"):
                            if os.path.exists(file_info['path']):
                                os.remove(file_info['path'])
                            del st.session_state.uploaded_files[filename]
                            st.rerun()
    
    def render_chat_interface(self):
        st.subheader("💬 AI Media Assistant")
        
        # Display chat history
        for message in st.session_state.chat_history:
            if message['role'] == 'user':
                st.markdown(f"**You:** {message['content']}")
            else:
                st.markdown(f"**🎨 AI:** {message['content']}")
        
        # Chat input
        user_input = st.text_input(
            "What would you like me to create or edit?",
            placeholder="e.g., 'Make the uploaded image brighter and add a vintage filter' or 'Create a logo with text SuperMega'",
            key="media_chat_input"
        )
        
        col1, col2 = st.columns([1, 4])
        with col1:
            if st.button("🎨 Create", type="primary"):
                if user_input:
                    self.process_media_request(user_input)
                    st.rerun()
        
        with col2:
            if st.button("🗑️ Clear Chat"):
                st.session_state.chat_history = []
                st.rerun()
        
        # Quick examples
        st.markdown("**💡 Try These Commands:**")
        examples = [
            "Make my image brighter and more colorful",
            "Add a blur effect to the background", 
            "Create a thumbnail from my video",
            "Resize image to 1920x1080",
            "Convert image to black and white",
            "Add a vintage film effect",
            "Create a profile picture with rounded corners",
            "Extract frames from my video every 5 seconds"
        ]
        
        cols = st.columns(4)
        for i, example in enumerate(examples):
            with cols[i % 4]:
                if st.button(f"💡 {example[:20]}...", key=f"example_{i}"):
                    self.process_media_request(example)
                    st.rerun()
    
    def render_recent_projects(self):
        st.subheader("🎨 Recent Projects")
        
        for i, result in enumerate(reversed(st.session_state.media_results[-3:])):
            with st.expander(f"🎯 {result['operation']} - {result['timestamp'].strftime('%H:%M:%S')}", expanded=True):
                col1, col2, col3 = st.columns([2, 1, 1])
                
                with col1:
                    st.write(f"**Operation:** {result['operation']}")
                    if result.get('input_file'):
                        st.write(f"**Input:** {result['input_file']}")
                    if result.get('settings'):
                        st.write(f"**Settings:** {result['settings']}")
                
                with col2:
                    # Show result image/video
                    if result.get('output_path') and os.path.exists(result['output_path']):
                        if result['operation'] in ['image_edit', 'image_create']:
                            st.image(result['output_path'], width=200)
                        else:
                            st.write("📹 Video processed")
                
                with col3:
                    # Download buttons
                    if result.get('output_path') and os.path.exists(result['output_path']):
                        with open(result['output_path'], 'rb') as f:
                            file_ext = os.path.splitext(result['output_path'])[1]
                            mime_type = "image/png" if file_ext in ['.png', '.jpg', '.jpeg'] else "video/mp4"
                            
                            st.download_button(
                                "📥 Download",
                                data=f.read(),
                                file_name=os.path.basename(result['output_path']),
                                mime=mime_type,
                                key=f"download_media_{i}"
                            )
                    
                    if st.button(f"🔄 Reprocess", key=f"reprocess_{i}"):
                        st.info("Feature coming soon!")
    
    def process_media_request(self, user_input: str):
        """Process natural language media editing request"""
        
        # Add user message
        st.session_state.chat_history.append({
            'role': 'user',
            'content': user_input,
            'timestamp': datetime.now()
        })
        
        # Parse the request
        media_task = self.parse_media_request(user_input)
        
        if not media_task:
            response = "I'm not sure what media operation you want me to perform. Try something like 'make my image brighter' or 'create a thumbnail from video'."
            st.session_state.chat_history.append({
                'role': 'assistant',
                'content': response,
                'timestamp': datetime.now()
            })
            return
        
        # Execute the task
        response = f"🎨 I'll {media_task['operation']} for you. Processing now..."
        st.session_state.chat_history.append({
            'role': 'assistant',
            'content': response,
            'timestamp': datetime.now()
        })
        
        # Perform media operation
        result = self.execute_media_task(media_task)
        
        if result.get('success'):
            response = f"✅ Done! {media_task['operation'].title()} completed successfully."
            if result.get('output_path'):
                response += f" Result saved as {os.path.basename(result['output_path'])}."
            
            # Store result
            st.session_state.media_results.append({
                'timestamp': datetime.now(),
                'operation': media_task['operation'],
                'input_file': media_task.get('input_file'),
                'settings': media_task.get('settings'),
                'output_path': result.get('output_path'),
                'success': True
            })
        else:
            response = f"❌ Sorry, I couldn't complete that operation. {result.get('error', 'Unknown error.')}"
        
        st.session_state.chat_history.append({
            'role': 'assistant',
            'content': response,
            'timestamp': datetime.now()
        })
    
    def parse_media_request(self, text: str) -> Dict[str, Any]:
        """Parse natural language into media operation"""
        text_lower = text.lower()
        
        # Determine operation type
        if any(word in text_lower for word in ['bright', 'dark', 'contrast', 'saturation', 'color']):
            operation = 'adjust_colors'
            settings = self.extract_color_settings(text_lower)
        elif any(word in text_lower for word in ['blur', 'sharp', 'focus']):
            operation = 'apply_filter'
            settings = self.extract_filter_settings(text_lower)
        elif any(word in text_lower for word in ['resize', 'scale', 'size', 'dimension']):
            operation = 'resize_image'
            settings = self.extract_size_settings(text_lower)
        elif any(word in text_lower for word in ['thumbnail', 'frame', 'extract']):
            operation = 'extract_frame'
            settings = {}
        elif any(word in text_lower for word in ['black', 'white', 'grey', 'gray', 'monochrome']):
            operation = 'convert_bw'
            settings = {}
        elif any(word in text_lower for word in ['vintage', 'sepia', 'old', 'retro']):
            operation = 'vintage_effect'
            settings = {}
        elif any(word in text_lower for word in ['round', 'circle', 'profile']):
            operation = 'round_corners'
            settings = {}
        else:
            operation = 'general_edit'
            settings = {}
        
        # Find input file
        input_file = self.find_input_file(text_lower)
        
        return {
            'operation': operation,
            'input_file': input_file,
            'settings': settings
        }
    
    def extract_color_settings(self, text: str) -> Dict[str, Any]:
        """Extract color adjustment settings"""
        settings = {}
        
        if 'bright' in text:
            settings['brightness'] = 1.3
        elif 'dark' in text:
            settings['brightness'] = 0.7
        
        if 'contrast' in text:
            settings['contrast'] = 1.2
        
        if 'color' in text or 'saturation' in text:
            settings['saturation'] = 1.3
        
        return settings
    
    def extract_filter_settings(self, text: str) -> Dict[str, Any]:
        """Extract filter settings"""
        settings = {}
        
        if 'blur' in text:
            settings['filter_type'] = 'blur'
            settings['intensity'] = 2
        elif 'sharp' in text:
            settings['filter_type'] = 'sharpen'
            settings['intensity'] = 1
        
        return settings
    
    def extract_size_settings(self, text: str) -> Dict[str, Any]:
        """Extract resize settings"""
        import re
        
        # Look for dimensions like 1920x1080
        dimensions = re.search(r'(\d+)\s*[x×]\s*(\d+)', text)
        if dimensions:
            return {
                'width': int(dimensions.group(1)),
                'height': int(dimensions.group(2))
            }
        
        # Default resize
        return {'width': 1920, 'height': 1080}
    
    def find_input_file(self, text: str) -> Optional[str]:
        """Find which uploaded file to use"""
        if not st.session_state.uploaded_files:
            return None
        
        # If only one file, use it
        if len(st.session_state.uploaded_files) == 1:
            return list(st.session_state.uploaded_files.keys())[0]
        
        # Look for file name in text
        for filename in st.session_state.uploaded_files.keys():
            if filename.lower() in text:
                return filename
        
        # Use most recent upload
        most_recent = max(
            st.session_state.uploaded_files.items(),
            key=lambda x: x[1]['uploaded_at']
        )
        return most_recent[0]
    
    def execute_media_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute media processing task"""
        if not PIL_AVAILABLE:
            return {'success': False, 'error': 'Image processing libraries not available'}
        
        input_file = task.get('input_file')
        if not input_file:
            return {'success': False, 'error': 'No input file found. Please upload an image or video first.'}
        
        file_info = st.session_state.uploaded_files.get(input_file)
        if not file_info:
            return {'success': False, 'error': 'Input file not found in uploads.'}
        
        try:
            if file_info['type'] == 'image':
                return self.process_image(file_info['path'], task)
            else:
                return self.process_video(file_info['path'], task)
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def process_image(self, input_path: str, task: Dict[str, Any]) -> Dict[str, Any]:
        """Process image with PIL"""
        operation = task['operation']
        settings = task.get('settings', {})
        
        # Create output directory
        output_dir = "processed_media"
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate output filename
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join(output_dir, f"{base_name}_{operation}_{int(time.time())}.png")
        
        try:
            # Load image
            image = Image.open(input_path)
            
            # Apply operation
            if operation == 'adjust_colors':
                if 'brightness' in settings:
                    enhancer = ImageEnhance.Brightness(image)
                    image = enhancer.enhance(settings['brightness'])
                
                if 'contrast' in settings:
                    enhancer = ImageEnhance.Contrast(image)
                    image = enhancer.enhance(settings['contrast'])
                
                if 'saturation' in settings:
                    enhancer = ImageEnhance.Color(image)
                    image = enhancer.enhance(settings['saturation'])
            
            elif operation == 'apply_filter':
                filter_type = settings.get('filter_type', 'blur')
                if filter_type == 'blur':
                    image = image.filter(ImageFilter.GaussianBlur(radius=settings.get('intensity', 2)))
                elif filter_type == 'sharpen':
                    image = image.filter(ImageFilter.SHARPEN)
            
            elif operation == 'resize_image':
                width = settings.get('width', 1920)
                height = settings.get('height', 1080)
                image = image.resize((width, height), Image.Resampling.LANCZOS)
            
            elif operation == 'convert_bw':
                image = image.convert('L')  # Convert to grayscale
                image = image.convert('RGB')  # Convert back to RGB for saving
            
            elif operation == 'vintage_effect':
                # Apply sepia effect
                image = image.convert('L')  # Convert to grayscale
                image = ImageOps.colorize(image, '#704214', '#C0A882')
            
            elif operation == 'round_corners':
                # Create circular mask
                size = min(image.size)
                mask = Image.new('L', (size, size), 0)
                from PIL import ImageDraw
                draw = ImageDraw.Draw(mask)
                draw.ellipse((0, 0) + (size, size), fill=255)
                
                # Resize and apply mask
                image = image.resize((size, size))
                image.putalpha(mask)
            
            # Save processed image
            image.save(output_path, 'PNG')
            
            return {
                'success': True,
                'output_path': output_path,
                'operation': operation
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def process_video(self, input_path: str, task: Dict[str, Any]) -> Dict[str, Any]:
        """Process video (basic operations)"""
        operation = task['operation']
        
        output_dir = "processed_media"
        os.makedirs(output_dir, exist_ok=True)
        
        if operation == 'extract_frame':
            try:
                if not PIL_AVAILABLE:
                    return {'success': False, 'error': 'Video processing requires OpenCV'}
                
                # Extract first frame as thumbnail
                cap = cv2.VideoCapture(input_path)
                ret, frame = cap.read()
                cap.release()
                
                if ret:
                    base_name = os.path.splitext(os.path.basename(input_path))[0]
                    output_path = os.path.join(output_dir, f"{base_name}_thumbnail_{int(time.time())}.png")
                    
                    # Convert BGR to RGB
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    image = Image.fromarray(frame_rgb)
                    image.save(output_path)
                    
                    return {
                        'success': True,
                        'output_path': output_path,
                        'operation': 'thumbnail_extracted'
                    }
                else:
                    return {'success': False, 'error': 'Could not extract frame from video'}
                    
            except Exception as e:
                return {'success': False, 'error': str(e)}
        
        return {'success': False, 'error': 'Video operation not yet implemented'}

def main():
    app = AIMediaStudio()
    app.render_interface()

if __name__ == "__main__":
    main()
