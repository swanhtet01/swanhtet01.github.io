// Super Mega AI Platform JavaScript

// Global state management
const AppState = {
    user: null,
    agents: [],
    tasks: [],
    notifications: []
};

// Utility functions
const Utils = {
    // Format currency
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    },

    // Format date
    formatDate: (date) => {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date));
    },

    // Show notification
    showNotification: (message, type = 'success') => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;
        
        document.getElementById('notifications')?.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    },

    // Loading state
    setLoading: (element, isLoading) => {
        if (isLoading) {
            element.disabled = true;
            element.innerHTML = '<span class="loading"></span> Loading...';
        } else {
            element.disabled = false;
            element.innerHTML = element.getAttribute('data-original-text') || 'Submit';
        }
    }
};

// Email extraction functionality
const EmailExtractor = {
    extract: async (domain) => {
        const button = document.getElementById('extract-btn');
        const resultsDiv = document.getElementById('email-results');
        
        if (!button || !resultsDiv) return;
        
        Utils.setLoading(button, true);
        resultsDiv.innerHTML = '<div class="loading"></div>';
        
        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const mockEmails = [
                'ceo@' + domain,
                'sales@' + domain,
                'info@' + domain,
                'support@' + domain,
                'marketing@' + domain
            ];
            
            resultsDiv.innerHTML = `
                <h3>Found ${mockEmails.length} emails for ${domain}:</h3>
                <ul class="email-list">
                    ${mockEmails.map(email => `<li>${email}</li>`).join('')}
                </ul>
            `;
            
            Utils.showNotification(`Successfully extracted ${mockEmails.length} emails from ${domain}`);
        } catch (error) {
            resultsDiv.innerHTML = '<p class="error">Error extracting emails. Please try again.</p>';
            Utils.showNotification('Error extracting emails', 'error');
        } finally {
            Utils.setLoading(button, false);
        }
    }
};

// AI Content Generator
const ContentGenerator = {
    generate: async (prompt) => {
        const button = document.getElementById('generate-btn');
        const resultsDiv = document.getElementById('content-results');
        
        if (!button || !resultsDiv) return;
        
        Utils.setLoading(button, true);
        resultsDiv.innerHTML = '<div class="loading"></div>';
        
        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const mockContent = `
                Subject: Revolutionize Your Business with AI Automation
                
                Hi [Name],
                
                I noticed your company is looking to scale operations efficiently. Our AI platform has helped similar businesses increase productivity by 300% while reducing costs.
                
                Would you be interested in a 15-minute demo to see how we can:
                • Automate lead generation
                • Create personalized content at scale  
                • Analyze competitor strategies
                
                Best regards,
                AI Assistant
            `;
            
            resultsDiv.innerHTML = `
                <h3>Generated Content:</h3>
                <div class="generated-content">
                    <pre>${mockContent}</pre>
                </div>
            `;
            
            Utils.showNotification('Content generated successfully!');
        } catch (error) {
            resultsDiv.innerHTML = '<p class="error">Error generating content. Please try again.</p>';
            Utils.showNotification('Error generating content', 'error');
        } finally {
            Utils.setLoading(button, false);
        }
    }
};

// Dashboard functionality
const Dashboard = {
    init: () => {
        Dashboard.updateStats();
        Dashboard.loadCharts();
        Dashboard.loadRecentActivity();
    },

    updateStats: () => {
        // Update dashboard statistics
        const stats = {
            totalAgents: 12,
            activeTasks: 48,
            completedTasks: 1247,
            revenue: 45600
        };

        document.getElementById('total-agents')?.textContent = stats.totalAgents;
        document.getElementById('active-tasks')?.textContent = stats.activeTasks;
        document.getElementById('completed-tasks')?.textContent = stats.completedTasks.toLocaleString();
        document.getElementById('total-revenue')?.textContent = Utils.formatCurrency(stats.revenue);
    },

    loadCharts: () => {
        // Load Plotly charts if available
        if (typeof Plotly !== 'undefined') {
            // Performance chart
            const performanceData = [{
                x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                y: [12, 19, 3, 5, 2, 3, 9],
                type: 'scatter',
                mode: 'lines+markers',
                marker: {color: '#3b82f6'}
            }];

            Plotly.newPlot('performance-chart', performanceData, {
                title: 'Agent Performance This Week',
                xaxis: { title: 'Day' },
                yaxis: { title: 'Tasks Completed' }
            });

            // Revenue chart
            const revenueData = [{
                x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                y: [4000, 3000, 5000, 4500, 6000, 5500],
                type: 'bar',
                marker: {color: '#8b5cf6'}
            }];

            Plotly.newPlot('revenue-chart', revenueData, {
                title: 'Monthly Revenue',
                xaxis: { title: 'Month' },
                yaxis: { title: 'Revenue ($)' }
            });
        }
    },

    loadRecentActivity: () => {
        const activities = [
            'Email extraction completed for tech-startup.com',
            'AI content generated for LinkedIn campaign',
            'Competitor analysis finished for 3 companies',
            'Lead scoring updated for 150 prospects',
            'Social media posts scheduled for next week'
        ];

        const activityList = document.getElementById('recent-activity');
        if (activityList) {
            activityList.innerHTML = activities.map(activity => 
                `<li class="activity-item">${activity}</li>`
            ).join('');
        }
    }
};

// Agent management
const AgentManager = {
    createAgent: async (agentData) => {
        try {
            // Simulate agent creation
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const newAgent = {
                id: Date.now(),
                name: agentData.name,
                type: agentData.type,
                status: 'active',
                created: new Date()
            };
            
            AppState.agents.push(newAgent);
            AgentManager.renderAgents();
            
            Utils.showNotification(`Agent "${newAgent.name}" created successfully!`);
        } catch (error) {
            Utils.showNotification('Error creating agent', 'error');
        }
    },

    renderAgents: () => {
        const agentsList = document.getElementById('agents-list');
        if (!agentsList) return;

        agentsList.innerHTML = AppState.agents.map(agent => `
            <div class="agent-card">
                <h3>${agent.name}</h3>
                <p>Type: ${agent.type}</p>
                <p>Status: <span class="status ${agent.status}">${agent.status}</span></p>
                <p>Created: ${Utils.formatDate(agent.created)}</p>
                <div class="agent-actions">
                    <button onclick="AgentManager.pauseAgent(${agent.id})" class="btn btn-secondary">Pause</button>
                    <button onclick="AgentManager.deleteAgent(${agent.id})" class="btn btn-danger">Delete</button>
                </div>
            </div>
        `).join('');
    },

    pauseAgent: (agentId) => {
        const agent = AppState.agents.find(a => a.id === agentId);
        if (agent) {
            agent.status = agent.status === 'active' ? 'paused' : 'active';
            AgentManager.renderAgents();
            Utils.showNotification(`Agent ${agent.status === 'active' ? 'resumed' : 'paused'}`);
        }
    },

    deleteAgent: (agentId) => {
        if (confirm('Are you sure you want to delete this agent?')) {
            AppState.agents = AppState.agents.filter(a => a.id !== agentId);
            AgentManager.renderAgents();
            Utils.showNotification('Agent deleted successfully');
        }
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize dashboard if on dashboard page
    if (window.location.pathname.includes('dashboard')) {
        Dashboard.init();
    }

    // Add event listeners for forms
    const extractForm = document.getElementById('extract-form');
    if (extractForm) {
        extractForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const domain = document.getElementById('domain-input').value.trim();
            if (domain) {
                EmailExtractor.extract(domain);
            }
        });
    }

    const contentForm = document.getElementById('content-form');
    if (contentForm) {
        contentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const prompt = document.getElementById('content-prompt').value.trim();
            if (prompt) {
                ContentGenerator.generate(prompt);
            }
        });
    }

    // Add smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Initialize tooltips if available
    if (typeof bootstrap !== 'undefined') {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    }

    Utils.showNotification('Platform loaded successfully!');
});

// Export for global access
window.SuperMegaAI = {
    Utils,
    EmailExtractor,
    ContentGenerator,
    Dashboard,
    AgentManager,
    AppState
};
