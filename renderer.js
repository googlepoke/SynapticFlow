const { ipcRenderer } = require('electron');

// DOM elements
const statusText = document.getElementById('statusText');
const statusIndicator = document.getElementById('statusIndicator');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const testApiKeyBtn = document.getElementById('testApiKey');
const apiStatus = document.getElementById('apiStatus');
const templateSelect = document.getElementById('templateSelect');
const instructionInput = document.getElementById('instructionInput');
const transcriptDisplay = document.getElementById('transcriptDisplay');
const responseDisplay = document.getElementById('responseDisplay');
const modelSelect = document.getElementById('modelSelect');
const temperatureSlider = document.getElementById('temperatureSlider');
const temperatureValue = document.getElementById('temperatureValue');
const maxTokensInput = document.getElementById('maxTokensInput');
const testInjectionBtn = document.getElementById('testInjection');
const clearTranscriptBtn = document.getElementById('clearTranscript');
const recordingIndicator = document.getElementById('recordingIndicator');

// Prompt templates
const promptTemplates = {
    'rewrite': 'Please rewrite the following transcript in a clear and professional manner:',
    'summarize': 'Please provide a concise summary of the following transcript:',
    'translate': 'Please translate the following transcript to English (if not already in English):',
    'expand': 'Please expand on the ideas mentioned in the following transcript:',
    'simplify': 'Please simplify and clarify the following transcript:',
    'formal': 'Please convert the following transcript into formal business language:',
    'casual': 'Please convert the following transcript into casual, conversational language:',
    'bullet': 'Please convert the following transcript into bullet points:',
    'question': 'Please generate questions based on the following transcript:',
    'action': 'Please extract action items from the following transcript:'
};

// Initialize the application
async function initializeApp() {
    // console.log('=== INITIALIZING APP ===');
    // console.log('DOM ready, elements found:', {
    //     statusText: !!statusText,
    //     statusIndicator: !!statusIndicator,
    //     recordingIndicator: !!recordingIndicator,
    //     transcriptDisplay: !!transcriptDisplay,
    //     responseDisplay: !!responseDisplay,
    //     apiKeyInput: !!apiKeyInput,
    //     saveApiKeyBtn: !!saveApiKeyBtn,
    //     testApiKeyBtn: !!testApiKeyBtn,
    //     testInjectionBtn: !!testInjectionBtn
    // });
    
    // Show initial status
    showStatus('Ready - Optimized for fast transcription ⚡ (Window is resizable)');
    
    // Check microphone permissions
    try {
        if (navigator.permissions) {
            const micPermission = await navigator.permissions.query({ name: 'microphone' });
            // console.log('Microphone permission status:', micPermission.state);
            
            micPermission.onchange = () => {
                // console.log('Microphone permission changed to:', micPermission.state);
            };
        }
    } catch (error) {
        // console.log('Could not check microphone permissions:', error.message);
    }
    
    // Load saved API key
    const savedApiKey = await ipcRenderer.invoke('get-api-key');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        showApiStatus('API key loaded', 'success');
        // console.log('API key loaded successfully');
    }
    
    // Load saved settings
    loadSettings();
    
    // Setup event listeners for the API configuration
    saveApiKeyBtn.addEventListener('click', saveSettings);
    testApiKeyBtn.addEventListener('click', testApiKey);
    testInjectionBtn.addEventListener('click', testInjection);
    clearTranscriptBtn.addEventListener('click', clearTranscript);
    
    // Setup template selection
    templateSelect.addEventListener('change', (e) => {
        const selectedTemplate = templates[e.target.value];
        if (selectedTemplate) {
            instructionInput.value = selectedTemplate.text;
            // Save to localStorage
            localStorage.setItem('lastInstruction', selectedTemplate.text);
        }
    });
    
    // console.log('=== APP INITIALIZATION COMPLETE ===');
    // console.log('IPC available:', !!ipcRenderer);
    // console.log('MediaDevices available:', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
}

// Event listeners
saveApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        showApiStatus('Please enter an API key', 'error');
        return;
    }

    try {
        await ipcRenderer.invoke('save-api-key', apiKey);
        showApiStatus('API key saved successfully', 'success');
    } catch (error) {
        showApiStatus('Failed to save API key: ' + error.message, 'error');
    }
});

testApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        showApiStatus('Please enter an API key first', 'error');
        return;
    }

    showApiStatus('Testing API key...', 'info');
    
    try {
        const result = await ipcRenderer.invoke('test-api-key', apiKey);
        if (result.success) {
            showApiStatus('API key is valid!', 'success');
        } else {
            showApiStatus('API key test failed: ' + result.error, 'error');
        }
    } catch (error) {
        showApiStatus('API test failed: ' + error.message, 'error');
    }
});

templateSelect.addEventListener('change', () => {
    const selectedTemplate = templateSelect.value;
    if (selectedTemplate && promptTemplates[selectedTemplate]) {
        instructionInput.value = promptTemplates[selectedTemplate];
    }
});

temperatureSlider.addEventListener('input', () => {
    temperatureValue.textContent = temperatureSlider.value;
    saveSettings();
});

maxTokensInput.addEventListener('change', saveSettings);
modelSelect.addEventListener('change', saveSettings);

testInjectionBtn.addEventListener('click', async () => {
    try {
        showStatus('Testing injection...', 'testing');
        await ipcRenderer.invoke('test-injection');
        showStatus('Injection test completed', 'done');
        setTimeout(() => showStatus('Ready'), 2000);
    } catch (error) {
        showStatus('Injection test failed: ' + error.message, 'error');
        setTimeout(() => showStatus('Ready'), 3000);
    }
});

clearTranscriptBtn.addEventListener('click', () => {
    transcriptDisplay.innerHTML = '<p class="no-transcript">No transcript yet. Use the hotkey to start recording.</p>';
    responseDisplay.innerHTML = '<p class="no-response">AI response will appear here after processing.</p>';
});

// IPC event listeners
ipcRenderer.on('status-update', (event, status) => {
    showStatus(status);
});

ipcRenderer.on('transcript-update', (event, transcript) => {
    displayTranscript(transcript);
});

ipcRenderer.on('response-update', (event, response) => {
    displayResponse(response);
});

ipcRenderer.on('get-instruction', (event) => {
    const instruction = instructionInput.value.trim();
    ipcRenderer.send('instruction-response', instruction);
});

// Helper functions
function showStatus(status, type = 'ready') {
    // Add visual cues for different states
    if (status.toLowerCase().includes('listening')) {
        statusText.textContent = status + ' - Speak now!';
        statusText.style.color = '#ff3b30';
        statusText.style.fontWeight = 'bold';
        // Show prominent recording indicator
        if (recordingIndicator) {
            recordingIndicator.style.display = 'flex';
        }
    } else if (status.toLowerCase().includes('transcribing')) {
        statusText.textContent = '📝 ' + status;
        statusText.style.color = '#007aff';
        statusText.style.fontWeight = 'normal';
        // Hide recording indicator
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
    } else if (status.toLowerCase().includes('thinking')) {
        statusText.textContent = '🤔 ' + status;
        statusText.style.color = '#28a745';
        statusText.style.fontWeight = 'normal';
        // Hide recording indicator
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
    } else if (status.toLowerCase().includes('done')) {
        statusText.textContent = '✅ ' + status;
        statusText.style.color = '#28a745';
        statusText.style.fontWeight = 'normal';
        // Hide recording indicator
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
    } else if (status.toLowerCase().includes('error')) {
        statusText.textContent = '❌ ' + status;
        statusText.style.color = '#dc3545';
        statusText.style.fontWeight = 'normal';
        // Hide recording indicator
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
    } else {
        statusText.textContent = status;
        statusText.style.color = '#495057';
        statusText.style.fontWeight = 'normal';
        // Hide recording indicator for non-listening states
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
    }
    
    // Remove all status classes
    statusIndicator.classList.remove('listening', 'transcribing', 'thinking', 'done', 'error', 'testing');
    
    // Add appropriate class based on status
    if (status.toLowerCase().includes('listening')) {
        statusIndicator.classList.add('listening');
    } else if (status.toLowerCase().includes('transcribing')) {
        statusIndicator.classList.add('transcribing');
    } else if (status.toLowerCase().includes('thinking')) {
        statusIndicator.classList.add('thinking');
    } else if (status.toLowerCase().includes('done')) {
        statusIndicator.classList.add('done');
    } else if (status.toLowerCase().includes('error')) {
        statusIndicator.classList.add('error');
    } else if (status.toLowerCase().includes('testing')) {
        statusIndicator.classList.add('testing');
    }
}

function showApiStatus(message, type) {
    apiStatus.textContent = message;
    apiStatus.className = `api-status ${type}`;
    apiStatus.style.display = 'block'; // Ensure it's visible
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            apiStatus.style.display = 'none';
            apiStatus.className = 'api-status';
        }, 5000);
    }
}

function displayTranscript(transcript) {
    if (transcript && transcript.trim()) {
        transcriptDisplay.innerHTML = `<div class="transcript-text">${transcript}</div>`;
    } else {
        transcriptDisplay.innerHTML = '<p class="no-transcript">No transcript available</p>';
    }
}

function displayResponse(response) {
    if (response && response.trim()) {
        responseDisplay.innerHTML = `<div class="response-text">${response}</div>`;
    } else {
        responseDisplay.innerHTML = '<p class="no-response">No response available</p>';
    }
}

function saveSettings() {
    const settings = {
        model: modelSelect.value,
        temperature: parseFloat(temperatureSlider.value),
        maxTokens: parseInt(maxTokensInput.value)
    };
    
    localStorage.setItem('voiceToLLMSettings', JSON.stringify(settings));
}

function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('voiceToLLMSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            
            if (settings.model) modelSelect.value = settings.model;
            if (settings.temperature) {
                temperatureSlider.value = settings.temperature;
                temperatureValue.textContent = settings.temperature;
            }
            if (settings.maxTokens) maxTokensInput.value = settings.maxTokens;
        }
    } catch (error) {
        // console.error('Error loading settings:', error);
    }
}

// Audio recording variables
let mediaRecorder = null;
let audioChunks = [];

// IPC listeners for recording
ipcRenderer.on('start-recording', async () => {
    // console.log('=== RENDERER: start-recording IPC message received ===');
    try {
        // console.log('Checking navigator.mediaDevices availability...');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('MediaDevices API not available');
        }
        
        // console.log('Requesting microphone access...');
        
        // Try with audio constraints compatible with MediaRecorder
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    channelCount: 1
                    // Note: sampleRate and sampleSize are not supported by getUserMedia
                } 
            });
        } catch (error) {
            // console.log('Failed with advanced constraints, trying basic audio...');
            // Fallback to basic audio constraints
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true
            });
        }
        // console.log('Microphone access granted, stream tracks:', stream.getTracks().length);
        
        audioChunks = [];
        
        // Try different MIME types for better compatibility - start with most supported formats
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/mp4';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'audio/ogg;codecs=opus';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        mimeType = ''; // Let the browser choose
                    }
                }
            }
        }
        // console.log('Using MIME type:', mimeType);
        
        // Create MediaRecorder with optimized settings
        const options = mimeType ? { mimeType } : {};
        // Add bitrate optimization for faster processing
        if (mimeType.includes('opus')) {
            options.audioBitsPerSecond = 64000; // 64kbps is sufficient for speech
        }
        
        mediaRecorder = new MediaRecorder(stream, options);
        // console.log('MediaRecorder created successfully with MIME type:', mimeType);
        // console.log('MediaRecorder state:', mediaRecorder.state);
        // console.log('MediaRecorder supported formats check:');
        // console.log('- audio/webm;codecs=opus:', MediaRecorder.isTypeSupported('audio/webm;codecs=opus'));
        // console.log('- audio/webm:', MediaRecorder.isTypeSupported('audio/webm'));
        // console.log('- audio/mp4:', MediaRecorder.isTypeSupported('audio/mp4'));
        
        mediaRecorder.ondataavailable = (event) => {
            // console.log('=== AUDIO DATA AVAILABLE ===');
            // console.log('Data size:', event.data.size);
            // console.log('Data type:', event.data.type);
            if (event.data.size > 0) {
                audioChunks.push(event.data);
                // console.log('Added audio chunk, total chunks:', audioChunks.length);
            } else {
                // console.warn('Received empty audio data!');
            }
        };
        
        mediaRecorder.onstop = async () => {
            // console.log('=== MEDIARECORDER STOPPED ===');
            // console.log('Total audio chunks collected:', audioChunks.length);
            
            const stopTime = Date.now();
            
            // Stop all tracks to release microphone
            stream.getTracks().forEach(track => track.stop());
            // console.log('All media tracks stopped');
            
            if (audioChunks.length === 0) {
                // console.error('NO AUDIO CHUNKS COLLECTED!');
                ipcRenderer.send('recording-data', null);
                return;
            }
            
            // Create blob and convert to array buffer - optimized approach
            const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
            // console.log('Audio blob created - size:', audioBlob.size, 'type:', audioBlob.type);
            
            if (audioBlob.size === 0) {
                // console.error('AUDIO BLOB IS EMPTY!');
                ipcRenderer.send('recording-data', null);
                return;
            }
            
            // Optimize memory usage - use arrayBuffer directly
            try {
                const arrayBuffer = await audioBlob.arrayBuffer();
                // console.log('=== SENDING AUDIO DATA ===');
                // console.log('Array buffer size:', arrayBuffer.byteLength);
                
                // Convert to Uint8Array more efficiently
                const uint8Array = new Uint8Array(arrayBuffer);
                const processingTime = Date.now() - stopTime;
                // console.log(`Audio processing completed in ${processingTime}ms`);
                
                // Send as array (IPC requirement) but more efficiently
                ipcRenderer.send('recording-data', Array.from(uint8Array));
            } catch (error) {
                // console.error('Error processing audio data:', error);
                ipcRenderer.send('recording-data', null);
            }
        };
        
        mediaRecorder.onerror = (error) => {
            // console.error('MediaRecorder error:', error);
            stream.getTracks().forEach(track => track.stop());
        };
        
        // Start recording with optimized timeslice for better performance
        mediaRecorder.start(2000); // Collect data every 2 seconds (reduced frequency for better performance)
        // console.log('MediaRecorder started successfully with optimized timeslice');
        // console.log('MediaRecorder state after start:', mediaRecorder.state);
        
    } catch (error) {
        // console.error('=== RENDERER ERROR: Failed to start recording ===');
        // console.error('Error details:', error);
        // console.error('Error name:', error.name);
        // console.error('Error message:', error.message);
        if (error.name === 'NotAllowedError') {
            // console.error('MICROPHONE PERMISSION DENIED!');
        } else if (error.name === 'NotFoundError') {
            // console.error('NO MICROPHONE FOUND!');
        }
        ipcRenderer.send('recording-data', null);
    }
});

ipcRenderer.on('stop-recording', () => {
    // console.log('Stop recording requested, mediaRecorder state:', mediaRecorder ? mediaRecorder.state : 'null');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    } else {
        // console.log('MediaRecorder not available or already stopped');
        ipcRenderer.send('recording-data', null);
    }
});

// Test IPC listener
ipcRenderer.on('test-message', (event, message) => {
    // console.log('=== RENDERER: Received test message ===', message);
});

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // console.log('=== DOM LOADED: Starting app initialization ===');
    initializeApp();
});

// Add IPC handler for test injection
ipcRenderer.handle('test-injection', async () => {
    // This will be handled by the main process
    return true;
});

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Auto-save settings when inputs change
instructionInput.addEventListener('input', () => {
    // Save instruction to localStorage for persistence
    localStorage.setItem('lastInstruction', instructionInput.value);
});

// Load last instruction on startup
document.addEventListener('DOMContentLoaded', () => {
    const lastInstruction = localStorage.getItem('lastInstruction');
    if (lastInstruction) {
        instructionInput.value = lastInstruction;
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Ctrl+S to save API key
    if (event.ctrlKey && event.key === 's') {
        event.preventDefault();
        saveApiKeyBtn.click();
    }
    
    // Ctrl+T to test API key
    if (event.ctrlKey && event.key === 't') {
        event.preventDefault();
        testApiKeyBtn.click();
    }
    
    // Ctrl+I to test injection
    if (event.ctrlKey && event.key === 'i') {
        event.preventDefault();
        testInjectionBtn.click();
    }
});

// Add some helpful tooltips
function addTooltips() {
    const tooltips = {
        'saveApiKey': 'Save your OpenAI API key (Ctrl+S)',
        'testApiKey': 'Test if your API key is valid (Ctrl+T)',
        'testInjection': 'Test text injection functionality (Ctrl+I)',
        'clearTranscript': 'Clear the transcript display',
        'templateSelect': 'Choose a predefined instruction template',
        'instructionInput': 'Enter your custom instruction or use a template above'
    };

    Object.entries(tooltips).forEach(([id, tooltip]) => {
        const element = document.getElementById(id);
        if (element) {
            element.title = tooltip;
        }
    });
}

// Initialize tooltips
document.addEventListener('DOMContentLoaded', addTooltips); 