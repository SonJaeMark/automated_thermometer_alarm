let ws; // WebSocket connection
let buzzerActive = false;
let buzzerInterval = null; // new variable for continuous alarm


// Configuration object
const defaultConfig = {
    app_title: "ESP32 Chemical Sensor Dashboard",
    dashboard_title: "Dashboard",
    database_title: "Chemical Database", 
    about_title: "About"
};

// Global variables
let temperatureChart;
let isRecording = false;
let temperatureData = [];
let currentThreshold = 100.0;
let editingChemical = null;
let chemicals = [];
let recordCount = 0;
let isConnected = false;
let isConnecting = false;

// Data SDK handler
const dataHandler = {
    onDataChanged(data) {
        chemicals = data;
        renderChemicalsTable();
        recordCount = data.length;
    }
};

// Element SDK implementation
async function onConfigChange(config) {
    const appTitle = config.app_title || defaultConfig.app_title;
    const dashboardTitle = config.dashboard_title || defaultConfig.dashboard_title;
    const databaseTitle = config.database_title || defaultConfig.database_title;
    const aboutTitle = config.about_title || defaultConfig.about_title;

    document.getElementById('app-title').textContent = appTitle;
    document.getElementById('dashboard-tab').textContent = dashboardTitle;
    document.getElementById('database-tab').textContent = databaseTitle;
    document.getElementById('about-tab').textContent = aboutTitle;
}

function mapToCapabilities(config) {
    return {
        recolorables: [],
        borderables: [],
        fontEditable: undefined,
        fontSizeable: undefined
    };
}

function mapToEditPanelValues(config) {
    return new Map([
        ["app_title", config.app_title || defaultConfig.app_title],
        ["dashboard_title", config.dashboard_title || defaultConfig.dashboard_title],
        ["database_title", config.database_title || defaultConfig.database_title],
        ["about_title", config.about_title || defaultConfig.about_title]
    ]);
}

// Initialize application
async function initApp() {
    // Initialize Data SDK
    if (window.dataSdk) {
        const initResult = await window.dataSdk.init(dataHandler);
        if (!initResult.isOk) {
            console.error("Failed to initialize data SDK");
        }
    }

    // Initialize Element SDK
    if (window.elementSdk) {
        await window.elementSdk.init({
            defaultConfig,
            onConfigChange,
            mapToCapabilities,
            mapToEditPanelValues
        });
    }

    // Initialize chart
    initChart();
    
    // Initialize connection status
    updateConnectionStatus();
    
    // Start temperature simulation
    startTemperatureSimulation();
}

// Chart initialization
function initChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#60a5fa',
                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                tension: 0.4,
                fill: true,
                borderWidth: 3,
                pointBackgroundColor: '#60a5fa',
                pointBorderColor: '#1e40af',
                pointBorderWidth: 2,
                pointRadius: 4
            }, {
                label: 'Threshold',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'transparent',
                borderDash: [8, 4],
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#e2e8f0',
                        font: {
                            size: 14,
                            weight: '600'
                        },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Temperature (°C)',
                        color: '#e2e8f0',
                        font: {
                            size: 14,
                            weight: '600'
                        }
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            size: 12
                        }
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.2)',
                        borderColor: 'rgba(148, 163, 184, 0.3)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time',
                        color: '#e2e8f0',
                        font: {
                            size: 14,
                            weight: '600'
                        }
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            size: 12
                        }
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.2)',
                        borderColor: 'rgba(148, 163, 184, 0.3)'
                    }
                }
            }
        }
    });
}

// --- Buzzer sound alert ---
function playBuzzer() {
    if (buzzerInterval) return; // already buzzing

    buzzerInterval = setInterval(() => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);

            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
                audioCtx.close();
            }, 500); // beep duration 0.5s
        } catch (err) {
            console.warn("Buzzer error:", err);
        }
    }, 1000); // repeat every 1 second
}

function stopBuzzer() {
    if (buzzerInterval) {
        clearInterval(buzzerInterval);
        buzzerInterval = null;
    }
}



// Temperature simulation
function startTemperatureSimulation() {
    // ❌ Disable fake simulation
    console.log("Waiting for ESP32 data...");
}

// Handle real ESP32 temperature updates
function handleESP32Data(data) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString();
    const currentTemp = data.temperature;

    document.getElementById('current-temp').textContent = currentTemp.toFixed(1) + '°C';

    if (isRecording) {
        temperatureChart.data.labels.push(timeLabel);
        temperatureChart.data.datasets[0].data.push(currentTemp);
        temperatureChart.data.datasets[1].data.push(currentThreshold);

        // 🔔 Check threshold and trigger buzzer
        if (currentTemp >= currentThreshold && !buzzerActive) {
            buzzerActive = true;
            playBuzzer();
            showToast('⚠️ Temperature threshold reached!', 'error');
        } else if (currentTemp < currentThreshold && buzzerActive) {
            buzzerActive = false;
            stopBuzzer();
        }


        if (temperatureChart.data.labels.length > 20) {
            temperatureChart.data.labels.shift();
            temperatureChart.data.datasets[0].data.shift();
            temperatureChart.data.datasets[1].data.shift();
        }

        temperatureChart.update('none');

        temperatureData.push({
            time: now.toISOString(),
            temperature: currentTemp,
            threshold: currentThreshold
        });
    }
}


// Navigation functions
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected page and activate tab
    document.getElementById(pageId).classList.add('active');
    document.querySelector(`[onclick="showPage('${pageId}')"]`).classList.add('active');
}

// Connection functions
function updateConnectionStatus() {
    const indicator = document.getElementById('connection-indicator');
    const text = document.getElementById('connection-text');
    const btn = document.getElementById('connect-btn');
    
    if (isConnecting) {
        indicator.className = 'status-indicator status-connecting';
        text.textContent = 'Connecting...';
        btn.textContent = 'Connecting...';
        btn.disabled = true;
    } else if (isConnected) {
        indicator.className = 'status-indicator status-connected';
        text.textContent = 'Connected';
        btn.textContent = 'Disconnect';
        btn.disabled = false;
    } else {
        indicator.className = 'status-indicator status-disconnected';
        text.textContent = 'Disconnected';
        btn.textContent = 'Test Connection';
        btn.disabled = false;
    }
}

async function toggleConnection() {
    if (isConnected) {
        // Disconnect
        if (ws) ws.close();
        isConnected = false;
        updateConnectionStatus();
        showToast('Disconnected from ESP32', 'info');
    } else {
        // Connect to ESP32 WebSocket
        const esp32IP = "192.168.1.200"; // ⬅️ CHANGE THIS to your ESP32’s IP
        const wsUrl = `ws://${esp32IP}/ws`;
        isConnecting = true;
        updateConnectionStatus();

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                isConnecting = false;
                isConnected = true;
                updateConnectionStatus();
                showToast('✅ Connected to ESP32!', 'success');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Example: { temperature: 26.5, time: "2025-10-27T12:00:00Z" }
                    handleESP32Data(data);
                } catch (err) {
                    console.error("Invalid data from ESP32:", event.data);
                }
            };

            ws.onclose = () => {
                isConnected = false;
                updateConnectionStatus();
                showToast('🔌 Connection closed', 'warning');
            };

            ws.onerror = (err) => {
                console.error("WebSocket error:", err);
                showToast('⚠️ WebSocket connection failed', 'error');
                isConnecting = false;
                isConnected = false;
                updateConnectionStatus();
            };
        } catch (e) {
            console.error(e);
            showToast('Failed to connect to ESP32', 'error');
            isConnecting = false;
            isConnected = false;
            updateConnectionStatus();
        }
    }
}


// Dashboard functions
function updateThreshold() {
    const input = document.getElementById('threshold-input');
    currentThreshold = parseFloat(input.value);
    document.getElementById('threshold-display').textContent = currentThreshold.toFixed(1) + '°C';
}

function toggleRecording() {
    const btn = document.getElementById('record-btn');
    isRecording = !isRecording;
    
    if (isRecording) {
        btn.textContent = 'Stop Recording';
        btn.className = 'btn btn-danger';
    } else {
        btn.textContent = 'Start Recording';
        btn.className = 'btn btn-success';
    }
}

function clearChart() {
    temperatureChart.data.labels = [];
    temperatureChart.data.datasets[0].data = [];
    temperatureChart.data.datasets[1].data = [];
    temperatureChart.update();
    temperatureData = [];
}

function saveData() {
    if (temperatureData.length === 0) {
        showToast('No data to save. Start recording first.', 'warning');
        return;
    }
    
    showToast(`Saved ${temperatureData.length} temperature readings`, 'success');
}

function exportData() {
    if (temperatureData.length === 0) {
        showToast('No data to export. Start recording first.', 'warning');
        return;
    }
    
    let csv = 'Time,Temperature (°C),Threshold (°C)\n';
    temperatureData.forEach(point => {
        csv += `${point.time},${point.temperature.toFixed(2)},${point.threshold.toFixed(2)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `temperature_data_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showToast('Data exported successfully', 'success');
}

// Database functions
function renderChemicalsTable() {
    const tbody = document.getElementById('chemicals-tbody');
    tbody.innerHTML = '';
    
    if (chemicals.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #718096; padding: 40px;">No chemicals added yet. Click "Add Chemical" to get started.</td></tr>';
        return;
    }
    
    chemicals.forEach(chemical => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${chemical.chemName}</td>
            <td>${chemical.formula}</td>
            <td>${chemical.boilingPoint}°C</td>
            <td>${chemical.freezingPoint}°C</td>
            <td><span class="hazard-${chemical.hazardLevel.toLowerCase()}">${chemical.hazardLevel}</span></td>
            <td>${chemical.notes || '-'}</td>
            <td>
                <button class="btn btn-primary" style="margin-right: 8px; padding: 6px 12px; font-size: 12px;" onclick="editChemical('${chemical.__backendId}')">Edit</button>
                <button class="btn btn-danger" style="padding: 6px 12px; font-size: 12px;" onclick="deleteChemical('${chemical.__backendId}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterTable() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const rows = document.querySelectorAll('#chemicals-tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

function openAddModal() {
    editingChemical = null;
    document.getElementById('modal-title').textContent = 'Add Chemical';
    document.getElementById('chemical-form').reset();
    document.getElementById('chemical-modal').style.display = 'block';
}

function editChemical(id) {
    editingChemical = chemicals.find(c => c.__backendId === id);
    if (!editingChemical) return;
    
    document.getElementById('modal-title').textContent = 'Edit Chemical';
    document.getElementById('chem-name').value = editingChemical.chemName;
    document.getElementById('chem-formula').value = editingChemical.formula;
    document.getElementById('boiling-point').value = editingChemical.boilingPoint;
    document.getElementById('freezing-point').value = editingChemical.freezingPoint;
    document.getElementById('hazard-level').value = editingChemical.hazardLevel;
    document.getElementById('chem-notes').value = editingChemical.notes || '';
    document.getElementById('chemical-modal').style.display = 'block';
}

async function deleteChemical(id) {
    const chemical = chemicals.find(c => c.__backendId === id);
    if (!chemical) return;
    
    // Create inline confirmation
    const row = event.target.closest('tr');
    const deleteBtn = event.target;
    const originalText = deleteBtn.textContent;
    
    deleteBtn.textContent = 'Confirm Delete?';
    deleteBtn.style.background = '#c53030';
    
    // Create cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.marginLeft = '4px';
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.fontSize = '12px';
    
    deleteBtn.parentNode.appendChild(cancelBtn);
    
    // Handle confirmation
    const confirmDelete = async () => {
        if (window.dataSdk) {
            const result = await window.dataSdk.delete(chemical);
            if (result.isOk) {
                showToast('Chemical deleted successfully', 'success');
            } else {
                showToast('Failed to delete chemical', 'error');
            }
        }
        cleanup();
    };
    
    const cleanup = () => {
        deleteBtn.textContent = originalText;
        deleteBtn.style.background = '#e53e3e';
        if (cancelBtn.parentNode) {
            cancelBtn.parentNode.removeChild(cancelBtn);
        }
        deleteBtn.onclick = () => deleteChemical(id);
    };
    
    deleteBtn.onclick = confirmDelete;
    cancelBtn.onclick = cleanup;
    
    // Auto-cancel after 5 seconds
    setTimeout(cleanup, 5000);
}

function closeModal() {
    document.getElementById('chemical-modal').style.display = 'none';
    editingChemical = null;
}

// Form submission
document.getElementById('chemical-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (recordCount >= 999) {
        showToast('Maximum limit of 999 chemicals reached. Please delete some chemicals first.', 'error');
        return;
    }
    
    const formData = {
        id: editingChemical ? editingChemical.id : Date.now().toString(),
        chemName: document.getElementById('chem-name').value,
        formula: document.getElementById('chem-formula').value,
        boilingPoint: parseFloat(document.getElementById('boiling-point').value),
        freezingPoint: parseFloat(document.getElementById('freezing-point').value),
        hazardLevel: document.getElementById('hazard-level').value,
        notes: document.getElementById('chem-notes').value
    };
    
    if (window.dataSdk) {
        let result;
        if (editingChemical) {
            result = await window.dataSdk.update({ ...formData, __backendId: editingChemical.__backendId });
        } else {
            result = await window.dataSdk.create(formData);
        }
        
        if (result.isOk) {
            showToast(editingChemical ? 'Chemical updated successfully' : 'Chemical added successfully', 'success');
            closeModal();
        } else {
            showToast('Failed to save chemical', 'error');
        }
    }
});

// Toast notification function
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    const colors = {
        success: '#38a169',
        error: '#e53e3e',
        warning: '#d69e2e',
        info: '#4299e1'
    };
    
    toast.style.background = colors[type] || colors.info;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('chemical-modal');
    if (event.target === modal) {
        closeModal();
    }
};

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', initApp);
