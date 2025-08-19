#!/usr/bin/env python3
"""
📄 REAL DOCUMENT PROCESSING IMPLEMENTATION
PDF processing + OCR + Text analysis with business applications
Business value: Document automation, data extraction, compliance
"""

import pdfplumber
import pytesseract
from PIL import Image
import pandas as pd
import re
import json
import os
from datetime import datetime
import spacy
import cv2
import numpy as np
from collections import Counter

class RealDocumentProcessor:
    """
    Real document processing system for business automation
    """
    
    def __init__(self):
        print("📄 Initializing Real Document Processor...")
        
        # Try to load spaCy model for NLP
        try:
            self.nlp = spacy.load("en_core_web_sm")
            print("✅ spaCy NLP model loaded")
        except OSError:
            print("⚠️  spaCy model not found. Install with: python -m spacy download en_core_web_sm")
            self.nlp = None
        
        # OCR configuration
        self.ocr_config = '--oem 3 --psm 6'
        
        print("📄 Document Processor ready!")
    
    def extract_text_from_pdf(self, pdf_path):
        """Extract text from PDF files"""
        print(f"\n📑 Processing PDF: {pdf_path}")
        
        if not os.path.exists(pdf_path):
            print(f"❌ Error: PDF file not found: {pdf_path}")
            return None
        
        try:
            extracted_data = {
                'file': pdf_path,
                'pages': [],
                'total_text': '',
                'metadata': {},
                'tables': [],
                'timestamp': datetime.now().isoformat()
            }
            
            with pdfplumber.open(pdf_path) as pdf:
                # Extract metadata
                extracted_data['metadata'] = {
                    'pages': len(pdf.pages),
                    'title': pdf.metadata.get('Title', ''),
                    'author': pdf.metadata.get('Author', ''),
                    'subject': pdf.metadata.get('Subject', ''),
                    'creator': pdf.metadata.get('Creator', ''),
                    'creation_date': str(pdf.metadata.get('CreationDate', ''))
                }
                
                print(f"📊 PDF Info: {len(pdf.pages)} pages")
                
                for page_num, page in enumerate(pdf.pages, 1):
                    print(f"   📄 Processing page {page_num}...")
                    
                    # Extract text
                    page_text = page.extract_text() or ""
                    
                    # Extract tables
                    tables = page.extract_tables()
                    page_tables = []
                    
                    for table in tables:
                        if table:  # Only non-empty tables
                            page_tables.append(table)
                            extracted_data['tables'].extend(table)
                    
                    page_data = {
                        'page_number': page_num,
                        'text': page_text,
                        'tables': page_tables,
                        'word_count': len(page_text.split()),
                        'char_count': len(page_text)
                    }
                    
                    extracted_data['pages'].append(page_data)
                    extracted_data['total_text'] += page_text + "\n"
            
            # Save extracted data
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"extracted_pdf_{timestamp}.json"
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(extracted_data, f, indent=2, ensure_ascii=False)
            
            # Save as clean text file
            text_file = f"extracted_text_{timestamp}.txt"
            with open(text_file, 'w', encoding='utf-8') as f:
                f.write(f"PDF: {pdf_path}\n")
                f.write(f"Processed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write("=" * 60 + "\n\n")
                f.write(extracted_data['total_text'])
            
            print(f"📄 PDF Processing Complete:")
            print(f"   📊 Pages: {len(extracted_data['pages'])}")
            print(f"   📝 Total words: {len(extracted_data['total_text'].split())}")
            print(f"   📋 Tables found: {len(extracted_data['tables'])}")
            print(f"   💾 Data saved: {output_file}")
            print(f"   📄 Text saved: {text_file}")
            
            return extracted_data
            
        except Exception as e:
            print(f"❌ Error processing PDF: {str(e)}")
            return None
    
    def ocr_image_to_text(self, image_path):
        """Extract text from images using OCR"""
        print(f"\n🖼️ OCR processing image: {image_path}")
        
        if not os.path.exists(image_path):
            print(f"❌ Error: Image file not found: {image_path}")
            return None
        
        try:
            # Load and preprocess image
            image = cv2.imread(image_path)
            
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Apply noise reduction and thresholding
            denoised = cv2.medianBlur(gray, 3)
            _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            # OCR with Tesseract
            raw_text = pytesseract.image_to_string(binary, config=self.ocr_config)
            
            # Get detailed OCR data
            ocr_data = pytesseract.image_to_data(binary, output_type=pytesseract.Output.DICT)
            
            # Process OCR results
            processed_text = self._clean_ocr_text(raw_text)
            confidence_scores = [int(conf) for conf in ocr_data['conf'] if int(conf) > 0]
            avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
            
            ocr_result = {
                'file': image_path,
                'raw_text': raw_text,
                'processed_text': processed_text,
                'word_count': len(processed_text.split()),
                'char_count': len(processed_text),
                'confidence': round(avg_confidence, 2),
                'detected_words': len([w for w in ocr_data['text'] if w.strip()]),
                'timestamp': datetime.now().isoformat()
            }
            
            # Save OCR results
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"ocr_result_{timestamp}.json"
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(ocr_result, f, indent=2, ensure_ascii=False)
            
            # Save processed image
            processed_image_path = f"ocr_processed_{timestamp}.png"
            cv2.imwrite(processed_image_path, binary)
            
            print(f"🖼️ OCR Processing Complete:")
            print(f"   📊 Confidence: {avg_confidence:.1f}%")
            print(f"   📝 Words detected: {ocr_result['detected_words']}")
            print(f"   📄 Characters: {ocr_result['char_count']}")
            print(f"   💾 Results saved: {output_file}")
            print(f"   🖼️ Processed image: {processed_image_path}")
            
            return ocr_result
            
        except Exception as e:
            print(f"❌ Error during OCR: {str(e)}")
            return None
    
    def analyze_document_content(self, text):
        """Analyze document content using NLP"""
        print(f"\n🧠 Analyzing document content...")
        
        if not self.nlp:
            print("⚠️  NLP model not available. Performing basic analysis...")
            return self._basic_text_analysis(text)
        
        try:
            doc = self.nlp(text[:1000000])  # Limit text size for processing
            
            # Extract entities
            entities = []
            for ent in doc.ents:
                entities.append({
                    'text': ent.text,
                    'label': ent.label_,
                    'description': spacy.explain(ent.label_)
                })
            
            # Extract key phrases (noun chunks)
            key_phrases = [chunk.text for chunk in doc.noun_chunks if len(chunk.text.split()) > 1]
            
            # Sentence analysis
            sentences = [sent.text.strip() for sent in doc.sents if len(sent.text.strip()) > 10]
            
            analysis_result = {
                'word_count': len(text.split()),
                'sentence_count': len(sentences),
                'paragraph_count': len(text.split('\n\n')),
                'entities': entities[:50],  # Top 50 entities
                'key_phrases': key_phrases[:30],  # Top 30 key phrases
                'entity_types': dict(Counter([ent['label'] for ent in entities])),
                'avg_sentence_length': sum(len(s.split()) for s in sentences) / len(sentences) if sentences else 0,
                'timestamp': datetime.now().isoformat()
            }
            
            print(f"🧠 Content Analysis Complete:")
            print(f"   📊 Entities found: {len(entities)}")
            print(f"   🔤 Key phrases: {len(key_phrases)}")
            print(f"   📄 Sentences: {len(sentences)}")
            print(f"   📈 Avg sentence length: {analysis_result['avg_sentence_length']:.1f} words")
            
            return analysis_result
            
        except Exception as e:
            print(f"❌ Error during analysis: {str(e)}")
            return self._basic_text_analysis(text)
    
    def extract_business_data(self, text):
        """Extract specific business data from documents"""
        print(f"\n💼 Extracting business data...")
        
        business_data = {
            'emails': [],
            'phones': [],
            'addresses': [],
            'dates': [],
            'currencies': [],
            'organizations': [],
            'people': [],
            'urls': []
        }
        
        # Email extraction
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        business_data['emails'] = list(set(re.findall(email_pattern, text)))
        
        # Phone number extraction
        phone_pattern = r'\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b'
        business_data['phones'] = list(set(re.findall(phone_pattern, text)))
        
        # Date extraction
        date_pattern = r'\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b'
        business_data['dates'] = list(set(re.findall(date_pattern, text)))
        
        # Currency extraction
        currency_pattern = r'\$[\d,]+\.?\d*'
        business_data['currencies'] = list(set(re.findall(currency_pattern, text)))
        
        # URL extraction
        url_pattern = r'https?://(?:[-\w.])+(?:\:[0-9]+)?(?:/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:\#(?:[\w.])*)?)?'
        business_data['urls'] = list(set(re.findall(url_pattern, text)))
        
        # Use NLP for organizations and people if available
        if self.nlp and text:
            doc = self.nlp(text[:500000])  # Limit for performance
            
            for ent in doc.ents:
                if ent.label_ == "ORG":
                    business_data['organizations'].append(ent.text)
                elif ent.label_ == "PERSON":
                    business_data['people'].append(ent.text)
                elif ent.label_ in ["GPE", "LOC"]:
                    business_data['addresses'].append(ent.text)
            
            # Remove duplicates and limit results
            for key in ['organizations', 'people', 'addresses']:
                business_data[key] = list(set(business_data[key]))[:20]
        
        print(f"💼 Business Data Extraction Complete:")
        print(f"   📧 Emails: {len(business_data['emails'])}")
        print(f"   📞 Phone numbers: {len(business_data['phones'])}")
        print(f"   🏢 Organizations: {len(business_data['organizations'])}")
        print(f"   👥 People: {len(business_data['people'])}")
        print(f"   💰 Currency amounts: {len(business_data['currencies'])}")
        
        return business_data
    
    def batch_process_documents(self, directory_path):
        """Process multiple documents in a directory"""
        print(f"\n📁 Batch processing documents in: {directory_path}")
        
        if not os.path.exists(directory_path):
            print(f"❌ Error: Directory not found: {directory_path}")
            return
        
        # Find supported document files
        supported_extensions = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp']
        document_files = []
        
        for file in os.listdir(directory_path):
            if any(file.lower().endswith(ext) for ext in supported_extensions):
                document_files.append(os.path.join(directory_path, file))
        
        if not document_files:
            print(f"❌ No supported documents found in {directory_path}")
            return
        
        print(f"📂 Found {len(document_files)} documents to process")
        
        results = []
        
        for i, file_path in enumerate(document_files, 1):
            print(f"\n📍 Processing {i}/{len(document_files)}: {os.path.basename(file_path)}")
            
            if file_path.lower().endswith('.pdf'):
                result = self.extract_text_from_pdf(file_path)
            else:
                result = self.ocr_image_to_text(file_path)
            
            if result:
                # Analyze content
                content_analysis = self.analyze_document_content(result.get('total_text', '') or result.get('processed_text', ''))
                business_data = self.extract_business_data(result.get('total_text', '') or result.get('processed_text', ''))
                
                result['content_analysis'] = content_analysis
                result['business_data'] = business_data
                results.append(result)
        
        # Generate batch report
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        batch_report = f"batch_document_processing_{timestamp}.json"
        
        batch_summary = {
            'directory': directory_path,
            'total_files': len(document_files),
            'processed_successfully': len(results),
            'processing_date': datetime.now().isoformat(),
            'summary': {
                'total_words': sum(r.get('content_analysis', {}).get('word_count', 0) for r in results),
                'total_emails': sum(len(r.get('business_data', {}).get('emails', [])) for r in results),
                'total_phones': sum(len(r.get('business_data', {}).get('phones', [])) for r in results),
                'total_organizations': sum(len(r.get('business_data', {}).get('organizations', [])) for r in results)
            },
            'results': results
        }
        
        with open(batch_report, 'w', encoding='utf-8') as f:
            json.dump(batch_summary, f, indent=2, ensure_ascii=False)
        
        print(f"\n🎯 Batch Processing Complete!")
        print(f"   📊 Processed: {len(results)}/{len(document_files)} files")
        print(f"   📝 Total words extracted: {batch_summary['summary']['total_words']:,}")
        print(f"   📧 Total emails found: {batch_summary['summary']['total_emails']}")
        print(f"   📞 Total phones found: {batch_summary['summary']['total_phones']}")
        print(f"   🏢 Total organizations: {batch_summary['summary']['total_organizations']}")
        print(f"   📄 Report saved: {batch_report}")
        
        return results
    
    def _clean_ocr_text(self, text):
        """Clean OCR text output"""
        # Remove extra whitespace
        text = ' '.join(text.split())
        
        # Fix common OCR errors
        ocr_corrections = {
            'rn': 'm',
            '|': 'I',
            '0': 'O',  # Only in specific contexts
            '5': 'S',  # Only in specific contexts
        }
        
        # Apply corrections cautiously
        for old, new in ocr_corrections.items():
            # Only replace in obvious contexts
            pass  # Implement specific rules as needed
        
        return text
    
    def _basic_text_analysis(self, text):
        """Basic text analysis when NLP is not available"""
        words = text.split()
        sentences = text.split('.')
        paragraphs = text.split('\n\n')
        
        return {
            'word_count': len(words),
            'sentence_count': len(sentences),
            'paragraph_count': len(paragraphs),
            'avg_sentence_length': len(words) / len(sentences) if sentences else 0,
            'entities': [],
            'key_phrases': [],
            'entity_types': {},
            'timestamp': datetime.now().isoformat()
        }

def demonstrate_real_document_processing():
    """Demonstrate real document processing capabilities"""
    
    print("📄 REAL DOCUMENT PROCESSING DEMONSTRATION")
    print("=" * 55)
    
    # Initialize processor
    processor = RealDocumentProcessor()
    
    # Check for sample documents
    pdf_files = [f for f in os.listdir('.') if f.lower().endswith('.pdf')]
    image_files = [f for f in os.listdir('.') if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff', '.bmp'))]
    
    print(f"\n📁 Found documents:")
    print(f"   📑 PDF files: {len(pdf_files)}")
    print(f"   🖼️ Image files: {len(image_files)}")
    
    if pdf_files:
        print(f"\n📑 PDF files available:")
        for pdf in pdf_files[:3]:  # Show first 3
            print(f"   📄 {pdf}")
    
    if image_files:
        print(f"\n🖼️ Image files available:")
        for img in image_files[:3]:  # Show first 3
            print(f"   🖼️ {img}")
    
    if pdf_files or image_files:
        print(f"\n🎯 Document Processing Demo Options:")
        print("1. Process PDF files")
        print("2. OCR image files")
        print("3. Batch process all documents")
        print("4. Business data extraction demo")
        
        choice = input("\nChoose demo (1-4, or 'n' to skip): ").lower()
        
        if choice == '1' and pdf_files:
            result = processor.extract_text_from_pdf(pdf_files[0])
            if result and result['total_text']:
                analysis = processor.analyze_document_content(result['total_text'])
                business_data = processor.extract_business_data(result['total_text'])
        
        elif choice == '2' and image_files:
            result = processor.ocr_image_to_text(image_files[0])
            if result and result['processed_text']:
                analysis = processor.analyze_document_content(result['processed_text'])
                business_data = processor.extract_business_data(result['processed_text'])
        
        elif choice == '3':
            results = processor.batch_process_documents('.')
            print(f"✅ Batch processing completed: {len(results)} documents")
        
        elif choice == '4':
            # Demo with sample business text
            sample_text = """
            Contact John Smith at john.smith@company.com or call (555) 123-4567.
            Meeting scheduled for 03/15/2024 at ABC Corporation headquarters.
            Budget approved: $125,000.00 for Q1 2024.
            Website: https://www.company.com
            Address: 123 Business Ave, New York, NY 10001
            """
            
            business_data = processor.extract_business_data(sample_text)
            analysis = processor.analyze_document_content(sample_text)
    
    else:
        print("\n📂 No documents found in current directory")
        print("💡 To test, add some PDF files or images")
    
    print(f"\n💼 BUSINESS APPLICATIONS:")
    print("📋 Contract Analysis: Extract key terms, dates, amounts")
    print("📧 Email Processing: Extract contacts, action items")
    print("📊 Invoice Processing: Automate data entry, validation")
    print("📑 Legal Discovery: Search documents, extract evidence")
    print("🏥 Medical Records: Extract patient data, compliance")
    print("📈 Financial Reports: Extract metrics, KPIs")
    
    print(f"\n💰 REVENUE OPPORTUNITIES:")
    print("• Document digitization: $0.10-$1.00 per page")
    print("• Contract analysis: $500-$5000 per contract")
    print("• Invoice processing: $0.50-$3.00 per invoice")
    print("• Legal document review: $100-$500 per hour")
    print("• Compliance auditing: $5000-$50000 per project")

if __name__ == "__main__":
    # Install required components first
    print("📦 Installing required OCR components...")
    
    try:
        import pytesseract
        print("✅ pytesseract available")
    except ImportError:
        print("❌ Install with: pip install pytesseract")
        print("❌ Also install Tesseract binary from: https://github.com/UB-Mannheim/tesseract/wiki")
    
    try:
        import spacy
        print("✅ spaCy available")
    except ImportError:
        print("❌ Install with: pip install spacy")
        print("❌ Then: python -m spacy download en_core_web_sm")
    
    demonstrate_real_document_processing()
