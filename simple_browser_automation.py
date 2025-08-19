#!/usr/bin/env python3
"""
🤖 AI-POWERED BROWSER AUTOMATION
===============================
Natural language browser automation with AI chatbot interface
"""

import streamlit as st
import time
import os
import json
import re
from datetime import datetime
from typing import Dict, List, Any
import pandas as pd

# Only import what we actually need
try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

try:
    import requests
    from bs4 import BeautifulSoup
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

# Set page config
st.set_page_config(
    page_title="🤖 AI Browser Automation",
    page_icon="🤖",
    layout="wide"
)

class AIBrowserAutomation:
    """AI-powered browser automation with natural language interface"""
    
    def __init__(self):
        if 'chat_history' not in st.session_state:
            st.session_state.chat_history = []
        if 'automation_results' not in st.session_state:
            st.session_state.automation_results = []
    
    def render_interface(self):
        st.title("🤖 AI Browser Automation")
        st.markdown("### Tell me what you want to do, I'll automate it for you!")
        
        # Status check
        col1, col2, col3 = st.columns(3)
        with col1:
            status = "✅ Ready" if SELENIUM_AVAILABLE else "⚠️ Limited Mode"
            st.metric("Automation Engine", status)
        with col2:
            status = "✅ Ready" if REQUESTS_AVAILABLE else "⚠️ Basic Only"
            st.metric("Web Scraping", status)
        with col3:
            st.metric("Tasks Completed", len(st.session_state.automation_results))
        
        st.divider()
        
        # Main chat interface
        self.render_chat_interface()
        
        # Show recent results with easy access
        if st.session_state.automation_results:
            st.subheader("📊 Recent Results")
            
            for i, result in enumerate(reversed(st.session_state.automation_results[-3:])):
                with st.expander(f"🎯 {result['task'].title()} - {result['timestamp'].strftime('%H:%M:%S')}", expanded=True):
                    col1, col2, col3 = st.columns([2, 1, 1])
                    
                    with col1:
                        st.write(f"**URL:** {result['url']}")
                        if result.get('data'):
                            if isinstance(result['data'], list):
                                st.write(f"**Found:** {len(result['data'])} items")
                                if len(result['data']) > 0:
                                    # Show first few results as preview
                                    st.write("**Preview:**")
                                    for idx, item in enumerate(result['data'][:3]):
                                        if isinstance(item, str):
                                            preview = item[:80] + "..." if len(item) > 80 else item
                                            st.write(f"• {preview}")
                                    if len(result['data']) > 3:
                                        st.write(f"... and {len(result['data']) - 3} more items")
                            else:
                                st.write(f"**Result:** {result['data']}")
                    
                    with col2:
                        # Download button for data
                        if result.get('data') and isinstance(result['data'], list):
                            data_json = json.dumps(result['data'], indent=2)
                            st.download_button(
                                "📥 Download JSON",
                                data=data_json,
                                file_name=f"{result['task']}_{int(result['timestamp'].timestamp())}.json",
                                mime="application/json",
                                key=f"download_{i}"
                            )
                            
                            # CSV download for lists of strings
                            if all(isinstance(item, str) for item in result['data']):
                                csv_data = "\n".join(result['data'])
                                st.download_button(
                                    "📄 Download CSV",
                                    data=csv_data,
                                    file_name=f"{result['task']}_{int(result['timestamp'].timestamp())}.csv",
                                    mime="text/csv",
                                    key=f"csv_{i}"
                                )
                    
                    with col3:
                        # View all button
                        if st.button(f"👁️ View All", key=f"view_all_{i}"):
                            st.session_state[f'show_all_{i}'] = not st.session_state.get(f'show_all_{i}', False)
                        
                        # Copy to clipboard simulation
                        if result.get('data') and isinstance(result['data'], list):
                            if st.button(f"📋 Copy", key=f"copy_{i}"):
                                st.success("✅ Data copied to session!")
                                st.session_state.clipboard = result['data']
                    
                    # Show all data if requested
                    if st.session_state.get(f'show_all_{i}', False):
                        st.subheader("📋 Complete Results")
                        if isinstance(result['data'], list):
                            df = pd.DataFrame({'Results': result['data']})
                            st.dataframe(df, use_container_width=True, height=300)
                        else:
                            st.text_area("Full Result", result['data'], height=200)
                    
                    # Screenshot display
                    if result['task'] == 'take screenshot' and result.get('data'):
                        if os.path.exists(result['data']):
                            st.image(result['data'], caption=f"Screenshot of {result['url']}")
                            
                            # Download screenshot
                            with open(result['data'], 'rb') as f:
                                st.download_button(
                                    "📥 Download Screenshot",
                                    data=f.read(),
                                    file_name=os.path.basename(result['data']),
                                    mime="image/png",
                                    key=f"screenshot_{i}"
                                )
    
    def render_chat_interface(self):
        # Chat container
        chat_container = st.container()
        
        with chat_container:
            st.subheader("💬 Chat with AI Automation Assistant")
            
            # Display chat history
            for message in st.session_state.chat_history:
                if message['role'] == 'user':
                    st.markdown(f"**You:** {message['content']}")
                else:
                    st.markdown(f"**🤖 Assistant:** {message['content']}")
            
            # Chat input
            user_input = st.text_input(
                "What would you like me to automate?", 
                placeholder="e.g., 'Scrape all product names from amazon.com' or 'Get all email addresses from this webpage'",
                key="chat_input"
            )
            
            col1, col2 = st.columns([1, 4])
            with col1:
                send_button = st.button("🚀 Execute", type="primary")
            with col2:
                if st.button("🗑️ Clear Chat"):
                    st.session_state.chat_history = []
                    st.rerun()
            
            if send_button and user_input:
                self.process_user_request(user_input)
                st.rerun()
            
            # Quick examples
            st.markdown("**Quick Examples:**")
            examples = [
                "Scrape all links from https://news.ycombinator.com",
                "Get all product prices from https://example-shop.com",
                "Find all email addresses on https://company.com/contact",
                "Take a screenshot of https://google.com",
                "Get the page title and description from any website"
            ]
            
            for example in examples:
                if st.button(f"💡 {example}", key=f"example_{hash(example)}"):
                    self.process_user_request(example)
                    st.rerun()
    
    def process_user_request(self, user_input: str):
        """Process natural language request and execute automation"""
        
        # Add user message to chat
        st.session_state.chat_history.append({
            'role': 'user',
            'content': user_input,
            'timestamp': datetime.now()
        })
        
        # Parse the request using simple NLP
        automation_task = self.parse_automation_request(user_input)
        
        if not automation_task:
            response = "I'm not sure what you want me to do. Could you try rephrasing? For example: 'Scrape all links from website.com' or 'Get product names from shop.com'"
            st.session_state.chat_history.append({
                'role': 'assistant',
                'content': response,
                'timestamp': datetime.now()
            })
            return
        
        # Execute the task
        response = f"🚀 I'll {automation_task['action']} from {automation_task['url']}. Starting now..."
        st.session_state.chat_history.append({
            'role': 'assistant', 
            'content': response,
            'timestamp': datetime.now()
        })
        
        # Perform automation
        result = self.execute_automation_task(automation_task)
        
        if result.get('success'):
            data_summary = ""
            if result.get('data'):
                if isinstance(result['data'], list):
                    data_summary = f" Found {len(result['data'])} items."
                else:
                    data_summary = " Task completed successfully."
            
            response = f"✅ Done! {automation_task['action'].title()} completed.{data_summary}"
            
            # Store results
            st.session_state.automation_results.append({
                'timestamp': datetime.now(),
                'task': automation_task['action'],
                'url': automation_task['url'],
                'data': result.get('data'),
                'success': True
            })
            
        else:
            response = f"❌ Sorry, I couldn't complete that task. {result.get('error', 'Unknown error occurred.')}"
            
        st.session_state.chat_history.append({
            'role': 'assistant',
            'content': response, 
            'timestamp': datetime.now()
        })
    
    def parse_automation_request(self, text: str) -> Dict[str, Any]:
        """Parse natural language into automation task"""
        text_lower = text.lower()
        
        # Extract URL
        url_pattern = r'https?://[^\s]+'
        urls = re.findall(url_pattern, text)
        
        if not urls:
            # Look for domain patterns
            domain_pattern = r'(?:from\s+)?([a-zA-Z0-9-]+\.(?:com|org|net|edu|gov|co\.uk|io|dev|app))'
            domains = re.findall(domain_pattern, text)
            if domains:
                urls = [f"https://{domains[0]}"]
        
        if not urls:
            return None
        
        url = urls[0]
        
        # Determine action based on keywords
        if any(word in text_lower for word in ['scrape', 'get', 'find', 'extract', 'collect']):
            if any(word in text_lower for word in ['link', 'url', 'href']):
                return {'action': 'scrape links', 'url': url, 'target': 'links'}
            elif any(word in text_lower for word in ['email', 'contact', '@']):
                return {'action': 'find email addresses', 'url': url, 'target': 'emails'}
            elif any(word in text_lower for word in ['price', 'cost', '$', 'dollar']):
                return {'action': 'get prices', 'url': url, 'target': 'prices'}
            elif any(word in text_lower for word in ['product', 'item', 'name']):
                return {'action': 'get products', 'url': url, 'target': 'products'}
            elif any(word in text_lower for word in ['image', 'img', 'photo', 'picture']):
                return {'action': 'get images', 'url': url, 'target': 'images'}
            elif any(word in text_lower for word in ['title', 'heading', 'h1', 'h2']):
                return {'action': 'get titles', 'url': url, 'target': 'titles'}
            else:
                return {'action': 'scrape content', 'url': url, 'target': 'general'}
        
        elif any(word in text_lower for word in ['screenshot', 'capture', 'snap']):
            return {'action': 'take screenshot', 'url': url, 'target': 'screenshot'}
        
        else:
            return {'action': 'scrape content', 'url': url, 'target': 'general'}
    
    def execute_automation_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the parsed automation task"""
        url = task['url']
        target = task['target']
        
        try:
            if target == 'screenshot':
                return self.take_screenshot(url)
            else:
                return self.scrape_data(url, target)
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def scrape_data(self, url: str, target: str) -> Dict[str, Any]:
        """Scrape specific data from website"""
        
        if SELENIUM_AVAILABLE:
            return self.selenium_scrape_targeted(url, target)
        elif REQUESTS_AVAILABLE:
            return self.requests_scrape_targeted(url, target)
        else:
            return {'success': False, 'error': 'No scraping libraries available'}
    
    def selenium_scrape_targeted(self, url: str, target: str) -> Dict[str, Any]:
        """Targeted scraping with Selenium"""
        chrome_options = ChromeOptions()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        
        driver = None
        
        try:
            driver = webdriver.Chrome(options=chrome_options)
            driver.get(url)
            time.sleep(3)
            
            data = []
            
            if target == 'links':
                elements = driver.find_elements(By.TAG_NAME, "a")
                data = [elem.get_attribute('href') for elem in elements if elem.get_attribute('href')]
                
            elif target == 'emails':
                text_content = driver.find_element(By.TAG_NAME, "body").text
                email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
                data = list(set(re.findall(email_pattern, text_content)))
                
            elif target == 'prices':
                # Look for common price patterns
                price_selectors = [
                    '[class*="price"]', '[class*="cost"]', '[id*="price"]', 
                    '.price', '#price', '[data-price]'
                ]
                for selector in price_selectors:
                    try:
                        elements = driver.find_elements(By.CSS_SELECTOR, selector)
                        data.extend([elem.text.strip() for elem in elements if elem.text.strip()])
                    except:
                        continue
                if not data:
                    # Fallback: look for $ symbols
                    text_content = driver.find_element(By.TAG_NAME, "body").text
                    price_pattern = r'\$[\d,]+\.?\d*'
                    data = list(set(re.findall(price_pattern, text_content)))
                
            elif target == 'products':
                # Look for product names
                product_selectors = [
                    '[class*="product"]', '[class*="item"]', '[class*="name"]',
                    'h1, h2, h3', '[data-product]'
                ]
                for selector in product_selectors:
                    try:
                        elements = driver.find_elements(By.CSS_SELECTOR, selector)
                        data.extend([elem.text.strip() for elem in elements if elem.text.strip()])
                    except:
                        continue
                        
            elif target == 'images':
                elements = driver.find_elements(By.TAG_NAME, "img")
                data = [elem.get_attribute('src') for elem in elements if elem.get_attribute('src')]
                
            elif target == 'titles':
                title_elements = driver.find_elements(By.CSS_SELECTOR, "h1, h2, h3, h4, h5, h6")
                data = [elem.text.strip() for elem in title_elements if elem.text.strip()]
                
            else:  # general content
                data = [driver.find_element(By.TAG_NAME, "body").text[:1000] + "..."]
            
            # Remove duplicates and limit results
            if isinstance(data, list):
                data = list(dict.fromkeys(data))[:50]  # Remove duplicates, limit to 50
            
            return {'success': True, 'data': data}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            if driver:
                driver.quit()
    
    def requests_scrape_targeted(self, url: str, target: str) -> Dict[str, Any]:
        """Targeted scraping with requests"""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            data = []
            
            if target == 'links':
                links = soup.find_all('a', href=True)
                data = [link['href'] for link in links]
                
            elif target == 'emails':
                text_content = soup.get_text()
                email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
                data = list(set(re.findall(email_pattern, text_content)))
                
            elif target == 'images':
                images = soup.find_all('img', src=True)
                data = [img['src'] for img in images]
                
            elif target == 'titles':
                titles = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
                data = [title.get_text(strip=True) for title in titles if title.get_text(strip=True)]
                
            elif target == 'prices':
                text_content = soup.get_text()
                price_pattern = r'\$[\d,]+\.?\d*'
                data = list(set(re.findall(price_pattern, text_content)))
                
            else:  # general
                data = [soup.get_text(separator=' ', strip=True)[:1000] + "..."]
            
            # Remove duplicates and limit
            if isinstance(data, list):
                data = list(dict.fromkeys(data))[:50]
            
            return {'success': True, 'data': data}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def take_screenshot(self, url: str) -> Dict[str, Any]:
        """Take screenshot of webpage"""
        if not SELENIUM_AVAILABLE:
            return {'success': False, 'error': 'Screenshot requires Selenium WebDriver'}
        
        chrome_options = ChromeOptions()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        
        driver = None
        try:
            driver = webdriver.Chrome(options=chrome_options)
            driver.get(url)
            time.sleep(3)
            
            screenshot_dir = "screenshots"
            os.makedirs(screenshot_dir, exist_ok=True)
            screenshot_path = os.path.join(screenshot_dir, f"screenshot_{int(time.time())}.png")
            
            driver.save_screenshot(screenshot_path)
            
            return {
                'success': True, 
                'data': screenshot_path,
                'message': f'Screenshot saved to {screenshot_path}'
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            if driver:
                driver.quit()

def main():
    app = AIBrowserAutomation()
    app.render_interface()

if __name__ == "__main__":
    main()
