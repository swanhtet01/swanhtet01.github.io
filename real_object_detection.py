#!/usr/bin/env python3
"""
🎯 REAL OBJECT DETECTION IMPLEMENTATION
YOLOv8 + OpenCV for real-time object detection
Business value: Security cameras, inventory management, quality control
"""

import cv2
from ultralytics import YOLO
import numpy as np
import time
from datetime import datetime
import json
import os

class RealObjectDetection:
    """
    Real object detection system using YOLOv8
    """
    
    def __init__(self):
        print("🎥 Loading YOLOv8 model...")
        # Load YOLOv8 model (downloads automatically if not present)
        self.model = YOLO('yolov8n.pt')  # Nano version for speed
        
        # Class names for COCO dataset
        self.class_names = [
            'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
            'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
            'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
            'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
            'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
            'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
            'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
            'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
            'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
            'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
            'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
        ]
        
        print("✅ YOLOv8 model loaded successfully!")
        
    def detect_from_webcam(self):
        """Real-time object detection from webcam"""
        print("\n🎯 Starting real-time object detection from webcam...")
        print("Press 'q' to quit, 's' to save screenshot")
        
        # Initialize webcam
        cap = cv2.VideoCapture(0)
        
        if not cap.isOpened():
            print("❌ Error: Could not open webcam")
            return
        
        detection_count = 0
        fps_counter = 0
        start_time = time.time()
        
        while True:
            ret, frame = cap.read()
            if not ret:
                print("❌ Error: Failed to capture frame")
                break
            
            # Run YOLOv8 inference
            results = self.model(frame, verbose=False)
            
            # Visualize the results on the frame
            annotated_frame = results[0].plot()
            
            # Count detections
            detections = results[0].boxes
            if detections is not None:
                num_detections = len(detections)
                detection_count += num_detections
                
                # Add detection info to frame
                cv2.putText(annotated_frame, f"Detections: {num_detections}", 
                          (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            # Calculate and display FPS
            fps_counter += 1
            if fps_counter % 30 == 0:
                end_time = time.time()
                fps = 30 / (end_time - start_time)
                start_time = end_time
                print(f"📊 FPS: {fps:.1f}, Total detections: {detection_count}")
            
            # Display the annotated frame
            cv2.imshow('Real-time Object Detection', annotated_frame)
            
            # Handle key presses
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('s'):
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"detection_screenshot_{timestamp}.jpg"
                cv2.imwrite(filename, annotated_frame)
                print(f"📸 Screenshot saved: {filename}")
        
        # Cleanup
        cap.release()
        cv2.destroyAllWindows()
        print(f"🎯 Session complete! Total detections: {detection_count}")
    
    def detect_in_image(self, image_path):
        """Detect objects in a single image"""
        print(f"\n🔍 Analyzing image: {image_path}")
        
        if not os.path.exists(image_path):
            print(f"❌ Error: Image file not found: {image_path}")
            return None
        
        # Load image
        image = cv2.imread(image_path)
        
        # Run inference
        results = self.model(image)
        
        # Extract detection data
        detections = []
        if results[0].boxes is not None:
            boxes = results[0].boxes
            for i, box in enumerate(boxes):
                # Get bounding box coordinates
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                
                # Get confidence and class
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = self.class_names[class_id] if class_id < len(self.class_names) else "Unknown"
                
                detection = {
                    "object": class_name,
                    "confidence": round(confidence, 3),
                    "bbox": [int(x1), int(y1), int(x2), int(y2)]
                }
                detections.append(detection)
                
                print(f"  🎯 {class_name}: {confidence:.3f} confidence")
        
        # Save annotated image
        annotated_image = results[0].plot()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = f"detected_{timestamp}_{os.path.basename(image_path)}"
        cv2.imwrite(output_path, annotated_image)
        print(f"💾 Annotated image saved: {output_path}")
        
        return detections
    
    def detect_in_video(self, video_path):
        """Detect objects in a video file"""
        print(f"\n🎬 Analyzing video: {video_path}")
        
        if not os.path.exists(video_path):
            print(f"❌ Error: Video file not found: {video_path}")
            return
        
        # Open video
        cap = cv2.VideoCapture(video_path)
        
        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps
        
        print(f"📹 Video info: {frame_count} frames, {fps:.1f} FPS, {duration:.1f}s duration")
        
        # Prepare output video
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = f"detected_video_{timestamp}.mp4"
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        
        # Get frame dimensions
        ret, first_frame = cap.read()
        if not ret:
            print("❌ Error: Could not read first frame")
            return
        
        height, width = first_frame.shape[:2]
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        # Process first frame
        results = self.model(first_frame)
        annotated_frame = results[0].plot()
        out.write(annotated_frame)
        
        frame_num = 1
        total_detections = 0
        
        # Process remaining frames
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Run detection every 5th frame for speed
            if frame_num % 5 == 0:
                results = self.model(frame)
                annotated_frame = results[0].plot()
                
                # Count detections
                if results[0].boxes is not None:
                    total_detections += len(results[0].boxes)
            else:
                annotated_frame = frame
            
            out.write(annotated_frame)
            frame_num += 1
            
            # Progress update
            if frame_num % 100 == 0:
                progress = (frame_num / frame_count) * 100
                print(f"📊 Progress: {progress:.1f}% ({frame_num}/{frame_count} frames)")
        
        # Cleanup
        cap.release()
        out.release()
        
        print(f"🎯 Video processing complete!")
        print(f"   📁 Output: {output_path}")
        print(f"   🎯 Total detections: {total_detections}")
        print(f"   ⏱️  Processing time: {frame_num} frames")

def demonstrate_real_detection():
    """Demonstrate real object detection capabilities"""
    
    print("🎯 REAL OBJECT DETECTION DEMONSTRATION")
    print("=" * 50)
    
    # Initialize detector
    detector = RealObjectDetection()
    
    # Check for sample images in the directory
    sample_images = [f for f in os.listdir('.') if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    
    if sample_images:
        print(f"\n📁 Found {len(sample_images)} sample images:")
        for img in sample_images[:3]:  # Show first 3
            print(f"   📷 {img}")
            detections = detector.detect_in_image(img)
            if detections:
                print(f"      ✅ Found {len(detections)} objects")
            else:
                print(f"      ℹ️  No objects detected")
    
    # Offer webcam demo
    print(f"\n🎥 WEBCAM DETECTION DEMO")
    print("This will open your webcam for real-time object detection")
    print("Features:")
    print("  • Real-time object detection")
    print("  • Live FPS counter")
    print("  • Screenshot capability (press 's')")
    print("  • Press 'q' to quit")
    
    response = input("\nStart webcam demo? (y/n): ").lower()
    if response == 'y':
        detector.detect_from_webcam()
    
    print("\n💼 BUSINESS APPLICATIONS:")
    print("🏭 Manufacturing: Quality control, defect detection")
    print("🏢 Security: Intrusion detection, people counting")
    print("🏪 Retail: Inventory management, customer analytics")
    print("🚗 Parking: Vehicle detection, space monitoring")
    print("🏥 Healthcare: PPE compliance, safety monitoring")

if __name__ == "__main__":
    demonstrate_real_detection()
