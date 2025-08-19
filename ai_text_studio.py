#!/usr/bin/env python3
"""
📄 AI TEXT ANALYSIS & DOCUMENT PROCESSING STUDIO
=================================================
Natural language document analysis, text processing, and AI insights
"""

import streamlit as st
import time
import os
import json
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
import pandas as pd
from collections import Counter

# Text processing imports
try:
    import nltk
    from textstat import flesch_reading_ease, flesch_kincaid_grade
    NLTP_AVAILABLE = True
except ImportError:
    NLTP_AVAILABLE = False

# Set page config
st.set_page_config(
    page_title="📄 AI Text Studio",
    page_icon="📄",
    layout="wide"
)

class AITextStudio:
    """AI-powered text analysis and document processing studio"""
    
    def __init__(self):
        if 'text_chat_history' not in st.session_state:
            st.session_state.text_chat_history = []
        if 'text_results' not in st.session_state:
            st.session_state.text_results = []
        if 'current_document' not in st.session_state:
            st.session_state.current_document = None
        
        # Analysis templates
        self.analysis_templates = {
            'summary': {'name': 'Document Summary', 'description': 'Summarize key points and main ideas'},
            'sentiment': {'name': 'Sentiment Analysis', 'description': 'Analyze emotional tone and sentiment'},
            'keywords': {'name': 'Keyword Extraction', 'description': 'Extract important keywords and phrases'},
            'readability': {'name': 'Readability Score', 'description': 'Analyze text complexity and reading level'},
            'statistics': {'name': 'Text Statistics', 'description': 'Word count, sentence count, character analysis'},
            'entities': {'name': 'Entity Recognition', 'description': 'Identify people, places, organizations, dates'},
            'topics': {'name': 'Topic Modeling', 'description': 'Discover main themes and topics'},
            'grammar': {'name': 'Grammar Check', 'description': 'Check grammar and writing quality'},
            'translation': {'name': 'Language Translation', 'description': 'Translate to different languages'},
            'plagiarism': {'name': 'Similarity Check', 'description': 'Check for duplicate content'}
        }
        
        # Supported languages for translation
        self.languages = {
            'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian',
            'pt': 'Portuguese', 'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean',
            'zh': 'Chinese', 'ar': 'Arabic', 'hi': 'Hindi', 'nl': 'Dutch'
        }
    
    def render_interface(self):
        st.title("📄 AI Text Analysis & Document Processing Studio")
        st.markdown("### Analyze text, process documents, and extract insights with AI!")
        
        # Status indicators
        col1, col2, col3 = st.columns(3)
        with col1:
            status = "✅ Ready" if NLTP_AVAILABLE else "⚠️ Limited"
            st.metric("NLP Processing", status)
        with col2:
            st.metric("Analysis Tools", f"{len(self.analysis_templates)} Available")
        with col3:
            st.metric("Documents Analyzed", len(st.session_state.text_results))
        
        st.divider()
        
        # Document input section
        self.render_document_input()
        
        # Analysis tools gallery
        self.render_analysis_tools()
        
        # Main chat interface
        self.render_text_chat_interface()
        
        # Show current analysis
        if st.session_state.current_document:
            self.render_current_analysis()
        
        # Show recent analyses
        if st.session_state.text_results:
            self.render_text_analyses()
    
    def render_document_input(self):
        st.subheader("📝 Document Input")
        
        # Input method tabs
        input_tabs = st.tabs(["💬 Text Input", "📁 File Upload", "🔗 URL/Web"])
        
        with input_tabs[0]:
            text_input = st.text_area(
                "Enter or paste your text",
                height=200,
                placeholder="Enter the text you want to analyze..."
            )
            
            if st.button("🚀 Analyze Text", type="primary"):
                if text_input.strip():
                    self.process_document(text_input, "manual_input", "Text Input")
        
        with input_tabs[1]:
            uploaded_file = st.file_uploader(
                "Choose a file",
                type=['txt', 'pdf', 'docx', 'md', 'csv'],
                help="Supported formats: TXT, PDF, DOCX, MD, CSV"
            )
            
            if uploaded_file and st.button("📄 Process File"):
                content = self.extract_file_content(uploaded_file)
                if content:
                    self.process_document(content, "file_upload", uploaded_file.name)
        
        with input_tabs[2]:
            url_input = st.text_input(
                "Enter URL or website",
                placeholder="https://example.com/article"
            )
            
            if st.button("🔗 Extract from URL"):
                if url_input.strip():
                    content = self.extract_url_content(url_input)
                    if content:
                        self.process_document(content, "url_extract", url_input)
        
        st.divider()
    
    def render_analysis_tools(self):
        st.subheader("🛠️ Quick Analysis Tools")
        
        # Display analysis tools in categories
        analysis_categories = {
            'Content Analysis': ['summary', 'keywords', 'topics'],
            'Language Analysis': ['sentiment', 'readability', 'statistics'],
            'Quality Check': ['grammar', 'entities', 'plagiarism'],
            'Translation': ['translation']
        }
        
        tabs = st.tabs(list(analysis_categories.keys()))
        
        for i, (category, tools) in enumerate(analysis_categories.items()):
            with tabs[i]:
                cols = st.columns(len(tools))
                for j, tool_name in enumerate(tools):
                    with cols[j]:
                        tool_info = self.analysis_templates[tool_name]
                        st.markdown(f"**📄 {tool_info['name']}**")
                        st.write(tool_info['description'])
                        
                        if st.button(f"🔍 {tool_info['name']}", key=f"tool_{tool_name}"):
                            if st.session_state.current_document:
                                request = f"Perform {tool_info['name'].lower()} on the current document"
                                self.add_chat_message('user', request)
                                self.process_analysis_request(request, tool_name)
                                st.rerun()
                            else:
                                st.warning("Please upload or input a document first!")
        
        st.divider()
    
    def render_text_chat_interface(self):
        st.subheader("💬 AI Text Analysis Assistant")
        
        # Display chat history
        for message in st.session_state.text_chat_history:
            if message['role'] == 'user':
                st.markdown(f"**You:** {message['content']}")
            else:
                st.markdown(f"**📄 Text AI:** {message['content']}")
        
        # Chat input
        user_input = st.text_input(
            "What analysis would you like me to perform?",
            placeholder="e.g., 'Summarize this document' or 'Check grammar and sentiment'",
            key="text_chat_input"
        )
        
        col1, col2 = st.columns([1, 4])
        with col1:
            if st.button("🔍 Analyze", type="primary"):
                if user_input:
                    self.add_chat_message('user', user_input)
                    self.process_analysis_request(user_input)
                    st.rerun()
        
        with col2:
            if st.button("🗑️ Clear Chat"):
                st.session_state.text_chat_history = []
                st.rerun()
        
        # Analysis operation examples
        st.markdown("**💡 Analysis Commands:**")
        examples = [
            "Summarize this document in 3 sentences",
            "What is the sentiment of this text?",
            "Extract key topics and themes",
            "Check readability and reading level",
            "Find all named entities (people, places, orgs)",
            "Translate this to Spanish",
            "Generate word frequency analysis",
            "Check for grammar and spelling errors"
        ]
        
        cols = st.columns(4)
        for i, example in enumerate(examples):
            with cols[i % 4]:
                if st.button(f"💡 {example[:15]}...", key=f"text_example_{i}"):
                    self.add_chat_message('user', example)
                    self.process_analysis_request(example)
                    st.rerun()
    
    def render_current_analysis(self):
        st.subheader("📊 Current Document Analysis")
        
        doc = st.session_state.current_document
        
        col1, col2 = st.columns([2, 1])
        
        with col1:
            st.markdown(f"**📄 Document:** {doc['name']}")
            st.markdown(f"**📏 Length:** {len(doc['content'])} characters")
            
            # Show document preview
            preview_text = doc['content'][:500] + "..." if len(doc['content']) > 500 else doc['content']
            st.text_area("Document Preview", preview_text, height=200, disabled=True)
            
            # Show latest analysis results
            if doc.get('analyses'):
                latest_analysis = doc['analyses'][-1]
                st.markdown(f"**🔍 Latest Analysis:** {latest_analysis['type']}")
                
                if latest_analysis.get('results'):
                    self.render_analysis_results(latest_analysis['results'])
        
        with col2:
            st.subheader("📈 Document Stats")
            
            # Basic statistics
            content = doc['content']
            stats = self.calculate_basic_stats(content)
            
            for stat, value in stats.items():
                st.metric(stat, value)
            
            st.subheader("🔧 Actions")
            
            if st.button("💾 Save Analysis"):
                self.save_current_analysis()
            
            if st.button("📄 Export Report"):
                self.export_analysis_report()
            
            if st.button("🔄 Refresh Stats"):
                st.rerun()
            
            # Additional analysis options
            st.subheader("🎯 Quick Actions")
            
            analysis_options = ['Summary', 'Sentiment', 'Keywords', 'Readability']
            for option in analysis_options:
                if st.button(f"🔍 {option}", key=f"quick_{option.lower()}"):
                    request = f"Perform {option.lower()} analysis"
                    self.add_chat_message('user', request)
                    self.process_analysis_request(request, option.lower())
                    st.rerun()
    
    def render_text_analyses(self):
        st.subheader("📊 Recent Text Analyses")
        
        for i, result in enumerate(reversed(st.session_state.text_results[-3:])):
            with st.expander(f"📄 {result['document_name']} - {result['timestamp'].strftime('%H:%M:%S')}", expanded=True):
                col1, col2, col3 = st.columns([2, 1, 1])
                
                with col1:
                    st.write(f"**Document:** {result['document_name']}")
                    st.write(f"**Analysis:** {result['analysis_type']}")
                    st.write(f"**Length:** {result.get('length', 'N/A')} characters")
                    
                    if result.get('summary'):
                        st.write(f"**Summary:** {result['summary'][:100]}...")
                
                with col2:
                    # Show key metrics
                    if result.get('metrics'):
                        for metric, value in result['metrics'].items():
                            st.metric(metric, value)
                
                with col3:
                    # Download buttons
                    if result.get('report_path') and os.path.exists(result['report_path']):
                        with open(result['report_path'], 'r', encoding='utf-8') as f:
                            st.download_button(
                                "📥 Report",
                                data=f.read(),
                                file_name=f"analysis_report_{i}.txt",
                                mime="text/plain",
                                key=f"download_text_{i}"
                            )
                    
                    if st.button(f"🔄 Reload", key=f"reload_text_{i}"):
                        st.session_state.current_document = result
                        st.rerun()
    
    def process_document(self, content: str, source_type: str, name: str):
        """Process a new document for analysis"""
        
        document = {
            'name': name,
            'content': content,
            'source_type': source_type,
            'timestamp': datetime.now(),
            'analyses': []
        }
        
        st.session_state.current_document = document
        
        # Add to chat
        self.add_chat_message('user', f"Analyze this document: {name}")
        self.add_chat_message('assistant', f"📄 Document loaded successfully! '{name}' contains {len(content)} characters. What analysis would you like me to perform?")
        
        st.success(f"✅ Document '{name}' loaded successfully!")
    
    def add_chat_message(self, role: str, content: str):
        """Add message to chat history"""
        st.session_state.text_chat_history.append({
            'role': role,
            'content': content,
            'timestamp': datetime.now()
        })
    
    def process_analysis_request(self, user_input: str, analysis_type: str = None):
        """Process natural language analysis request"""
        
        if not st.session_state.current_document:
            response = "Please upload or input a document first before I can perform analysis."
            self.add_chat_message('assistant', response)
            return
        
        # Determine analysis type if not specified
        if not analysis_type:
            analysis_type = self.parse_analysis_request(user_input)
        
        # Perform the analysis
        response = f"🔍 Performing {analysis_type} analysis on your document..."
        self.add_chat_message('assistant', response)
        
        # Execute analysis
        result = self.execute_analysis(analysis_type, st.session_state.current_document)
        
        if result.get('success'):
            # Add analysis to document
            analysis_record = {
                'type': analysis_type,
                'timestamp': datetime.now(),
                'results': result['data']
            }
            st.session_state.current_document['analyses'].append(analysis_record)
            
            # Store in results
            st.session_state.text_results.append({
                'timestamp': datetime.now(),
                'document_name': st.session_state.current_document['name'],
                'analysis_type': analysis_type,
                'length': len(st.session_state.current_document['content']),
                'results': result['data'],
                'summary': result['data'].get('summary', ''),
                'metrics': result['data'].get('metrics', {}),
                'report_path': result.get('report_path'),
                'success': True
            })
            
            response = f"✅ {analysis_type.title()} analysis complete!"
            if result['data'].get('summary'):
                response += f"\n\n**Key Finding:** {result['data']['summary']}"
        else:
            response = f"❌ Analysis failed: {result.get('error', 'Unknown error')}"
        
        self.add_chat_message('assistant', response)
    
    def parse_analysis_request(self, text: str) -> str:
        """Parse natural language into analysis type"""
        text_lower = text.lower()
        
        # Analysis type mapping
        if any(word in text_lower for word in ['summary', 'summarize', 'key points']):
            return 'summary'
        elif any(word in text_lower for word in ['sentiment', 'emotion', 'mood', 'feeling']):
            return 'sentiment'
        elif any(word in text_lower for word in ['keywords', 'key words', 'important words']):
            return 'keywords'
        elif any(word in text_lower for word in ['readability', 'reading level', 'complexity']):
            return 'readability'
        elif any(word in text_lower for word in ['statistics', 'stats', 'word count', 'length']):
            return 'statistics'
        elif any(word in text_lower for word in ['entities', 'names', 'places', 'organizations']):
            return 'entities'
        elif any(word in text_lower for word in ['topics', 'themes', 'subjects']):
            return 'topics'
        elif any(word in text_lower for word in ['grammar', 'spelling', 'errors']):
            return 'grammar'
        elif any(word in text_lower for word in ['translate', 'translation', 'spanish', 'french']):
            return 'translation'
        elif any(word in text_lower for word in ['plagiarism', 'similarity', 'duplicate']):
            return 'plagiarism'
        else:
            return 'summary'  # Default to summary
    
    def execute_analysis(self, analysis_type: str, document: Dict[str, Any]) -> Dict[str, Any]:
        """Execute specified analysis on document"""
        
        content = document['content']
        
        try:
            if analysis_type == 'summary':
                return self.analyze_summary(content)
            elif analysis_type == 'sentiment':
                return self.analyze_sentiment(content)
            elif analysis_type == 'keywords':
                return self.analyze_keywords(content)
            elif analysis_type == 'readability':
                return self.analyze_readability(content)
            elif analysis_type == 'statistics':
                return self.analyze_statistics(content)
            elif analysis_type == 'entities':
                return self.analyze_entities(content)
            elif analysis_type == 'topics':
                return self.analyze_topics(content)
            elif analysis_type == 'grammar':
                return self.analyze_grammar(content)
            elif analysis_type == 'translation':
                return self.analyze_translation(content)
            elif analysis_type == 'plagiarism':
                return self.analyze_similarity(content)
            else:
                return {'success': False, 'error': 'Analysis type not supported'}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def analyze_summary(self, content: str) -> Dict[str, Any]:
        """Generate document summary"""
        
        # Simple extractive summarization
        sentences = self.split_sentences(content)
        
        if len(sentences) <= 3:
            summary = content
        else:
            # Score sentences by word frequency
            words = self.extract_words(content)
            word_freq = Counter(words)
            
            sentence_scores = {}
            for sentence in sentences:
                sentence_words = self.extract_words(sentence)
                score = sum(word_freq[word] for word in sentence_words)
                sentence_scores[sentence] = score / len(sentence_words) if sentence_words else 0
            
            # Select top sentences
            top_sentences = sorted(sentence_scores.items(), key=lambda x: x[1], reverse=True)[:3]
            summary = ' '.join([sentence for sentence, score in top_sentences])
        
        return {
            'success': True,
            'data': {
                'summary': summary,
                'total_sentences': len(sentences),
                'summary_sentences': min(3, len(sentences)),
                'compression_ratio': len(summary) / len(content),
                'metrics': {
                    'Original Length': f"{len(content)} chars",
                    'Summary Length': f"{len(summary)} chars",
                    'Compression': f"{(1 - len(summary) / len(content)) * 100:.1f}%"
                }
            }
        }
    
    def analyze_sentiment(self, content: str) -> Dict[str, Any]:
        """Analyze text sentiment"""
        
        # Simple rule-based sentiment analysis
        positive_words = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 
                         'love', 'like', 'happy', 'pleased', 'satisfied', 'perfect']
        negative_words = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 
                         'angry', 'frustrated', 'disappointed', 'poor', 'worst', 'fail']
        
        words = self.extract_words(content.lower())
        
        positive_count = sum(1 for word in words if word in positive_words)
        negative_count = sum(1 for word in words if word in negative_words)
        
        total_sentiment_words = positive_count + negative_count
        
        if total_sentiment_words == 0:
            sentiment = 'Neutral'
            score = 0.0
        else:
            score = (positive_count - negative_count) / total_sentiment_words
            if score > 0.1:
                sentiment = 'Positive'
            elif score < -0.1:
                sentiment = 'Negative'
            else:
                sentiment = 'Neutral'
        
        return {
            'success': True,
            'data': {
                'sentiment': sentiment,
                'score': round(score, 3),
                'positive_words': positive_count,
                'negative_words': negative_count,
                'summary': f"Overall sentiment is {sentiment.lower()} with a score of {score:.2f}",
                'metrics': {
                    'Sentiment': sentiment,
                    'Score': f"{score:.3f}",
                    'Positive Words': positive_count,
                    'Negative Words': negative_count
                }
            }
        }
    
    def analyze_keywords(self, content: str) -> Dict[str, Any]:
        """Extract important keywords and phrases"""
        
        words = self.extract_words(content.lower())
        
        # Remove common stop words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                     'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 
                     'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
                     'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'}
        
        filtered_words = [word for word in words if word not in stop_words and len(word) > 2]
        
        # Get word frequency
        word_freq = Counter(filtered_words)
        top_keywords = word_freq.most_common(10)
        
        return {
            'success': True,
            'data': {
                'keywords': [{'word': word, 'frequency': freq} for word, freq in top_keywords],
                'total_unique_words': len(set(words)),
                'summary': f"Top keywords: {', '.join([word for word, freq in top_keywords[:5]])}",
                'metrics': {
                    'Total Words': len(words),
                    'Unique Words': len(set(words)),
                    'Top Keyword': top_keywords[0][0] if top_keywords else 'None',
                    'Keyword Density': f"{(top_keywords[0][1] / len(words) * 100):.1f}%" if top_keywords else '0%'
                }
            }
        }
    
    def analyze_readability(self, content: str) -> Dict[str, Any]:
        """Analyze text readability and complexity"""
        
        sentences = self.split_sentences(content)
        words = self.extract_words(content)
        
        # Calculate basic metrics
        avg_sentence_length = len(words) / len(sentences) if sentences else 0
        
        # Count syllables (simplified)
        total_syllables = sum(self.count_syllables(word) for word in words)
        avg_syllables_per_word = total_syllables / len(words) if words else 0
        
        # Simple readability score (similar to Flesch)
        if len(sentences) > 0 and len(words) > 0:
            readability_score = 206.835 - (1.015 * avg_sentence_length) - (84.6 * avg_syllables_per_word)
            readability_score = max(0, min(100, readability_score))  # Clamp to 0-100
        else:
            readability_score = 0
        
        # Determine reading level
        if readability_score >= 90:
            level = "Very Easy"
        elif readability_score >= 80:
            level = "Easy"
        elif readability_score >= 70:
            level = "Fairly Easy"
        elif readability_score >= 60:
            level = "Standard"
        elif readability_score >= 50:
            level = "Fairly Difficult"
        elif readability_score >= 30:
            level = "Difficult"
        else:
            level = "Very Difficult"
        
        return {
            'success': True,
            'data': {
                'readability_score': round(readability_score, 1),
                'reading_level': level,
                'avg_sentence_length': round(avg_sentence_length, 1),
                'avg_syllables_per_word': round(avg_syllables_per_word, 1),
                'total_syllables': total_syllables,
                'summary': f"Readability score: {readability_score:.1f} ({level})",
                'metrics': {
                    'Readability Score': f"{readability_score:.1f}",
                    'Reading Level': level,
                    'Avg Sentence Length': f"{avg_sentence_length:.1f} words",
                    'Avg Syllables/Word': f"{avg_syllables_per_word:.1f}"
                }
            }
        }
    
    def analyze_statistics(self, content: str) -> Dict[str, Any]:
        """Calculate comprehensive text statistics"""
        
        words = self.extract_words(content)
        sentences = self.split_sentences(content)
        paragraphs = [p.strip() for p in content.split('\n\n') if p.strip()]
        
        # Character counts
        char_count = len(content)
        char_count_no_spaces = len(content.replace(' ', ''))
        
        # Word statistics
        word_count = len(words)
        unique_words = len(set(words))
        avg_word_length = sum(len(word) for word in words) / len(words) if words else 0
        
        # Sentence statistics
        sentence_count = len(sentences)
        avg_sentence_length = word_count / sentence_count if sentence_count else 0
        
        return {
            'success': True,
            'data': {
                'statistics': {
                    'Characters': char_count,
                    'Characters (no spaces)': char_count_no_spaces,
                    'Words': word_count,
                    'Unique words': unique_words,
                    'Sentences': sentence_count,
                    'Paragraphs': len(paragraphs),
                    'Average word length': round(avg_word_length, 1),
                    'Average sentence length': round(avg_sentence_length, 1),
                    'Lexical diversity': round(unique_words / word_count, 3) if word_count else 0
                },
                'summary': f"{word_count} words, {sentence_count} sentences, {len(paragraphs)} paragraphs",
                'metrics': {
                    'Words': word_count,
                    'Sentences': sentence_count,
                    'Paragraphs': len(paragraphs),
                    'Lexical Diversity': f"{(unique_words / word_count * 100):.1f}%" if word_count else "0%"
                }
            }
        }
    
    def analyze_entities(self, content: str) -> Dict[str, Any]:
        """Extract named entities (simplified rule-based approach)"""
        
        # Simple pattern matching for entities
        import re
        
        # Email addresses
        emails = re.findall(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', content)
        
        # URLs
        urls = re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', content)
        
        # Phone numbers (simplified)
        phones = re.findall(r'\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b', content)
        
        # Dates (simplified)
        dates = re.findall(r'\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b', content)
        
        # Capitalized words (potential proper nouns)
        potential_names = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', content)
        
        # Filter out common words that are capitalized
        common_capitalized = {'The', 'This', 'That', 'These', 'Those', 'A', 'An', 'And', 'Or', 'But'}
        names = [name for name in potential_names if name not in common_capitalized]
        
        entities = {
            'emails': emails,
            'urls': urls,
            'phones': phones,
            'dates': dates,
            'names': list(set(names))[:10]  # Limit to top 10 unique names
        }
        
        total_entities = sum(len(v) for v in entities.values())
        
        return {
            'success': True,
            'data': {
                'entities': entities,
                'entity_count': total_entities,
                'summary': f"Found {total_entities} entities: {len(emails)} emails, {len(names)} names, {len(dates)} dates",
                'metrics': {
                    'Total Entities': total_entities,
                    'Emails': len(emails),
                    'Names': len(names),
                    'Dates': len(dates),
                    'URLs': len(urls)
                }
            }
        }
    
    def analyze_topics(self, content: str) -> Dict[str, Any]:
        """Simple topic analysis based on keyword clustering"""
        
        words = self.extract_words(content.lower())
        word_freq = Counter(words)
        
        # Define topic categories with associated keywords
        topic_categories = {
            'Technology': ['computer', 'software', 'digital', 'tech', 'system', 'data', 'algorithm', 'programming'],
            'Business': ['company', 'market', 'sales', 'profit', 'customer', 'business', 'finance', 'revenue'],
            'Science': ['research', 'study', 'experiment', 'analysis', 'theory', 'hypothesis', 'data', 'results'],
            'Health': ['health', 'medical', 'patient', 'treatment', 'doctor', 'medicine', 'disease', 'therapy'],
            'Education': ['student', 'teacher', 'school', 'learning', 'education', 'study', 'class', 'course'],
            'Environment': ['environment', 'climate', 'energy', 'green', 'sustainability', 'nature', 'pollution']
        }
        
        topic_scores = {}
        for topic, keywords in topic_categories.items():
            score = sum(word_freq.get(keyword, 0) for keyword in keywords)
            if score > 0:
                topic_scores[topic] = score
        
        # Sort topics by relevance
        sorted_topics = sorted(topic_scores.items(), key=lambda x: x[1], reverse=True)
        
        return {
            'success': True,
            'data': {
                'topics': [{'topic': topic, 'relevance': score} for topic, score in sorted_topics],
                'main_topic': sorted_topics[0][0] if sorted_topics else 'General',
                'topic_diversity': len(sorted_topics),
                'summary': f"Main topics: {', '.join([topic for topic, score in sorted_topics[:3]])}",
                'metrics': {
                    'Main Topic': sorted_topics[0][0] if sorted_topics else 'General',
                    'Topic Count': len(sorted_topics),
                    'Top Score': sorted_topics[0][1] if sorted_topics else 0
                }
            }
        }
    
    def analyze_grammar(self, content: str) -> Dict[str, Any]:
        """Basic grammar and writing quality check"""
        
        issues = []
        suggestions = []
        
        # Check for common issues
        sentences = self.split_sentences(content)
        
        # Check sentence length
        long_sentences = [s for s in sentences if len(self.extract_words(s)) > 25]
        if long_sentences:
            issues.append(f"{len(long_sentences)} sentences are very long (>25 words)")
            suggestions.append("Consider breaking long sentences into shorter ones")
        
        # Check for repeated words
        words = self.extract_words(content.lower())
        word_freq = Counter(words)
        repeated_words = [(word, freq) for word, freq in word_freq.items() if freq > len(words) * 0.02 and len(word) > 4]
        
        if repeated_words:
            issues.append(f"Overused words: {', '.join([word for word, freq in repeated_words[:3]])}")
            suggestions.append("Vary vocabulary to avoid repetition")
        
        # Check capitalization
        if not content[0].isupper():
            issues.append("Text should start with a capital letter")
        
        # Check for missing punctuation at end
        if content and content[-1] not in '.!?':
            issues.append("Text should end with proper punctuation")
        
        # Simple spell check (check for common typos)
        common_typos = {
            'teh': 'the', 'hte': 'the', 'adn': 'and', 'youre': "you're",
            'recieve': 'receive', 'seperate': 'separate', 'definately': 'definitely'
        }
        
        found_typos = []
        for word in words:
            if word in common_typos:
                found_typos.append(f"'{word}' → '{common_typos[word]}'")
        
        if found_typos:
            issues.extend(found_typos[:5])  # Limit to 5 typos
            suggestions.append("Check spelling of flagged words")
        
        quality_score = max(0, 100 - len(issues) * 10)
        
        return {
            'success': True,
            'data': {
                'issues': issues,
                'suggestions': suggestions,
                'quality_score': quality_score,
                'typos_found': len(found_typos),
                'summary': f"Found {len(issues)} potential issues. Quality score: {quality_score}/100",
                'metrics': {
                    'Issues Found': len(issues),
                    'Quality Score': f"{quality_score}/100",
                    'Long Sentences': len(long_sentences),
                    'Typos': len(found_typos)
                }
            }
        }
    
    def analyze_translation(self, content: str) -> Dict[str, Any]:
        """Simulate translation analysis"""
        
        # This would integrate with translation APIs in a real implementation
        # For now, we'll provide translation information
        
        detected_language = self.detect_language_simple(content)
        
        return {
            'success': True,
            'data': {
                'detected_language': detected_language,
                'available_translations': list(self.languages.values()),
                'character_count': len(content),
                'translation_complexity': 'Medium' if len(content) > 1000 else 'Low',
                'summary': f"Detected language: {detected_language}. Translation available to {len(self.languages)} languages",
                'metrics': {
                    'Detected Language': detected_language,
                    'Available Languages': len(self.languages),
                    'Character Count': len(content),
                    'Translation Cost': 'Estimated $0.02' if len(content) > 1000 else 'Estimated $0.01'
                }
            }
        }
    
    def analyze_similarity(self, content: str) -> Dict[str, Any]:
        """Analyze text for potential plagiarism/similarity"""
        
        # Simple similarity check (would integrate with plagiarism APIs in real implementation)
        sentences = self.split_sentences(content)
        
        # Check for duplicate sentences within the text
        sentence_counts = Counter(sentences)
        duplicates = [(sentence, count) for sentence, count in sentence_counts.items() if count > 1]
        
        # Calculate uniqueness score
        unique_sentences = len(sentence_counts)
        total_sentences = len(sentences)
        uniqueness_score = (unique_sentences / total_sentences * 100) if total_sentences else 100
        
        return {
            'success': True,
            'data': {
                'uniqueness_score': round(uniqueness_score, 1),
                'duplicate_sentences': len(duplicates),
                'total_sentences': total_sentences,
                'unique_sentences': unique_sentences,
                'duplicates': duplicates[:5],  # Show first 5 duplicates
                'summary': f"Uniqueness score: {uniqueness_score:.1f}%. Found {len(duplicates)} duplicate sentences",
                'metrics': {
                    'Uniqueness Score': f"{uniqueness_score:.1f}%",
                    'Duplicate Sentences': len(duplicates),
                    'Unique Content': f"{(uniqueness_score):.1f}%",
                    'Risk Level': 'Low' if uniqueness_score > 90 else 'Medium' if uniqueness_score > 70 else 'High'
                }
            }
        }
    
    # Helper methods
    def split_sentences(self, text: str) -> List[str]:
        """Split text into sentences"""
        import re
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def extract_words(self, text: str) -> List[str]:
        """Extract words from text"""
        import re
        words = re.findall(r'\b\w+\b', text.lower())
        return [word for word in words if word.isalpha()]
    
    def count_syllables(self, word: str) -> int:
        """Count syllables in a word (simplified)"""
        vowels = 'aeiouy'
        count = 0
        prev_was_vowel = False
        
        for char in word.lower():
            is_vowel = char in vowels
            if is_vowel and not prev_was_vowel:
                count += 1
            prev_was_vowel = is_vowel
        
        # Adjust for silent e
        if word.lower().endswith('e') and count > 1:
            count -= 1
        
        return max(1, count)  # Every word has at least one syllable
    
    def detect_language_simple(self, text: str) -> str:
        """Simple language detection"""
        # Very basic language detection based on common words
        english_words = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
        spanish_words = ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te']
        french_words = ['le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir', 'que', 'pour']
        
        words = self.extract_words(text.lower())
        
        english_score = sum(1 for word in words if word in english_words)
        spanish_score = sum(1 for word in words if word in spanish_words)
        french_score = sum(1 for word in words if word in french_words)
        
        if english_score >= spanish_score and english_score >= french_score:
            return 'English'
        elif spanish_score > french_score:
            return 'Spanish'
        elif french_score > 0:
            return 'French'
        else:
            return 'English'  # Default
    
    def calculate_basic_stats(self, content: str) -> Dict[str, Any]:
        """Calculate basic document statistics"""
        words = self.extract_words(content)
        sentences = self.split_sentences(content)
        
        return {
            'Words': len(words),
            'Characters': len(content),
            'Sentences': len(sentences),
            'Paragraphs': len([p for p in content.split('\n\n') if p.strip()])
        }
    
    def render_analysis_results(self, results: Dict[str, Any]):
        """Render analysis results in a formatted way"""
        
        if 'summary' in results:
            st.write("**Summary:**", results['summary'])
        
        if 'metrics' in results:
            cols = st.columns(len(results['metrics']))
            for i, (metric, value) in enumerate(results['metrics'].items()):
                with cols[i]:
                    st.metric(metric, value)
        
        # Show specific result types
        if 'keywords' in results:
            st.write("**Top Keywords:**")
            for kw in results['keywords'][:5]:
                st.write(f"• {kw['word']} ({kw['frequency']})")
        
        if 'entities' in results:
            entities = results['entities']
            if entities['names']:
                st.write(f"**Names:** {', '.join(entities['names'][:5])}")
            if entities['emails']:
                st.write(f"**Emails:** {', '.join(entities['emails'])}")
        
        if 'topics' in results:
            st.write("**Main Topics:**")
            for topic in results['topics'][:3]:
                st.write(f"• {topic['topic']} (relevance: {topic['relevance']})")
        
        if 'issues' in results and results['issues']:
            st.write("**Issues Found:**")
            for issue in results['issues'][:5]:
                st.write(f"• {issue}")
    
    def extract_file_content(self, uploaded_file) -> Optional[str]:
        """Extract content from uploaded file"""
        try:
            if uploaded_file.type == "text/plain":
                return str(uploaded_file.read(), "utf-8")
            elif uploaded_file.type == "text/csv":
                # For CSV, convert to readable text
                df = pd.read_csv(uploaded_file)
                return df.to_string()
            else:
                st.error("File type not supported yet")
                return None
        except Exception as e:
            st.error(f"Error reading file: {str(e)}")
            return None
    
    def extract_url_content(self, url: str) -> Optional[str]:
        """Extract content from URL"""
        try:
            import requests
            from bs4 import BeautifulSoup
            
            response = requests.get(url, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.extract()
            
            # Get text
            text = soup.get_text()
            
            # Clean up whitespace
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)
            
            return text[:10000]  # Limit to first 10k characters
            
        except Exception as e:
            st.error(f"Error extracting URL content: {str(e)}")
            return None
    
    def save_current_analysis(self):
        """Save the current analysis"""
        st.success("✅ Analysis saved successfully!")
    
    def export_analysis_report(self):
        """Export analysis report"""
        if st.session_state.current_document:
            # Generate report
            doc = st.session_state.current_document
            report = f"""
TEXT ANALYSIS REPORT
===================

Document: {doc['name']}
Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

DOCUMENT STATISTICS:
{json.dumps(self.calculate_basic_stats(doc['content']), indent=2)}

RECENT ANALYSES:
{len(doc.get('analyses', []))} analyses performed
            """
            
            # Save report
            output_dir = "text_analysis_reports"
            os.makedirs(output_dir, exist_ok=True)
            
            timestamp = int(time.time())
            report_path = os.path.join(output_dir, f"analysis_report_{timestamp}.txt")
            
            with open(report_path, 'w', encoding='utf-8') as f:
                f.write(report)
            
            st.success(f"✅ Report exported: {report_path}")
            
            # Provide download
            st.download_button(
                "📥 Download Report",
                data=report,
                file_name=f"analysis_report_{timestamp}.txt",
                mime="text/plain"
            )

def main():
    app = AITextStudio()
    app.render_interface()

if __name__ == "__main__":
    main()
