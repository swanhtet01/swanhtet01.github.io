from pathlib import Path
from media_processor import VideoProcessor
from utils.paths import TEMP_DIR, DATA_DIR

def main():
    """Run a simple demo of the video processing system"""
    print("🎬 Starting Video Processing Demo...")
    
    # Initialize processor
    processor = VideoProcessor()
    
    # Process test video
    test_video = TEMP_DIR / "test.mp4"
    if not test_video.exists():
        print("❌ Test video not found. Please run quick_test.py first!")
        return
    
    try:
        print(f"\n📁 Processing video: {test_video}")
        result = processor.process_video(test_video)
        
        print("\n✅ Processing complete!")
        print("\nResults:")
        print(f"🎥 Video: {result['video_path']}")
        print(f"🎵 Audio: {result['audio_path']}")
        print(f"📋 Metadata: {result['metadata_path']}")
        
        # Show some video info
        duration = float(result['info']['format']['duration'])
        size = int(result['info']['format']['size'])
        print(f"\nVideo Info:")
        print(f"⏱️ Duration: {duration:.2f} seconds")
        print(f"💾 Size: {size/1024/1024:.2f} MB")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    main()
