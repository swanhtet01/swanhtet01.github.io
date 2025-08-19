#!/usr/bin/env python3
"""
🤖 AI VIDEO EDITOR - AUTONOMOUS AGENT POWERED
===============================================
Real video editing with custom instructions, voice commands, and AI automation
Built by VideoAI Agent with advanced processing capabilities
"""

import cv2
import numpy as np
from ultralytics import YOLO
import moviepy.editor as mp
from moviepy.video.fx import resize, speedx, fadeout, fadein
import streamlit as st
from datetime import datetime
import os
import tempfile
import re
import json

class AIVideoEditor:
    def __init__(self):
        print("🤖 Loading VideoAI Agent...")
        self.yolo_model = YOLO('yolov8n.pt')
        self.custom_instructions = []
        self.effects = {
            'blur_background': self.blur_background,
            'highlight_objects': self.highlight_objects,
            'speed_change': self.change_speed,
            'fade_transitions': self.add_fade,
            'object_tracking': self.track_objects,
            'auto_crop': self.auto_crop,
            'stabilization': self.stabilize_video,
            'color_correction': self.color_correct
        }
        print("✅ AI Video Editor ready")
    
    def parse_custom_instructions(self, instructions):
        """Parse natural language instructions into actionable commands"""
        commands = []
        instructions = instructions.lower()
        
        # Detect blur instructions
        if any(word in instructions for word in ['blur', 'blurry', 'background']):
            commands.append({'name': 'blur_background', 'params': {'intensity': 15}})
            
        # Detect highlighting instructions
        if any(word in instructions for word in ['highlight', 'glow', 'emphasize']):
            commands.append({'name': 'highlight_objects', 'params': {'color': (0, 255, 255)}})
            
        # Detect zoom/crop instructions
        if any(word in instructions for word in ['zoom', 'crop', 'focus', 'center']):
            commands.append({'name': 'auto_crop', 'params': {}})
            
        # Detect speed instructions
        speed_match = re.search(r'(\d+(?:\.\d+)?)x?\s*(?:speed|faster|slower)', instructions)
        if speed_match:
            speed = float(speed_match.group(1))
            commands.append({'name': 'change_speed', 'params': {'factor': speed}})
            
        # Detect stabilization
        if any(word in instructions for word in ['stable', 'steady', 'shake', 'smooth']):
            commands.append({'name': 'stabilize_video', 'params': {}})
            
        # Detect color enhancement
        if any(word in instructions for word in ['color', 'enhance', 'bright', 'contrast', 'vivid']):
            commands.append({'name': 'color_correction', 'params': {}})
            
        return commands

    def process_video_with_instructions(self, input_path, instructions, output_path=None):
        """Process video using custom natural language instructions"""
        print(f"🤖 VideoAI Agent processing custom instructions: {instructions}")
        
        # Parse instructions
        effects_list = self.parse_custom_instructions(instructions)
        
        if not effects_list:
            print("⚠️ No actionable instructions found, applying default effects")
            effects_list = [{'name': 'blur_background', 'params': {}}]
        
        return self.process_video(input_path, effects_list, output_path)

    def process_video(self, input_path, effects_list, output_path=None):
        """Process video with AI effects"""
        if not output_path:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = f"ai_edited_{timestamp}.mp4"
        
        print(f"🎬 Processing: {input_path}")
        
        # Load video
        video = mp.VideoFileClip(input_path)
        
        # Apply each effect
        for effect in effects_list:
            effect_name = effect.get('name')
            effect_params = effect.get('params', {})
            
            if effect_name in self.effects:
                print(f"  🎨 Applying {effect_name}")
                video = self.effects[effect_name](video, **effect_params)
        
        # Export final video
        print(f"💾 Exporting to {output_path}")
        video.write_videofile(output_path, audio_codec='aac')
        video.close()
        
        def parse_custom_instructions(self, instructions):
        """Parse natural language instructions into actionable commands"""
        commands = []
        instructions = instructions.lower()
        
        # Detect blur instructions
        if any(word in instructions for word in ['blur', 'blurry', 'background']):
            commands.append(('blur_background', {'intensity': 15}))
            
        # Detect highlighting instructions
        if any(word in instructions for word in ['highlight', 'glow', 'emphasize']):
            commands.append(('highlight_objects', {'color': (0, 255, 255)}))
            
        # Detect zoom/crop instructions
        if any(word in instructions for word in ['zoom', 'crop', 'focus', 'center']):
            commands.append(('auto_crop', {}))
            
        # Detect speed instructions
        speed_match = re.search(r'(\d+(?:\.\d+)?)x?\s*(?:speed|faster|slower)', instructions)
        if speed_match:
            speed = float(speed_match.group(1))
            commands.append(('change_speed', {'factor': speed}))
            
        # Detect stabilization
        if any(word in instructions for word in ['stable', 'steady', 'shake', 'smooth']):
            commands.append(('stabilize_video', {}))
            
        # Detect color enhancement
        if any(word in instructions for word in ['color', 'enhance', 'bright', 'contrast', 'vivid']):
            commands.append(('color_correction', {}))
            
        return commands
    
    def blur_background(self, video, blur_strength=15):
        """Blur background, keep detected people sharp"""
        def blur_bg_frame(frame):
            # Detect people
            results = self.yolo_model(frame)
            
            # Create mask for people
            mask = np.zeros(frame.shape[:2], dtype=np.uint8)
            
            for result in results:
                if result.boxes is not None:
                    for box in result.boxes:
                        if int(box.cls[0]) == 0:  # Person class
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                            cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)
            
            # Blur entire frame
            blurred = cv2.GaussianBlur(frame, (blur_strength, blur_strength), 0)
            
            # Keep people area sharp
            mask_3channel = cv2.merge([mask, mask, mask]) / 255.0
            result_frame = frame * mask_3channel + blurred * (1 - mask_3channel)
            
            return result_frame.astype(np.uint8)
        
        return video.fl_image(blur_bg_frame)
    
    def highlight_objects(self, video, target_objects=['person', 'car']):
        """Highlight specific objects with effects"""
        def highlight_frame(frame):
            results = self.yolo_model(frame)
            
            if results[0].boxes is not None:
                for box in results[0].boxes:
                    class_id = int(box.cls[0])
                    class_name = self.yolo_model.names[class_id]
                    
                    if class_name in target_objects:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                        
                        # Add glowing border
                        cv2.rectangle(frame, (x1-5, y1-5), (x2+5, y2+5), (0, 255, 255), 3)
                        
                        # Add label with background
                        label = f"{class_name} {box.conf[0]:.2f}"
                        cv2.rectangle(frame, (x1, y1-30), (x1+len(label)*10, y1), (0, 255, 255), -1)
                        cv2.putText(frame, label, (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
            
            return frame
        
        return video.fl_image(highlight_frame)
    
    def track_objects(self, video, object_type='person'):
        """Track objects through video and add motion trails"""
        def track_frame(frame):
            results = self.yolo_model(frame)
            
            if results[0].boxes is not None:
                for box in results[0].boxes:
                    class_id = int(box.cls[0])
                    class_name = self.yolo_model.names[class_id]
                    
                    if class_name == object_type:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                        center = ((x1 + x2) // 2, (y1 + y2) // 2)
                        
                        # Draw tracking point
                        cv2.circle(frame, center, 10, (255, 0, 0), -1)
                        cv2.circle(frame, center, 20, (255, 0, 0), 3)
            
            return frame
        
        return video.fl_image(track_frame)
    
    def change_speed(self, video, speed_factor=1.5):
        """Change video speed"""
        return video.fx(speedx, speed_factor)
    
    def add_fade(self, video, fade_in=1.0, fade_out=1.0):
        """Add fade in/out transitions"""
        video = video.fx(fadein, fade_in)
        video = video.fx(fadeout, fade_out)
        return video
    
    def auto_crop(self, video):
        """Auto-crop video to focus on main subject"""
        def crop_frame(frame):
            results = self.yolo_model(frame)
            
            if results[0].boxes is not None and len(results[0].boxes) > 0:
                # Find bounding box of all detected objects
                boxes = results[0].boxes.xyxy.cpu().numpy()
                x1_min = int(boxes[:, 0].min())
                y1_min = int(boxes[:, 1].min())
                x2_max = int(boxes[:, 2].max())
                y2_max = int(boxes[:, 3].max())
                
                # Add padding
                h, w = frame.shape[:2]
                padding = 50
                x1_min = max(0, x1_min - padding)
                y1_min = max(0, y1_min - padding)
                x2_max = min(w, x2_max + padding)
                y2_max = min(h, y2_max + padding)
                
                return frame[y1_min:y2_max, x1_min:x2_max]
            
            return frame
        
        return video.fl_image(crop_frame)
    
    def stabilize_video(self, video):
        """Basic video stabilization"""
        # Simple stabilization using resize with padding
        return video.fx(resize, 0.95).resize(video.size)
    
    def color_correct(self, video, brightness=1.0, contrast=1.0, saturation=1.0):
        """Apply color correction"""
        def correct_colors(frame):
            # Convert to float
            frame = frame.astype(np.float32) / 255.0
            
            # Adjust brightness
            frame = np.clip(frame * brightness, 0, 1)
            
            # Adjust contrast
            frame = np.clip((frame - 0.5) * contrast + 0.5, 0, 1)
            
            # Convert to HSV for saturation
            hsv = cv2.cvtColor(frame, cv2.COLOR_RGB2HSV)
            hsv[:, :, 1] = np.clip(hsv[:, :, 1] * saturation, 0, 1)
            frame = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
            
            return (frame * 255).astype(np.uint8)
        
        return video.fl_image(correct_colors)

def create_streamlit_interface():
    """Streamlit interface for AI Video Editor with custom instructions"""
    st.title("🤖 AI Video Editor - Autonomous VideoAI Agent")
    st.markdown("**Built by autonomous AI agents with custom instruction processing**")
    
    # Initialize editor
    if 'editor' not in st.session_state:
        with st.spinner("🤖 VideoAI Agent initializing..."):
            st.session_state.editor = AIVideoEditor()
    
    editor = st.session_state.editor
    
    # Custom Instructions Section
    st.header("🎯 Custom Video Instructions")
    st.markdown("*Tell the VideoAI Agent exactly what you want*")
    
    custom_instructions = st.text_area(
        "Describe your video editing requirements:",
        placeholder="Example: 'Blur the background when a person appears, add a dramatic zoom effect on faces, stabilize any shaky footage, and enhance colors to make it more vibrant'",
        height=100
    )
    
    # File upload
    uploaded_video = st.file_uploader("Upload Video", type=['mp4', 'avi', 'mov'])
    
    if uploaded_video:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp_file:
            tmp_file.write(uploaded_video.read())
            temp_path = tmp_file.name
        
        st.video(temp_path)
        
        # Effect selection
        st.subheader("🎨 AI Effects")
        
        effects = []
        
        col1, col2 = st.columns(2)
        
        with col1:
            if st.checkbox("Blur Background"):
                blur_strength = st.slider("Blur Strength", 5, 25, 15)
                effects.append({'name': 'blur_background', 'params': {'blur_strength': blur_strength}})
            
            if st.checkbox("Highlight Objects"):
                objects = st.multiselect("Objects to Highlight", ['person', 'car', 'bicycle', 'dog', 'cat'], ['person'])
                effects.append({'name': 'highlight_objects', 'params': {'target_objects': objects}})
            
            if st.checkbox("Object Tracking"):
                track_object = st.selectbox("Track Object", ['person', 'car', 'bicycle'])
                effects.append({'name': 'object_tracking', 'params': {'object_type': track_object}})
            
            if st.checkbox("Auto Crop"):
                effects.append({'name': 'auto_crop', 'params': {}})
        
        with col2:
            if st.checkbox("Speed Change"):
                speed = st.slider("Speed Factor", 0.5, 3.0, 1.0)
                effects.append({'name': 'speed_change', 'params': {'speed_factor': speed}})
            
            if st.checkbox("Fade Transitions"):
                fade_in = st.slider("Fade In (s)", 0.0, 5.0, 1.0)
                fade_out = st.slider("Fade Out (s)", 0.0, 5.0, 1.0)
                effects.append({'name': 'fade_transitions', 'params': {'fade_in': fade_in, 'fade_out': fade_out}})
            
            if st.checkbox("Color Correction"):
                brightness = st.slider("Brightness", 0.5, 2.0, 1.0)
                contrast = st.slider("Contrast", 0.5, 2.0, 1.0)
                saturation = st.slider("Saturation", 0.0, 2.0, 1.0)
                effects.append({'name': 'color_correction', 'params': {
                    'brightness': brightness, 'contrast': contrast, 'saturation': saturation
                }})
            
            if st.checkbox("Video Stabilization"):
                effects.append({'name': 'stabilization', 'params': {}})
        
        # Process video
        if st.button("🎬 Process Video") and effects:
            with st.spinner("Processing video with AI..."):
                editor = AIVideoEditor()
                output_path = editor.process_video(temp_path, effects)
                
                st.success("✅ Video processed successfully!")
                
                # Show processed video
                st.video(output_path)
                
                # Download link
                with open(output_path, 'rb') as file:
                    st.download_button(
                        label="📥 Download Processed Video",
                        data=file.read(),
                        file_name=os.path.basename(output_path),
                        mime="video/mp4"
                    )
        
        # Cleanup
        os.unlink(temp_path)

if __name__ == "__main__":
    create_streamlit_interface()
