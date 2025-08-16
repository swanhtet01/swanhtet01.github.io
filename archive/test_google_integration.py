"""
Test Google Workspace and Cloud Integration
"""
import os
from google.oauth2 import service_account
from googleapiclient.discovery import build
from google.cloud import aiplatform

def test_connections():
    """Test all Google service connections"""
    # Load service account credentials
    credentials = service_account.Credentials.from_service_account_file(
        'secrets/service-account.json',
        scopes=[
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/admin.directory.user'
        ]
    )
    
    try:
        # Test Admin SDK
        admin_service = build('admin', 'directory_v1', credentials=credentials)
        print("✓ Admin SDK connection successful")
        
        # Test Drive API
        drive_service = build('drive', 'v3', credentials=credentials)
        print("✓ Drive API connection successful")
        
        # Test Gmail API
        gmail_service = build('gmail', 'v1', credentials=credentials)
        print("✓ Gmail API connection successful")
        
        # Test Vertex AI
        aiplatform.init(
            project=os.getenv('GOOGLE_CLOUD_PROJECT'),
            location='us-central1'
        )
        print("✓ Vertex AI connection successful")
        
    except Exception as e:
        print(f"Error: {str(e)}")
        
if __name__ == "__main__":
    test_connections()
