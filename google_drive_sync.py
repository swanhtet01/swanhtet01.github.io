#!/usr/bin/env python3
"""Google Drive Auto-Sync for Super Mega Inc"""
import os
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

def sync_to_drive():
    """Sync critical files to Google Drive"""
    # Load credentials
    creds = service_account.Credentials.from_service_account_file(
        'supermega-468612-fcf5db008f33.json',
        scopes=['https://www.googleapis.com/auth/drive']
    )
    
    service = build('drive', 'v3', credentials=creds)
    
    # Files to sync
    sync_files = [
        'index.html',
        'dashboard.html',
        'stripe_products_live.json',
        'agent_work_summary_20250812_0822.json',
        'business_value_analysis_20250812_062428.json'
    ]
    
    for file in sync_files:
        if os.path.exists(file):
            media = MediaFileUpload(file, resumable=True)
            file_metadata = {'name': f'SuperMega_{file}'}
            
            try:
                result = service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                ).execute()
                print(f"Synced {file} - ID: {result.get('id')}")
            except Exception as e:
                print(f"Failed to sync {file}: {e}")

if __name__ == "__main__":
    sync_to_drive()
