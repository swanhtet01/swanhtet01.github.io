// Real-time team activity monitoring
class TeamMonitor {
    constructor() {
        this.agents = {
            dev1: { tasks: [], role: 'Lead Developer' },
            dev2: { tasks: [], role: 'Full Stack Developer' },
            dev3: { tasks: [], role: 'DevOps Engineer' },
            dev4: { tasks: [], role: 'Frontend Developer' }
        };
        this.metrics = {
            tasksCompleted: 0,
            systemLoad: 0,
            memoryUsage: 0,
            uptime: 0
        };
        this.startMonitoring();
    }

    startMonitoring() {
        // Simulate real-time updates
        setInterval(() => this.updateAgentStatus(), 5000);
        setInterval(() => this.updateMetrics(), 2000);
    }

    updateAgentStatus() {
        const tasks = [
            'Analyzing code quality',
            'Optimizing database queries',
            'Deploying to cloud',
            'Building UI components',
            'Running tests',
            'Reviewing pull requests',
            'Monitoring system health',
            'Updating documentation'
        ];

        Object.keys(this.agents).forEach(agentId => {
            if (Math.random() > 0.7) {
                const task = tasks[Math.floor(Math.random() * tasks.length)];
                this.addTask(agentId, task);
                setTimeout(() => this.completeTask(agentId), Math.random() * 10000 + 5000);
            }
        });
    }

    addTask(agentId, task) {
        const taskElement = document.createElement('div');
        taskElement.className = 'task-item';
        taskElement.textContent = task;
        taskElement.id = `task-${Date.now()}`;
        document.querySelector(`#${agentId} .tasks`).appendChild(taskElement);
    }

    completeTask(agentId) {
        const tasks = document.querySelector(`#${agentId} .tasks`);
        if (tasks.firstChild) {
            tasks.removeChild(tasks.firstChild);
            this.metrics.tasksCompleted++;
        }
    }

    updateMetrics() {
        this.metrics.systemLoad = Math.floor(Math.random() * 100);
        this.metrics.memoryUsage = Math.floor(Math.random() * 100);
        this.metrics.uptime++;

        const metricsDisplay = document.getElementById('metrics-display');
        metricsDisplay.innerHTML = `
            <div>Tasks Completed: ${this.metrics.tasksCompleted}</div>
            <div>System Load: ${this.metrics.systemLoad}%</div>
            <div>Memory Usage: ${this.metrics.memoryUsage}%</div>
            <div>Uptime: ${this.metrics.uptime}s</div>
        `;
    }
}

// Initialize monitoring
document.addEventListener('DOMContentLoaded', () => {
    window.teamMonitor = new TeamMonitor();
});
