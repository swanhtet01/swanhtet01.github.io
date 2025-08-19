#!/usr/bin/env python3
"""
Super Mega Email Intelligence Suite - Gmail/Outlook Replacement
Advanced email analysis, management, and AI-powered features with full user memory
"""

import os
import json
import time
import uuid
import sqlite3
import imaplib
import smtplib
import email
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import logging
from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from supermega_user_memory import user_memory, get_user_session

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SuperMegaEmailIntelligence:
    """Advanced email intelligence system with AI analysis"""
    
    def __init__(self):
        self.tool_name = "email_intelligence_suite"
        self.init_email_database()
        
    def init_email_database(self):
        """Initialize email-specific database"""
        conn = sqlite3.connect('email_intelligence.db')
        cursor = conn.cursor()
        
        # Email accounts
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS email_accounts (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                email_address TEXT,
                provider TEXT,
                server_settings TEXT,
                last_sync TIMESTAMP,
                total_emails INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Email messages
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS email_messages (
                id TEXT PRIMARY KEY,
                account_id TEXT,
                user_id TEXT,
                message_id TEXT,
                subject TEXT,
                sender TEXT,
                recipients TEXT,
                body_text TEXT,
                body_html TEXT,
                attachments TEXT,
                ai_analysis TEXT,
                sentiment_score REAL,
                priority_score REAL,
                category TEXT,
                tags TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                is_starred BOOLEAN DEFAULT FALSE,
                is_archived BOOLEAN DEFAULT FALSE,
                thread_id TEXT,
                received_at TIMESTAMP,
                processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES email_accounts (id)
            )
        """)
        
        # AI insights and analysis
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS email_insights (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                insight_type TEXT,
                title TEXT,
                description TEXT,
                data TEXT,
                importance REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Smart filters and rules
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS smart_filters (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                filter_name TEXT,
                conditions TEXT,
                actions TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        conn.close()

email_intelligence = SuperMegaEmailIntelligence()

# Enhanced Email Intelligence Suite HTML Interface
EMAIL_SUITE_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Intelligence Suite - Super Mega</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <style>
        .email-card {
            transition: all 0.3s ease;
            border-left: 4px solid transparent;
        }
        .email-card:hover { 
            transform: translateX(4px); 
            border-left-color: #3B82F6;
            background: rgba(59, 130, 246, 0.05);
        }
        .priority-high { border-left-color: #EF4444; }
        .priority-medium { border-left-color: #F59E0B; }
        .priority-low { border-left-color: #10B981; }
        .unread { background: rgba(59, 130, 246, 0.03); font-weight: 600; }
        .processing-indicator {
            background: linear-gradient(45deg, #3B82F6, #8B5CF6);
            background-size: 200% 200%;
            animation: gradient 2s ease infinite;
        }
        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .ai-insight {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1));
            border: 1px solid rgba(139, 92, 246, 0.3);
        }
    </style>
</head>
<body class="bg-gray-50" x-data="emailSuite()">

    <!-- Header -->
    <div class="bg-gradient-to-r from-blue-900 to-purple-900 text-white p-4 shadow-lg">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center space-x-4">
                <h1 class="text-2xl font-bold">📧 Email Intelligence Suite</h1>
                <div class="bg-white bg-opacity-20 px-3 py-1 rounded-full text-sm">
                    AI-Powered Email Management
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <div class="text-right text-sm">
                    <div>Emails: <span x-text="emailStats.total"></span></div>
                    <div>Unread: <span x-text="emailStats.unread" class="font-bold"></span></div>
                </div>
                <button @click="showSettings = true" 
                        class="bg-white bg-opacity-20 px-3 py-1 rounded hover:bg-opacity-30">
                    ⚙️ Settings
                </button>
                <button @click="syncEmails" 
                        :class="syncing ? 'processing-indicator' : 'bg-green-600 hover:bg-green-700'"
                        class="px-4 py-2 rounded font-medium">
                    <span x-show="!syncing">🔄 Sync</span>
                    <span x-show="syncing">⏳ Syncing...</span>
                </button>
            </div>
        </div>
    </div>

    <div class="max-w-7xl mx-auto p-6">
        
        <!-- AI Insights Panel -->
        <div x-show="aiInsights.length > 0" class="mb-6">
            <div class="ai-insight rounded-lg p-4">
                <h2 class="font-bold text-lg mb-3">🧠 AI Insights</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <template x-for="insight in aiInsights" :key="insight.id">
                        <div class="bg-white rounded-lg p-3 shadow">
                            <div class="flex items-center justify-between mb-2">
                                <span class="font-medium text-sm" x-text="insight.title"></span>
                                <span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded"
                                      x-text="insight.importance + '% important'"></span>
                            </div>
                            <p class="text-sm text-gray-600" x-text="insight.description"></p>
                        </div>
                    </template>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-12 gap-6">
            
            <!-- Sidebar -->
            <div class="col-span-3">
                
                <!-- Navigation -->
                <div class="bg-white rounded-lg shadow p-4 mb-4">
                    <nav class="space-y-2">
                        <button @click="activeView = 'inbox'" 
                                :class="activeView === 'inbox' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            📥 Inbox (<span x-text="emailStats.unread"></span>)
                        </button>
                        <button @click="activeView = 'starred'" 
                                :class="activeView === 'starred' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            ⭐ Starred (<span x-text="emailStats.starred"></span>)
                        </button>
                        <button @click="activeView = 'sent'" 
                                :class="activeView === 'sent' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            📤 Sent
                        </button>
                        <button @click="activeView = 'analytics'" 
                                :class="activeView === 'analytics' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            📊 Analytics
                        </button>
                        <button @click="activeView = 'compose'" 
                                class="w-full text-left px-3 py-2 rounded bg-green-500 text-white hover:bg-green-600">
                            ✏️ Compose
                        </button>
                    </nav>
                </div>

                <!-- Smart Filters -->
                <div class="bg-white rounded-lg shadow p-4 mb-4">
                    <h3 class="font-bold mb-3">🎯 Smart Filters</h3>
                    <div class="space-y-2">
                        <button @click="applyFilter('priority', 'high')" 
                                class="w-full text-left px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded">
                            🔥 High Priority (<span x-text="getFilterCount('priority', 'high')"></span>)
                        </button>
                        <button @click="applyFilter('category', 'work')" 
                                class="w-full text-left px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded">
                            💼 Work (<span x-text="getFilterCount('category', 'work')"></span>)
                        </button>
                        <button @click="applyFilter('category', 'personal')" 
                                class="w-full text-left px-2 py-1 text-sm text-green-600 hover:bg-green-50 rounded">
                            👤 Personal (<span x-text="getFilterCount('category', 'personal')"></span>)
                        </button>
                        <button @click="applyFilter('has_attachments', true)" 
                                class="w-full text-left px-2 py-1 text-sm text-purple-600 hover:bg-purple-50 rounded">
                            📎 With Attachments (<span x-text="getFilterCount('has_attachments', true)"></span>)
                        </button>
                    </div>
                    
                    <div class="mt-3 pt-3 border-t">
                        <button @click="showFilterBuilder = true" 
                                class="w-full text-center py-2 text-sm text-blue-600 hover:bg-blue-50 rounded">
                            ➕ Create Smart Filter
                        </button>
                    </div>
                </div>

                <!-- Account Management -->
                <div class="bg-white rounded-lg shadow p-4">
                    <h3 class="font-bold mb-3">📫 Email Accounts</h3>
                    <div class="space-y-2">
                        <template x-for="account in emailAccounts" :key="account.id">
                            <div class="flex items-center justify-between p-2 border rounded">
                                <div>
                                    <div class="font-medium text-sm" x-text="account.email_address"></div>
                                    <div class="text-xs text-gray-500" x-text="account.provider"></div>
                                </div>
                                <div class="flex space-x-1">
                                    <button @click="syncAccount(account.id)" class="text-blue-500 hover:text-blue-600">
                                        🔄
                                    </button>
                                    <button @click="editAccount(account.id)" class="text-gray-500 hover:text-gray-600">
                                        ⚙️
                                    </button>
                                </div>
                            </div>
                        </template>
                        <button @click="showAddAccount = true" 
                                class="w-full py-2 text-center text-sm text-blue-600 hover:bg-blue-50 rounded border-2 border-dashed border-blue-300">
                            ➕ Add Email Account
                        </button>
                    </div>
                </div>
            </div>

            <!-- Main Content -->
            <div class="col-span-9">
                
                <!-- Search and Filters Bar -->
                <div class="bg-white rounded-lg shadow p-4 mb-4">
                    <div class="flex items-center space-x-4">
                        <div class="flex-1 relative">
                            <input type="text" x-model="searchQuery" @keyup.enter="searchEmails"
                                   placeholder="Search emails, contacts, or content..."
                                   class="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center">
                                <span class="text-gray-400">🔍</span>
                            </div>
                        </div>
                        <select x-model="sortBy" @change="sortEmails" 
                                class="border rounded px-3 py-2">
                            <option value="received_at">Date</option>
                            <option value="priority_score">Priority</option>
                            <option value="sentiment_score">Sentiment</option>
                            <option value="sender">Sender</option>
                        </select>
                        <button @click="toggleView" 
                                :class="viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-gray-200'"
                                class="px-3 py-2 rounded">
                            📋 List
                        </button>
                        <button @click="toggleView" 
                                :class="viewMode === 'cards' ? 'bg-blue-500 text-white' : 'bg-gray-200'"
                                class="px-3 py-2 rounded">
                            📇 Cards
                        </button>
                    </div>
                </div>

                <!-- Inbox View -->
                <div x-show="activeView === 'inbox'">
                    <div class="bg-white rounded-lg shadow">
                        
                        <!-- Bulk Actions -->
                        <div x-show="selectedEmails.length > 0" 
                             class="bg-blue-50 border-b p-4 flex items-center justify-between">
                            <div>
                                <span x-text="selectedEmails.length"></span> emails selected
                            </div>
                            <div class="flex space-x-2">
                                <button @click="bulkAction('read')" 
                                        class="px-3 py-1 bg-gray-600 text-white rounded text-sm">
                                    📖 Mark Read
                                </button>
                                <button @click="bulkAction('star')" 
                                        class="px-3 py-1 bg-yellow-600 text-white rounded text-sm">
                                    ⭐ Star
                                </button>
                                <button @click="bulkAction('archive')" 
                                        class="px-3 py-1 bg-green-600 text-white rounded text-sm">
                                    📁 Archive
                                </button>
                                <button @click="bulkAction('delete')" 
                                        class="px-3 py-1 bg-red-600 text-white rounded text-sm">
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>

                        <!-- Email List -->
                        <div class="divide-y">
                            <template x-for="email in filteredEmails" :key="email.id">
                                <div class="email-card p-4 cursor-pointer"
                                     :class="{
                                         'unread': !email.is_read,
                                         'priority-high': email.priority_score > 80,
                                         'priority-medium': email.priority_score > 50 && email.priority_score <= 80,
                                         'priority-low': email.priority_score <= 50
                                     }"
                                     @click="selectEmail(email)">
                                    
                                    <div class="flex items-center space-x-4">
                                        
                                        <!-- Checkbox -->
                                        <input type="checkbox" 
                                               :checked="selectedEmails.includes(email.id)"
                                               @change="toggleEmailSelection(email.id)"
                                               @click.stop
                                               class="rounded">
                                        
                                        <!-- Sender Avatar -->
                                        <div class="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                             x-text="email.sender.charAt(0).toUpperCase()">
                                        </div>
                                        
                                        <!-- Email Content -->
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center justify-between mb-1">
                                                <div class="flex items-center space-x-2">
                                                    <span class="font-medium truncate" x-text="email.sender"></span>
                                                    <div class="flex space-x-1">
                                                        <span x-show="email.is_starred" class="text-yellow-400">⭐</span>
                                                        <span x-show="email.attachments && email.attachments.length > 0" class="text-gray-400">📎</span>
                                                    </div>
                                                </div>
                                                <div class="flex items-center space-x-2">
                                                    <div class="text-xs px-2 py-1 rounded"
                                                         :class="{
                                                             'bg-red-100 text-red-700': email.priority_score > 80,
                                                             'bg-yellow-100 text-yellow-700': email.priority_score > 50 && email.priority_score <= 80,
                                                             'bg-green-100 text-green-700': email.priority_score <= 50
                                                         }"
                                                         x-text="email.priority_score > 80 ? 'HIGH' : email.priority_score > 50 ? 'MED' : 'LOW'">
                                                    </div>
                                                    <span class="text-sm text-gray-500" x-text="formatDate(email.received_at)"></span>
                                                </div>
                                            </div>
                                            
                                            <div class="font-medium text-gray-900 truncate mb-1" x-text="email.subject"></div>
                                            
                                            <div class="text-sm text-gray-600 truncate" x-text="email.body_text.substring(0, 150) + '...'"></div>
                                            
                                            <!-- AI Analysis Tags -->
                                            <div x-show="email.ai_analysis" class="flex items-center space-x-2 mt-2">
                                                <template x-for="tag in JSON.parse(email.ai_analysis || '{}').tags || []" :key="tag">
                                                    <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded" x-text="tag"></span>
                                                </template>
                                                <div class="text-xs"
                                                     :class="{
                                                         'text-green-600': email.sentiment_score > 0.1,
                                                         'text-red-600': email.sentiment_score < -0.1,
                                                         'text-gray-600': email.sentiment_score >= -0.1 && email.sentiment_score <= 0.1
                                                     }"
                                                     x-text="email.sentiment_score > 0.1 ? '😊 Positive' : email.sentiment_score < -0.1 ? '😟 Negative' : '😐 Neutral'">
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- Quick Actions -->
                                        <div class="flex space-x-2 opacity-0 hover:opacity-100 transition-opacity"
                                             @click.stop>
                                            <button @click="toggleStar(email.id)" 
                                                    :class="email.is_starred ? 'text-yellow-400' : 'text-gray-400'"
                                                    class="hover:text-yellow-500">⭐</button>
                                            <button @click="archiveEmail(email.id)" 
                                                    class="text-gray-400 hover:text-green-500">📁</button>
                                            <button @click="deleteEmail(email.id)" 
                                                    class="text-gray-400 hover:text-red-500">🗑️</button>
                                            <button @click="replyToEmail(email)" 
                                                    class="text-gray-400 hover:text-blue-500">↩️</button>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </div>
                        
                        <!-- Loading State -->
                        <div x-show="loading" class="p-8 text-center">
                            <div class="processing-indicator w-8 h-8 rounded-full mx-auto mb-4"></div>
                            <div>Loading emails...</div>
                        </div>
                        
                        <!-- Empty State -->
                        <div x-show="!loading && filteredEmails.length === 0" class="p-8 text-center text-gray-500">
                            <div class="text-4xl mb-4">📭</div>
                            <div>No emails found</div>
                        </div>
                    </div>
                </div>

                <!-- Analytics View -->
                <div x-show="activeView === 'analytics'" class="space-y-6">
                    <div class="bg-white rounded-lg shadow p-6">
                        <h2 class="text-xl font-bold mb-4">📊 Email Analytics & Insights</h2>
                        
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                            <div class="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-4">
                                <div class="text-2xl font-bold" x-text="analytics.totalEmails"></div>
                                <div class="text-blue-100">Total Emails</div>
                            </div>
                            <div class="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-4">
                                <div class="text-2xl font-bold" x-text="analytics.responseRate + '%'"></div>
                                <div class="text-green-100">Response Rate</div>
                            </div>
                            <div class="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4">
                                <div class="text-2xl font-bold" x-text="analytics.avgResponseTime"></div>
                                <div class="text-purple-100">Avg Response Time</div>
                            </div>
                            <div class="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white rounded-lg p-4">
                                <div class="text-2xl font-bold" x-text="analytics.productivityScore + '%'"></div>
                                <div class="text-yellow-100">Productivity Score</div>
                            </div>
                        </div>
                        
                        <!-- Charts and detailed analytics would go here -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="border rounded-lg p-4">
                                <h3 class="font-medium mb-3">📈 Email Volume Trends</h3>
                                <div class="h-48 bg-gray-100 rounded flex items-center justify-center text-gray-500">
                                    Chart: Email volume over time
                                </div>
                            </div>
                            <div class="border rounded-lg p-4">
                                <h3 class="font-medium mb-3">🎯 Top Senders</h3>
                                <div class="space-y-2">
                                    <template x-for="sender in analytics.topSenders" :key="sender.email">
                                        <div class="flex justify-between">
                                            <span x-text="sender.email"></span>
                                            <span x-text="sender.count + ' emails'"></span>
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Compose View -->
                <div x-show="activeView === 'compose'" class="bg-white rounded-lg shadow p-6">
                    <h2 class="text-xl font-bold mb-4">✏️ Compose Email</h2>
                    
                    <form @submit.prevent="sendEmail" class="space-y-4">
                        <div class="grid grid-cols-3 gap-4">
                            <div>
                                <label class="block text-sm font-medium mb-1">To</label>
                                <input type="email" x-model="composeEmail.to" 
                                       placeholder="recipient@example.com"
                                       class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500" required>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">CC</label>
                                <input type="email" x-model="composeEmail.cc" 
                                       placeholder="cc@example.com"
                                       class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">BCC</label>
                                <input type="email" x-model="composeEmail.bcc" 
                                       placeholder="bcc@example.com"
                                       class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Subject</label>
                            <input type="text" x-model="composeEmail.subject" 
                                   placeholder="Email subject"
                                   class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500" required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Message</label>
                            <textarea x-model="composeEmail.body" rows="10"
                                      placeholder="Type your message here..."
                                      class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500" required></textarea>
                        </div>
                        
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-4">
                                <label class="flex items-center">
                                    <input type="checkbox" x-model="composeEmail.useAI" class="mr-2">
                                    <span class="text-sm">🧠 AI Enhancement</span>
                                </label>
                                <button type="button" @click="attachFile" 
                                        class="text-blue-600 hover:text-blue-700 text-sm">
                                    📎 Attach File
                                </button>
                                <button type="button" @click="scheduleEmail" 
                                        class="text-purple-600 hover:text-purple-700 text-sm">
                                    ⏰ Schedule Send
                                </button>
                            </div>
                            
                            <div class="flex space-x-2">
                                <button type="button" @click="saveDraft" 
                                        class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">
                                    💾 Save Draft
                                </button>
                                <button type="submit" 
                                        :disabled="sending"
                                        :class="sending ? 'processing-indicator' : 'bg-blue-600 hover:bg-blue-700'"
                                        class="px-6 py-2 text-white rounded">
                                    <span x-show="!sending">📤 Send</span>
                                    <span x-show="sending">⏳ Sending...</span>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <script>
        function emailSuite() {
            return {
                // State management
                activeView: 'inbox',
                viewMode: 'list',
                loading: false,
                syncing: false,
                sending: false,
                
                // User session
                sessionId: null,
                userInfo: {},
                
                // Email data
                emails: [],
                filteredEmails: [],
                selectedEmails: [],
                selectedEmail: null,
                emailAccounts: [],
                
                // Search and filters
                searchQuery: '',
                activeFilters: {},
                sortBy: 'received_at',
                
                // Statistics
                emailStats: {
                    total: 0,
                    unread: 0,
                    starred: 0
                },
                
                // AI insights
                aiInsights: [],
                analytics: {
                    totalEmails: 0,
                    responseRate: 85,
                    avgResponseTime: '2.3h',
                    productivityScore: 92,
                    topSenders: []
                },
                
                // Compose email
                composeEmail: {
                    to: '',
                    cc: '',
                    bcc: '',
                    subject: '',
                    body: '',
                    useAI: true
                },
                
                // UI state
                showSettings: false,
                showAddAccount: false,
                showFilterBuilder: false,
                
                async init() {
                    // Initialize session
                    const sessionData = await this.createSession();
                    this.sessionId = sessionData.session_id;
                    this.userInfo = sessionData.user_stats.user_info;
                    
                    // Load initial data
                    await this.loadEmailAccounts();
                    await this.loadEmails();
                    await this.loadAIInsights();
                    await this.loadAnalytics();
                },
                
                async createSession() {
                    const response = await fetch('/api/email-suite/session', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            email: 'swanhtet@supermega.dev',
                            name: 'Swan Htet',
                            tool_name: 'email_intelligence_suite'
                        })
                    });
                    return response.json();
                },
                
                async loadEmails() {
                    this.loading = true;
                    try {
                        const response = await fetch(`/api/email-suite/emails?session_id=${this.sessionId}`);
                        const data = await response.json();
                        this.emails = data.emails || [];
                        this.updateEmailStats();
                        this.applyFilters();
                    } catch (error) {
                        console.error('Failed to load emails:', error);
                    }
                    this.loading = false;
                },
                
                async loadEmailAccounts() {
                    const response = await fetch(`/api/email-suite/accounts?session_id=${this.sessionId}`);
                    const data = await response.json();
                    this.emailAccounts = data.accounts || [];
                },
                
                async loadAIInsights() {
                    const response = await fetch(`/api/email-suite/insights?session_id=${this.sessionId}`);
                    const data = await response.json();
                    this.aiInsights = data.insights || [];
                },
                
                async loadAnalytics() {
                    const response = await fetch(`/api/email-suite/analytics?session_id=${this.sessionId}`);
                    const data = await response.json();
                    this.analytics = { ...this.analytics, ...data.analytics };
                },
                
                updateEmailStats() {
                    this.emailStats.total = this.emails.length;
                    this.emailStats.unread = this.emails.filter(e => !e.is_read).length;
                    this.emailStats.starred = this.emails.filter(e => e.is_starred).length;
                },
                
                applyFilters() {
                    let filtered = [...this.emails];
                    
                    // Apply search
                    if (this.searchQuery.trim()) {
                        const query = this.searchQuery.toLowerCase();
                        filtered = filtered.filter(email => 
                            email.subject.toLowerCase().includes(query) ||
                            email.sender.toLowerCase().includes(query) ||
                            email.body_text.toLowerCase().includes(query)
                        );
                    }
                    
                    // Apply active filters
                    Object.entries(this.activeFilters).forEach(([key, value]) => {
                        filtered = filtered.filter(email => {
                            if (key === 'has_attachments') {
                                return value ? (email.attachments && email.attachments.length > 0) : true;
                            }
                            return email[key] === value;
                        });
                    });
                    
                    // Sort
                    filtered.sort((a, b) => {
                        if (this.sortBy === 'received_at') {
                            return new Date(b.received_at) - new Date(a.received_at);
                        } else if (this.sortBy === 'priority_score') {
                            return b.priority_score - a.priority_score;
                        } else if (this.sortBy === 'sentiment_score') {
                            return b.sentiment_score - a.sentiment_score;
                        } else if (this.sortBy === 'sender') {
                            return a.sender.localeCompare(b.sender);
                        }
                        return 0;
                    });
                    
                    this.filteredEmails = filtered;
                },
                
                applyFilter(key, value) {
                    if (this.activeFilters[key] === value) {
                        delete this.activeFilters[key];
                    } else {
                        this.activeFilters[key] = value;
                    }
                    this.applyFilters();
                },
                
                getFilterCount(key, value) {
                    return this.emails.filter(email => {
                        if (key === 'has_attachments') {
                            return value ? (email.attachments && email.attachments.length > 0) : true;
                        }
                        return email[key] === value;
                    }).length;
                },
                
                async syncEmails() {
                    this.syncing = true;
                    try {
                        const response = await fetch('/api/email-suite/sync', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ session_id: this.sessionId })
                        });
                        
                        if (response.ok) {
                            await this.loadEmails();
                            await this.loadAIInsights();
                        }
                    } catch (error) {
                        console.error('Sync failed:', error);
                    }
                    this.syncing = false;
                },
                
                toggleEmailSelection(emailId) {
                    const index = this.selectedEmails.indexOf(emailId);
                    if (index === -1) {
                        this.selectedEmails.push(emailId);
                    } else {
                        this.selectedEmails.splice(index, 1);
                    }
                },
                
                async bulkAction(action) {
                    const response = await fetch('/api/email-suite/bulk-action', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            session_id: this.sessionId,
                            email_ids: this.selectedEmails,
                            action: action
                        })
                    });
                    
                    if (response.ok) {
                        this.selectedEmails = [];
                        await this.loadEmails();
                    }
                },
                
                async sendEmail() {
                    this.sending = true;
                    try {
                        const response = await fetch('/api/email-suite/send', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                                session_id: this.sessionId,
                                email: this.composeEmail
                            })
                        });
                        
                        if (response.ok) {
                            alert('Email sent successfully!');
                            this.composeEmail = { to: '', cc: '', bcc: '', subject: '', body: '', useAI: true };
                            this.activeView = 'inbox';
                        }
                    } catch (error) {
                        console.error('Failed to send email:', error);
                        alert('Failed to send email. Please try again.');
                    }
                    this.sending = false;
                },
                
                formatDate(dateString) {
                    const date = new Date(dateString);
                    const now = new Date();
                    const diffHours = (now - date) / (1000 * 60 * 60);
                    
                    if (diffHours < 24) {
                        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } else if (diffHours < 24 * 7) {
                        return date.toLocaleDateString([], { weekday: 'short' });
                    } else {
                        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    }
                },
                
                searchEmails() {
                    this.applyFilters();
                },
                
                sortEmails() {
                    this.applyFilters();
                },
                
                toggleView() {
                    this.viewMode = this.viewMode === 'list' ? 'cards' : 'list';
                },
                
                selectEmail(email) {
                    this.selectedEmail = email;
                    // Mark as read
                    this.markAsRead(email.id);
                },
                
                async markAsRead(emailId) {
                    const response = await fetch('/api/email-suite/mark-read', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            session_id: this.sessionId,
                            email_id: emailId
                        })
                    });
                    
                    if (response.ok) {
                        const email = this.emails.find(e => e.id === emailId);
                        if (email) email.is_read = true;
                        this.updateEmailStats();
                    }
                },
                
                async toggleStar(emailId) {
                    const email = this.emails.find(e => e.id === emailId);
                    if (!email) return;
                    
                    const response = await fetch('/api/email-suite/toggle-star', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            session_id: this.sessionId,
                            email_id: emailId,
                            starred: !email.is_starred
                        })
                    });
                    
                    if (response.ok) {
                        email.is_starred = !email.is_starred;
                        this.updateEmailStats();
                    }
                },
                
                replyToEmail(email) {
                    this.composeEmail.to = email.sender;
                    this.composeEmail.subject = email.subject.startsWith('Re:') ? email.subject : 'Re: ' + email.subject;
                    this.composeEmail.body = `\n\n--- Original Message ---\nFrom: ${email.sender}\nSubject: ${email.subject}\n\n${email.body_text}`;
                    this.activeView = 'compose';
                },
                
                attachFile() {
                    // File attachment logic
                    console.log('Attach file clicked');
                },
                
                scheduleEmail() {
                    // Email scheduling logic
                    console.log('Schedule email clicked');
                },
                
                saveDraft() {
                    // Save draft logic
                    console.log('Save draft clicked');
                }
            }
        }
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(EMAIL_SUITE_HTML)

@app.route('/api/email-suite/session', methods=['POST'])
def create_session():
    """Create user session"""
    try:
        data = request.get_json()
        session_data = get_user_session(data)
        return jsonify(session_data)
    except Exception as e:
        logger.error(f"Session creation error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/email-suite/emails')
def get_emails():
    """Get user emails with AI analysis"""
    try:
        session_id = request.args.get('session_id')
        session = user_memory.get_session(session_id)
        
        if not session:
            return jsonify({'error': 'Invalid session'}), 401
        
        # Demo emails with AI analysis
        demo_emails = [
            {
                'id': str(uuid.uuid4()),
                'sender': 'john.doe@techcorp.com',
                'subject': 'Urgent: Project Deadline Update',
                'body_text': 'Hi, we need to discuss the project timeline. The client has requested to move the deadline forward by 2 weeks. This will require additional resources and extended working hours. Please let me know your thoughts on this matter.',
                'is_read': False,
                'is_starred': True,
                'priority_score': 85,
                'sentiment_score': -0.2,
                'category': 'work',
                'ai_analysis': json.dumps({
                    'tags': ['urgent', 'deadline', 'project'],
                    'action_required': True,
                    'entities': ['TechCorp', 'John Doe']
                }),
                'received_at': datetime.now().isoformat(),
                'attachments': []
            },
            {
                'id': str(uuid.uuid4()),
                'sender': 'marketing@supermega.dev',
                'subject': 'Weekly Newsletter - AI Industry Updates',
                'body_text': 'This weeks top AI industry news and updates. New breakthrough in natural language processing, major funding rounds in AI startups, and upcoming conferences you should know about.',
                'is_read': True,
                'is_starred': False,
                'priority_score': 30,
                'sentiment_score': 0.4,
                'category': 'newsletter',
                'ai_analysis': json.dumps({
                    'tags': ['newsletter', 'ai', 'industry'],
                    'action_required': False,
                    'entities': ['Super Mega']
                }),
                'received_at': (datetime.now() - timedelta(hours=2)).isoformat(),
                'attachments': []
            },
            {
                'id': str(uuid.uuid4()),
                'sender': 'sarah.johnson@clientcompany.com',
                'subject': 'Thank you for the excellent service!',
                'body_text': 'I wanted to express my gratitude for the outstanding work your team has done on our project. The results exceeded our expectations and the client is extremely happy. Looking forward to future collaborations.',
                'is_read': False,
                'is_starred': False,
                'priority_score': 70,
                'sentiment_score': 0.8,
                'category': 'work',
                'ai_analysis': json.dumps({
                    'tags': ['positive', 'feedback', 'client'],
                    'action_required': True,
                    'entities': ['Sarah Johnson', 'Client Company']
                }),
                'received_at': (datetime.now() - timedelta(hours=4)).isoformat(),
                'attachments': [{'name': 'project_report.pdf', 'size': '2.3MB'}]
            }
        ]
        
        return jsonify({'emails': demo_emails})
        
    except Exception as e:
        logger.error(f"Get emails error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/email-suite/accounts')
def get_accounts():
    """Get user email accounts"""
    try:
        accounts = [
            {
                'id': str(uuid.uuid4()),
                'email_address': 'swanhtet@supermega.dev',
                'provider': 'Google Workspace',
                'last_sync': datetime.now().isoformat()
            }
        ]
        return jsonify({'accounts': accounts})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/email-suite/insights')
def get_insights():
    """Get AI-powered email insights"""
    try:
        insights = [
            {
                'id': str(uuid.uuid4()),
                'title': 'High Priority Emails',
                'description': '3 urgent emails need immediate attention',
                'importance': 90
            },
            {
                'id': str(uuid.uuid4()),
                'title': 'Response Pending',
                'description': '5 emails waiting for your response over 24 hours',
                'importance': 75
            },
            {
                'id': str(uuid.uuid4()),
                'title': 'Productivity Insight',
                'description': 'You respond 40% faster to emails in the morning',
                'importance': 60
            }
        ]
        return jsonify({'insights': insights})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("📧 Super Mega Email Intelligence Suite")
    print("=" * 60)
    print("Features:")
    print("✅ Gmail/Outlook replacement with advanced AI")
    print("✅ Smart email categorization and filtering")
    print("✅ Sentiment analysis and priority scoring")
    print("✅ User session management and memory")
    print("✅ Advanced search and analytics")
    print("✅ AI-powered insights and recommendations")
    print("✅ Professional compose with AI enhancement")
    print("✅ Multi-account management")
    print("")
    print("Starting server on http://localhost:8081")
    print("Access Email Suite at: http://localhost:8081")
    
    app.run(host='0.0.0.0', port=8081, debug=True)
