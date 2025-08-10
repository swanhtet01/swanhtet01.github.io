// Dashboard JavaScript
const API_ENDPOINT = 'https://swanhtet01.github.io/api';

async function updateDevTeamStatus() {
    try {
        const response = await fetch(`${API_ENDPOINT}/dev-team/status`);
        const data = await response.json();
        const statusDiv = document.getElementById('devTeamStatus');
        statusDiv.innerHTML = `
            <div class="list-group">
                ${Object.entries(data).map(([agent, status]) => `
                    <div class="list-group-item">
                        <h6>${agent}</h6>
                        <span class="badge ${status.active ? 'bg-success' : 'bg-danger'}">${status.active ? 'Active' : 'Inactive'}</span>
                        <p class="mb-0 small">${status.currentTask || 'No active task'}</p>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error updating dev team status:', error);
    }
}

async function updateProductsStatus() {
    try {
        const response = await fetch(`${API_ENDPOINT}/products/status`);
        const data = await response.json();
        const statusDiv = document.getElementById('productsStatus');
        statusDiv.innerHTML = `
            <div class="list-group">
                ${Object.entries(data).map(([product, info]) => `
                    <div class="list-group-item">
                        <h6>${product}</h6>
                        <span class="badge ${info.status === 'online' ? 'bg-success' : 'bg-danger'}">${info.status}</span>
                        <p class="mb-0 small">Version: ${info.version}</p>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error updating products status:', error);
    }
}

async function updateSystemMetrics() {
    try {
        const response = await fetch(`${API_ENDPOINT}/system/metrics`);
        const data = await response.json();
        const metricsDiv = document.getElementById('systemMetrics');
        metricsDiv.innerHTML = `
            <div class="row">
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h6>CPU Usage</h6>
                            <h3>${data.cpu}%</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h6>Memory Usage</h6>
                            <h3>${data.memory}%</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h6>Disk Usage</h6>
                            <h3>${data.disk}%</h3>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error updating system metrics:', error);
    }
}

// Update every 5 seconds
setInterval(() => {
    updateDevTeamStatus();
    updateProductsStatus();
    updateSystemMetrics();
}, 5000);

// Initial update
updateDevTeamStatus();
updateProductsStatus();
updateSystemMetrics();
