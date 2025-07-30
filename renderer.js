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
const addTemplateBtn = document.getElementById('addTemplateBtn');
const editTemplateBtn = document.getElementById('editTemplateBtn');
const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');
const exportTemplatesBtn = document.getElementById('exportTemplatesBtn');
const importTemplatesBtn = document.getElementById('importTemplatesBtn');
const autoPasteCheckbox = document.getElementById('autoPasteCheckbox');
// LLM Clipboard DOM elements
const llmClipboardStatus = document.getElementById('llmClipboardStatus');
const llmClipboardText = document.getElementById('llmClipboardText');
const clearLlmClipboard = document.getElementById('clearLlmClipboard');
const llmClipboardPreview = document.getElementById('llmClipboardPreview');
const llmClipboardContent = document.getElementById('llmClipboardContent');
const llmShortcutsEnabled = document.getElementById('llmShortcutsEnabled');
// Add new DOM element for Copy Send
const copySendCheckbox = document.getElementById('copySendCheckbox');
const copySendLoadingIndicator = document.getElementById('copySendLoadingIndicator');
// Add new DOM element for Responses API
const useResponsesAPICheckbox = document.getElementById('useResponsesAPICheckbox');
// Enhanced: Recording progress elements
const recordingProgressContainer = document.getElementById('recordingProgressContainer');
const recordingProgressFill = document.getElementById('recordingProgressFill');
const recordingElapsed = document.getElementById('recordingElapsed');
const recordingRemaining = document.getElementById('recordingRemaining');
// Modal elements
const templateModal = document.getElementById('templateModal');
const modalTitle = document.getElementById('modalTitle');
const modalClose = document.getElementById('modalClose');
const templateNameInput = document.getElementById('templateNameInput');
const templateContentInput = document.getElementById('templateContentInput');
const modalSave = document.getElementById('modalSave');
const modalCancel = document.getElementById('modalCancel');
// RAG Store DOM elements
const ragStoreSelect = document.getElementById('ragStoreSelect');
const addRagStoreBtn = document.getElementById('addRagStoreBtn');
const editRagStoreBtn = document.getElementById('editRagStoreBtn');
const deleteRagStoreBtn = document.getElementById('deleteRagStoreBtn');
const exportRagStoresBtn = document.getElementById('exportRagStoresBtn');
const importRagStoresBtn = document.getElementById('importRagStoresBtn');
// RAG Store Modal elements
const ragStoreModal = document.getElementById('ragStoreModal');
const ragModalTitle = document.getElementById('ragModalTitle');
const ragModalClose = document.getElementById('ragModalClose');
const ragStoreNameInput = document.getElementById('ragStoreNameInput');
const ragStoreIdInput = document.getElementById('ragStoreIdInput');
const ragModalSave = document.getElementById('ragModalSave');
const ragModalCancel = document.getElementById('ragModalCancel');
// RAG Testing elements
const ragTestQuery = document.getElementById('ragTestQuery');
const testDirectSearchBtn = document.getElementById('testDirectSearchBtn');
const testRagQueryBtn = document.getElementById('testRagQueryBtn');
const ragTestResults = document.getElementById('ragTestResults');
const ragTestContent = document.getElementById('ragTestContent');
const maxResultsSelect = document.getElementById('maxResultsSelect');

// Debug: Check if RAG test elements are properly loaded
console.log('RAG Test Debug - ragTestQuery element:', ragTestQuery);
console.log('RAG Test Debug - ragTestQuery disabled?', ragTestQuery ? ragTestQuery.disabled : 'element not found');
console.log('RAG Test Debug - ragTestQuery readonly?', ragTestQuery ? ragTestQuery.readOnly : 'element not found');
// File Upload elements
const uploadModeCheckbox = document.getElementById('uploadModeCheckbox');
const fileUploadSection = document.getElementById('fileUploadSection');
const vectorStoreIdSection = document.getElementById('vectorStoreIdSection');
const fileUploadInput = document.getElementById('fileUploadInput');
const fileUploadContainer = document.getElementById('fileUploadContainer');
const selectedFileName = document.getElementById('selectedFileName');
const browseFileBtn = document.getElementById('browseFileBtn');
const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const uploadProgressFill = document.getElementById('uploadProgressFill');
const uploadStatusText = document.getElementById('uploadStatusText');
const uploadPercentage = document.getElementById('uploadPercentage');
// RAG Search DOM elements
const ragSearchCheckbox = document.getElementById('ragSearchCheckbox');
const ragAssociationsSection = document.getElementById('ragAssociationsSection');
const ragAssociationsList = document.getElementById('ragAssociationsList');
const addRagAssociationBtn = document.getElementById('addRagAssociationBtn');
// Web Search DOM elements
const webSearchCheckbox = document.getElementById('webSearchCheckbox');
const webSearchOptionsSection = document.getElementById('webSearchOptionsSection');
const webSearchResultsSlider = document.getElementById('webSearchResultsSlider');
const webSearchResultsValue = document.getElementById('webSearchResultsValue');
const templateWebSearchCheckbox = document.getElementById('templateWebSearchCheckbox');
const webSearchConfigSection = document.getElementById('webSearchConfigSection');

let userTemplates = [];
let currentEditingTemplate = null;
// RAG Store variables
let ragStores = [];
let currentEditingRagStore = null;
// RAG Search variables
let currentTemplate = null;

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
    
    // Setup event listeners for the API configuration (these are handled below in standalone listeners)
    
    // Load user templates first
    userTemplates = await ipcRenderer.invoke('get-instruction-templates');
    
    // Ensure backward compatibility: add RAG and web search fields to existing templates
    userTemplates.forEach(template => {
        if (!template.hasOwnProperty('ragSearch')) {
            template.ragSearch = false;
        }
        if (!template.hasOwnProperty('ragAssociations')) {
            template.ragAssociations = [];
        }
        
        // Add web search defaults for backward compatibility
        initializeWebSearchDefaults(template);
    });
    
    // Make userTemplates globally accessible for main process
    window.userTemplates = userTemplates;
    renderTemplateOptions();

    // Setup template selection with both built-in and user templates
    templateSelect.addEventListener('change', onTemplateSelect);
    
    // Initialize RAG UI
    updateRagUI();
    
    // Wire up template CRUD buttons
    console.log('Wiring up template buttons:', {
        addTemplateBtn: !!addTemplateBtn,
        editTemplateBtn: !!editTemplateBtn,
        deleteTemplateBtn: !!deleteTemplateBtn,
        exportTemplatesBtn: !!exportTemplatesBtn,
        importTemplatesBtn: !!importTemplatesBtn
    });
    addTemplateBtn.addEventListener('click', addTemplate);
    editTemplateBtn.addEventListener('click', editTemplate);
    deleteTemplateBtn.addEventListener('click', deleteTemplate);
    exportTemplatesBtn.addEventListener('click', exportTemplates);
    importTemplatesBtn.addEventListener('click', importTemplates);

    // Load user RAG stores and setup event listeners
    ragStores = await ipcRenderer.invoke('get-rag-stores');
    window.ragStores = ragStores;
    renderRagStoreOptions();

    // Setup RAG store CRUD buttons
    console.log('Setting up RAG store buttons:', {
        addRagStoreBtn: !!addRagStoreBtn,
        editRagStoreBtn: !!editRagStoreBtn,
        deleteRagStoreBtn: !!deleteRagStoreBtn,
        exportRagStoresBtn: !!exportRagStoresBtn,
        importRagStoresBtn: !!importRagStoresBtn
    });
    addRagStoreBtn.addEventListener('click', addRagStore);
    editRagStoreBtn.addEventListener('click', editRagStore);
    deleteRagStoreBtn.addEventListener('click', deleteRagStore);
    exportRagStoresBtn.addEventListener('click', exportRagStores);
    importRagStoresBtn.addEventListener('click', importRagStores);
    ragStoreSelect.addEventListener('change', onRagStoreSelect);

    // Setup RAG search functionality
    console.log('Setting up RAG search functionality:', {
        ragSearchCheckbox: !!ragSearchCheckbox,
        ragAssociationsSection: !!ragAssociationsSection,
        addRagAssociationBtn: !!addRagAssociationBtn
    });
    ragSearchCheckbox.addEventListener('change', onRagSearchToggle);
    addRagAssociationBtn.addEventListener('click', addRagAssociation);

    // Setup web search functionality
    console.log('Setting up web search functionality:', {
        webSearchCheckbox: !!webSearchCheckbox,
        webSearchOptionsSection: !!webSearchOptionsSection,
        templateWebSearchCheckbox: !!templateWebSearchCheckbox
    });
    
    if (webSearchCheckbox) {
        webSearchCheckbox.addEventListener('change', onWebSearchToggle);
    }
    
    if (webSearchResultsSlider) {
        webSearchResultsSlider.addEventListener('input', updateWebSearchResultsValue);
    }
    
    if (templateWebSearchCheckbox) {
        templateWebSearchCheckbox.addEventListener('change', onTemplateWebSearchToggle);
    }

    // Setup LLM clipboard buttons
    console.log('Setting up LLM clipboard buttons:', {
        clearLlmClipboard: !!clearLlmClipboard,
        llmShortcutsEnabled: !!llmShortcutsEnabled
    });

    clearLlmClipboard.addEventListener('click', clearLlmClipboardContent);
    // Removed previewLlmClipboard event listener - content is now always visible

    // Load LLM shortcuts setting
    const llmShortcutsEnabledValue = await ipcRenderer.invoke('get-llm-shortcuts-enabled');
    llmShortcutsEnabled.checked = llmShortcutsEnabledValue;
    llmShortcutsEnabled.addEventListener('change', async () => {
        await ipcRenderer.invoke('set-llm-shortcuts-enabled', llmShortcutsEnabled.checked);
    });

    // Update LLM clipboard status on load
    updateLlmClipboardStatus();

    // Load and setup auto-paste setting
    const autoPasteEnabled = await ipcRenderer.invoke('get-auto-paste');
    autoPasteCheckbox.checked = autoPasteEnabled;
    autoPasteCheckbox.addEventListener('change', async () => {
        await ipcRenderer.invoke('save-auto-paste', autoPasteCheckbox.checked);
    });

    // Add event listener for Copy Send checkbox
    copySendCheckbox.addEventListener('change', async () => {
        await ipcRenderer.invoke('save-copy-send', copySendCheckbox.checked);
    });

    // Add event listener for Responses API checkbox
    useResponsesAPICheckbox.addEventListener('change', async () => {
        await ipcRenderer.invoke('save-use-responses-api', useResponsesAPICheckbox.checked);
        showStatus(useResponsesAPICheckbox.checked ? 'Switched to Responses API' : 'Switched to Chat Completions API', 'info');
    });

    // Add IPC listeners for Copy Send processing
    ipcRenderer.on('copy-processing-started', () => {
        showCopySendLoading(true);
    });

    ipcRenderer.on('copy-processing-completed', () => {
        showCopySendLoading(false);
        showStatus('LLM processing completed - ready to paste', 'success');
    });

    ipcRenderer.on('copy-processing-error', (event, errorMessage) => {
        showCopySendLoading(false);
        showStatus('Background LLM processing failed: ' + errorMessage, 'error');
    });

    // Listen for upload progress updates from main process
    ipcRenderer.on('upload-progress-update', (event, data) => {
        updateUploadProgress(data.percentage, data.status);
    });

    // Wire up modal event listeners
    modalClose.addEventListener('click', hideModal);
    modalCancel.addEventListener('click', hideModal);
    modalSave.addEventListener('click', saveTemplate);
    
    // Wire up RAG store modal event listeners
    ragModalClose.addEventListener('click', hideRagStoreModal);
    ragModalCancel.addEventListener('click', hideRagStoreModal);
    ragModalSave.addEventListener('click', saveRagStore);
    
    // File upload event listeners
    uploadModeCheckbox.addEventListener('change', toggleUploadMode);
    browseFileBtn.addEventListener('click', () => fileUploadInput.click());
    fileUploadInput.addEventListener('change', handleFileSelection);
    fileUploadContainer.addEventListener('click', () => fileUploadInput.click());
    
    // Drag and drop events
    fileUploadContainer.addEventListener('dragover', handleDragOver);
    fileUploadContainer.addEventListener('drop', handleFileDrop);
    fileUploadContainer.addEventListener('dragleave', handleDragLeave);
    
    // RAG testing event listeners
    testDirectSearchBtn.addEventListener('click', testDirectSearch);
    testRagQueryBtn.addEventListener('click', testRagQuery);
    
    // Debug: Ensure RAG test input is enabled and add test listener
    if (ragTestQuery) {
        ragTestQuery.disabled = false;
        ragTestQuery.readOnly = false;
        ragTestQuery.style.pointerEvents = 'auto';
        ragTestQuery.style.userSelect = 'text';
        
        ragTestQuery.addEventListener('focus', () => {
            console.log('RAG Test Debug - Input received focus');
        });
        
        ragTestQuery.addEventListener('input', () => {
            console.log('RAG Test Debug - Input changed, value:', ragTestQuery.value);
        });
        
        ragTestQuery.addEventListener('click', () => {
            console.log('RAG Test Debug - Input clicked');
        });
        
        console.log('RAG Test Debug - Event listeners added to input');
    } else {
        console.error('RAG Test Debug - ragTestQuery element not found!');
    }
    
    // Close modal when clicking outside
    templateModal.addEventListener('click', (e) => {
        if (e.target === templateModal) {
            hideModal();
        }
    });
    
    // Close RAG store modal when clicking outside
    ragStoreModal.addEventListener('click', (e) => {
        if (e.target === ragStoreModal) {
            hideRagStoreModal();
        }
    });
    
    // Handle Enter key in modal
    templateNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            templateContentInput.focus();
        }
    });
    
    templateContentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            saveTemplate();
        }
    });
    
    // Handle Enter key in RAG store modal
    ragStoreNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            ragStoreIdInput.focus();
        }
    });
    
    ragStoreIdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveRagStore();
        }
    });
    
    // console.log('=== APP INITIALIZATION COMPLETE ===');
    // console.log('IPC available:', !!ipcRenderer);
    // console.log('MediaDevices available:', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
}

// Theme Management
function applyTheme(isDarkMode) {
    if (isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

// Load theme on startup
async function loadTheme() {
    try {
        const isDarkMode = await ipcRenderer.invoke('get-dark-mode');
        applyTheme(isDarkMode);
    } catch (error) {
        console.error('Error loading theme:', error);
    }
}

// Listen for theme changes from menu
ipcRenderer.on('theme-changed', (event, isDarkMode) => {
    applyTheme(isDarkMode);
});

// Initialize theme on startup
loadTheme();

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



temperatureSlider.addEventListener('input', () => {
    temperatureValue.textContent = temperatureSlider.value;
    saveSettings();
});

maxTokensInput.addEventListener('change', saveSettings);
modelSelect.addEventListener('change', saveSettings);
maxResultsSelect.addEventListener('change', saveSettings);

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

ipcRenderer.on('llm-clipboard-updated', () => {
    updateLlmClipboardStatus();
});

// Enhanced: Recording progress listener
ipcRenderer.on('recording-progress', (event, progressData) => {
    updateRecordingProgress(progressData);
});

// Helper functions
function showStatus(status, type = 'ready') {
    // Add visual cues for different states
    if (status.toLowerCase().includes('listening')) {
        statusText.textContent = status + ' - Speak now!';
        statusText.style.color = '#ff3b30';
        statusText.style.fontWeight = 'bold';
        // Enhanced: Show recording indicator with progress
        if (recordingIndicator) {
            recordingIndicator.style.display = 'flex';
        }
        if (recordingProgressContainer) {
            recordingProgressContainer.style.display = 'block';
        }
    } else if (status.toLowerCase().includes('transcribing')) {
        statusText.textContent = '📝 ' + status;
        statusText.style.color = '#007aff';
        statusText.style.fontWeight = 'normal';
        // Enhanced: Hide recording indicator and progress
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
        if (recordingProgressContainer) {
            recordingProgressContainer.style.display = 'none';
        }
    } else if (status.toLowerCase().includes('thinking')) {
        statusText.textContent = '🤔 ' + status;
        statusText.style.color = '#28a745';
        statusText.style.fontWeight = 'normal';
        // Enhanced: Hide recording indicator and progress
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
        if (recordingProgressContainer) {
            recordingProgressContainer.style.display = 'none';
        }
    } else if (status.toLowerCase().includes('done')) {
        statusText.textContent = '✅ ' + status;
        statusText.style.color = '#28a745';
        statusText.style.fontWeight = 'normal';
        // Enhanced: Hide recording indicator and progress
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
        if (recordingProgressContainer) {
            recordingProgressContainer.style.display = 'none';
        }
    } else if (status.toLowerCase().includes('error')) {
        statusText.textContent = '❌ ' + status;
        statusText.style.color = '#dc3545';
        statusText.style.fontWeight = 'normal';
        // Enhanced: Hide recording indicator and progress
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
        if (recordingProgressContainer) {
            recordingProgressContainer.style.display = 'none';
        }
    } else {
        statusText.textContent = status;
        statusText.style.color = '#495057';
        statusText.style.fontWeight = 'normal';
        // Enhanced: Hide recording indicator and progress for non-listening states
        if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
        }
        if (recordingProgressContainer) {
            recordingProgressContainer.style.display = 'none';
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

// Enhanced: Recording progress update function
function updateRecordingProgress(progressData) {
    if (!progressData || !recordingProgressFill || !recordingElapsed || !recordingRemaining) {
        return;
    }
    
    const { elapsed, progress, remaining } = progressData;
    
    // Update progress bar
    recordingProgressFill.style.width = `${Math.min(progress, 100)}%`;
    
    // Format time display
    const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${remainingSeconds}s`;
    };
    
    // Update time displays
    recordingElapsed.textContent = formatTime(elapsed);
    recordingRemaining.textContent = formatTime(remaining);
    
    // Change color when approaching limit
    if (progress > 80) {
        recordingProgressFill.style.background = 'linear-gradient(90deg, #FF6B6B, #FF8E53)';
    } else if (progress > 60) {
        recordingProgressFill.style.background = 'linear-gradient(90deg, #FFD93D, #FF6B6B)';
    } else {
        recordingProgressFill.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
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
    // Handle both old string format and new enhanced object format
    if (typeof response === 'string') {
        // Old format - just text
        if (response && response.trim()) {
            responseDisplay.innerHTML = `<div class="response-text">${response}</div>`;
        } else {
            responseDisplay.innerHTML = '<p class="no-response">No response available</p>';
        }
    } else if (response && typeof response === 'object') {
        // New enhanced format with metadata
        const { text, webSearchUsed, ragUsed, citations, processingTime } = response;
        
        if (text && text.trim()) {
            // Build indicators HTML
            let indicatorsHtml = '';
            if (webSearchUsed || ragUsed) {
                indicatorsHtml = '<div class="response-indicators">';
                
                if (webSearchUsed) {
                    indicatorsHtml += '<span class="indicator web-search-indicator">🌐 Web Search Used</span>';
                }
                
                if (ragUsed) {
                    indicatorsHtml += '<span class="indicator rag-search-indicator">📁 RAG Search Used</span>';
                }
                
                if (processingTime) {
                    indicatorsHtml += `<span class="indicator processing-time">⏱️ ${processingTime}ms</span>`;
                }
                
                indicatorsHtml += '</div>';
            }
            
            // Build citations HTML
            let citationsHtml = '';
            if (citations && citations.length > 0) {
                citationsHtml = '<div class="response-citations"><h4>Sources:</h4><ul>';
                citations.forEach((citation, index) => {
                    citationsHtml += `<li><a href="${citation.url}" target="_blank" title="${citation.title}">${citation.title || citation.url}</a></li>`;
                });
                citationsHtml += '</ul></div>';
            }
            
            responseDisplay.innerHTML = `
                ${indicatorsHtml}
                <div class="response-text">${text}</div>
                ${citationsHtml}
            `;
        } else {
            responseDisplay.innerHTML = '<p class="no-response">No response available</p>';
        }
    } else {
        responseDisplay.innerHTML = '<p class="no-response">No response available</p>';
    }
}

function displayTranscript(transcript) {
    const transcriptDisplay = document.getElementById('transcriptDisplay');
    if (transcript && transcript.trim()) {
        transcriptDisplay.innerHTML = `<div class="transcript-text">${transcript}</div>`;
    } else {
        transcriptDisplay.innerHTML = '<p class="no-transcript">No transcript yet. Use the hotkey to start recording.</p>';
    }
}

async function saveSettings() {
    try {
        await ipcRenderer.invoke('save-model', modelSelect.value);
        await ipcRenderer.invoke('save-temperature', parseFloat(temperatureSlider.value));
        await ipcRenderer.invoke('save-max-tokens', parseInt(maxTokensInput.value));
        await ipcRenderer.invoke('save-max-results', parseInt(maxResultsSelect.value));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

async function loadSettings() {
    try {
        // Load existing settings
        const autoPasteEnabled = await ipcRenderer.invoke('get-auto-paste');
        const llmShortcutsEnabledValue = await ipcRenderer.invoke('get-llm-shortcuts-enabled');
        
        // Load Copy Send setting
        const copySendEnabled = await ipcRenderer.invoke('get-copy-send');
        
        // Load Responses API setting
        const useResponsesAPI = await ipcRenderer.invoke('get-use-responses-api');
        
        // Apply settings to UI
        autoPasteCheckbox.checked = autoPasteEnabled;
        llmShortcutsEnabled.checked = llmShortcutsEnabledValue;
        copySendCheckbox.checked = copySendEnabled;
        useResponsesAPICheckbox.checked = useResponsesAPI;
        
        // Load other settings
        const model = await ipcRenderer.invoke('get-model');
        const temperature = await ipcRenderer.invoke('get-temperature');
        const maxTokens = await ipcRenderer.invoke('get-max-tokens');
        const maxResults = await ipcRenderer.invoke('get-max-results');
        
        if (model) modelSelect.value = model;
        if (temperature) {
            temperatureSlider.value = temperature;
            temperatureValue.textContent = temperature;
        }
        if (maxTokens) maxTokensInput.value = maxTokens;
        if (maxResults) maxResultsSelect.value = maxResults;
        
    } catch (error) {
        console.error('Error loading settings:', error);
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
        
        // Enhanced audio constraints optimized for Whisper API
        let stream;
        try {
            // Primary: Whisper-optimized audio constraints
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,        // Enhanced: Auto-gain control
                    channelCount: 1,              // Mono (optimal for speech)
                    sampleRate: 16000,            // Enhanced: 16kHz (Whisper optimal)
                    sampleSize: 16                // Enhanced: 16-bit depth
                } 
            });
            console.log('✅ Using Whisper-optimized audio constraints (16kHz/16-bit/mono)');
        } catch (error) {
            console.log('⚠️ Whisper-optimized constraints failed, trying standard constraints...');
            try {
                // Fallback: Standard enhanced constraints
                stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        channelCount: 1
                    }
                });
                console.log('✅ Using standard enhanced audio constraints');
            } catch (fallbackError) {
                console.log('⚠️ Enhanced constraints failed, using basic audio...');
                // Final fallback: Basic audio constraints
                stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: true
                });
                console.log('✅ Using basic audio constraints');
            }
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
            if (event.data.size > 0) {
                audioChunks.push(event.data);
                // console.log('✅ Added audio chunk, total chunks:', audioChunks.length);
            } else {
                console.warn('⚠️ Received empty audio data!');
            }
        };
        
        mediaRecorder.onstop = async () => {
            // console.log('=== MEDIARECORDER STOPPED ===');
            console.log('📊 Audio chunks collected:', audioChunks.length);
            
            const stopTime = Date.now();
            
            // Stop all tracks to release microphone
            stream.getTracks().forEach(track => track.stop());
            
            if (audioChunks.length === 0) {
                console.error('❌ NO AUDIO CHUNKS COLLECTED!');
                ipcRenderer.send('recording-data', null);
                return;
            }
            
            // Create blob and convert to array buffer - optimized approach
            const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
            console.log('🎤 Audio blob created:', audioBlob.size, 'bytes');
            
            if (audioBlob.size === 0) {
                console.error('❌ AUDIO BLOB IS EMPTY!');
                ipcRenderer.send('recording-data', null);
                return;
            }
            
            // Optimize memory usage - use arrayBuffer directly
            try {
                const arrayBuffer = await audioBlob.arrayBuffer();
                
                // Convert to Buffer for reliable binary data transmission
                const buffer = Buffer.from(arrayBuffer);
                const processingTime = Date.now() - stopTime;
                console.log(`📤 Sending ${buffer.length} bytes to transcription (${processingTime}ms)`);
                
                // Send as Buffer to preserve binary data integrity
                ipcRenderer.send('recording-data', buffer);
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

// Add IPC listener for test injection
ipcRenderer.on('test-injection', async () => {
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
        'instructionInput': 'Enter your custom instruction or use a template above',
        'addTemplateBtn': 'Add a new custom instruction template',
        'editTemplateBtn': 'Edit the selected custom template',
        'deleteTemplateBtn': 'Delete the selected custom template',
        'exportTemplatesBtn': 'Export all custom templates to JSON file',
        'importTemplatesBtn': 'Import templates from JSON file',
        'clearLlmClipboard': 'Clear the LLM clipboard content',
        'previewLlmClipboard': 'Preview LLM clipboard content',
        'llmShortcutsEnabled': 'Enable/disable Ctrl+C processing shortcut'
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
// --- Instruction Templates & Auto-Paste Integration ---
function renderTemplateOptions() {
    // Remove existing user template options
    Array.from(templateSelect.options).forEach(opt => {
        if (opt.dataset.userTemplate) {
            templateSelect.remove(opt.index);
        }
    });
    
    // Add custom templates with icon and styling
    userTemplates.forEach(t => {
        const opt = new Option(`👤 ${t.name}`, t.id);
        opt.dataset.userTemplate = 'true';
        opt.className = 'custom-template-option';
        templateSelect.add(opt);
    });
    
    // Update built-in template options with icons if not already done
    const builtInOptions = Array.from(templateSelect.options).filter(opt => !opt.dataset.userTemplate && opt.value !== '');
    builtInOptions.forEach(opt => {
        if (!opt.text.startsWith('⚙️')) {
            opt.text = `⚙️ ${opt.text}`;
            opt.className = 'system-template-option';
        }
    });
    
    // Update the first option (Custom instruction) with icon
    const firstOption = templateSelect.options[0];
    if (firstOption && firstOption.value === '' && !firstOption.text.startsWith('🔧')) {
        firstOption.text = '🔧 Custom instruction...';
        firstOption.className = 'custom-instruction-option';
    }
}

function onTemplateSelect(e) {
    const val = e.target.value;
    let text = '';
    let template = null;
    
    if (promptTemplates[val]) {
        text = promptTemplates[val];
        // Built-in templates don't have RAG or web search functionality
        currentTemplate = null;
    } else {
        template = userTemplates.find(t => t.id === val);
        if (template) {
            text = template.content;
            
            // Initialize defaults for older templates (backward compatibility)
            initializeWebSearchDefaults(template);
            
            currentTemplate = template;
        } else {
            currentTemplate = null;
        }
    }
    
    instructionInput.value = text;
    localStorage.setItem('lastInstruction', text);
    
    // Update RAG UI based on selected template
    updateRagUI();
    
    // Update web search UI based on selected template
    updateWebSearchUI();
}

// Modal functions
function showModal(title, name = '', content = '') {
    modalTitle.textContent = title;
    templateNameInput.value = name;
    templateContentInput.value = content;
    templateModal.style.display = 'flex';
    templateNameInput.focus();
}

function hideModal() {
    templateModal.style.display = 'none';
    currentEditingTemplate = null;
    templateNameInput.value = '';
    templateContentInput.value = '';
}

async function saveTemplate() {
    const name = templateNameInput.value.trim();
    const content = templateContentInput.value.trim();
    
    if (!name) {
        alert('Please enter a template name');
        return;
    }
    
    if (!content) {
        alert('Please enter template content');
        return;
    }
    
    // Get web search settings from the modal
    const webSearchEnabled = templateWebSearchCheckbox?.checked || false;
    const webSearchMaxResults = parseInt(document.getElementById('webSearchMaxResults')?.value || 5);
    const webSearchIncludeResults = document.getElementById('webSearchIncludeResults')?.checked !== false;
    
    if (currentEditingTemplate) {
        // Edit existing template
        currentEditingTemplate.name = name;
        currentEditingTemplate.content = content;
        
        // Preserve existing RAG settings when editing
        if (!currentEditingTemplate.ragSearch) {
            currentEditingTemplate.ragSearch = false;
        }
        if (!currentEditingTemplate.ragAssociations) {
            currentEditingTemplate.ragAssociations = [];
        }
        
        // Update web search settings
        currentEditingTemplate.webSearch = webSearchEnabled;
        currentEditingTemplate.webSearchConfig = {
            enabled: webSearchEnabled,
            maxResults: webSearchMaxResults,
            includeResults: webSearchIncludeResults
        };
    } else {
        // Add new template with RAG and web search fields
        const id = Date.now().toString();
        userTemplates.push({ 
            id, 
            name, 
            content,
            ragSearch: false,
            ragAssociations: [],
            webSearch: webSearchEnabled,
            webSearchConfig: {
                enabled: webSearchEnabled,
                maxResults: webSearchMaxResults,
                includeResults: webSearchIncludeResults
            }
        });
    }
    
    // Update global reference
    window.userTemplates = userTemplates;
    
    await ipcRenderer.invoke('save-instruction-templates', userTemplates);
    renderTemplateOptions();
    hideModal();
    
    // Select the new/edited template
    if (!currentEditingTemplate) {
        const newTemplate = userTemplates[userTemplates.length - 1];
        templateSelect.value = newTemplate.id;
        onTemplateSelect({ target: templateSelect });
    }
}

function addTemplate() {
    console.log('ADD TEMPLATE CLICKED!');
    currentEditingTemplate = null;
    showModal('Add Template', '', instructionInput.value);
}

function editTemplate() {
    const val = templateSelect.value;
    const tpl = userTemplates.find(t => t.id === val);
    if (!tpl) {
        alert('Select a custom template to edit');
        return;
    }
    
    // Initialize defaults if needed for backward compatibility
    initializeWebSearchDefaults(tpl);
    
    currentEditingTemplate = tpl;
    showModal('Edit Template', tpl.name, tpl.content);
    
    // Populate web search fields in modal
    if (templateWebSearchCheckbox) {
        templateWebSearchCheckbox.checked = tpl.webSearch || false;
        onTemplateWebSearchToggle(); // Show/hide config section
    }
    
    if (tpl.webSearchConfig) {
        const maxResultsInput = document.getElementById('webSearchMaxResults');
        const includeResultsCheckbox = document.getElementById('webSearchIncludeResults');
        
        if (maxResultsInput) {
            maxResultsInput.value = tpl.webSearchConfig.maxResults || 5;
        }
        
        if (includeResultsCheckbox) {
            includeResultsCheckbox.checked = tpl.webSearchConfig.includeResults !== false;
        }
    }
}

async function deleteTemplate() {
    const val = templateSelect.value;
    const tpl = userTemplates.find(t => t.id === val);
    if (!tpl) {
        alert('Select a custom template to delete');
        return;
    }
    if (!confirm('Delete this template?')) return;
    userTemplates = userTemplates.filter(t => t.id !== val);
    // Update global reference
    window.userTemplates = userTemplates;
    await ipcRenderer.invoke('save-instruction-templates', userTemplates);
    renderTemplateOptions();
    templateSelect.value = '';
    onTemplateSelect({ target: templateSelect });
}

// Import/Export functions
async function exportTemplates() {
    try {
        showStatus('Exporting templates...', 'info');
        const result = await ipcRenderer.invoke('export-templates');
        
        if (result.success) {
            showStatus(`Templates exported to: ${result.filePath}`, 'success');
            setTimeout(() => showStatus('Ready'), 3000);
        } else {
            showStatus(`Export failed: ${result.error}`, 'error');
            setTimeout(() => showStatus('Ready'), 3000);
        }
    } catch (error) {
        showStatus(`Export error: ${error.message}`, 'error');
        setTimeout(() => showStatus('Ready'), 3000);
    }
}

async function importTemplates() {
    try {
        showStatus('Importing templates...', 'info');
        const result = await ipcRenderer.invoke('import-templates');
        
        if (result.success) {
            // Reload templates from storage
            userTemplates = await ipcRenderer.invoke('get-instruction-templates');
            // Update global reference
            window.userTemplates = userTemplates;
            renderTemplateOptions();
            
            showStatus(`Successfully imported ${result.importedCount} templates (${result.totalCount} total)`, 'success');
            setTimeout(() => showStatus('Ready'), 3000);
        } else {
            showStatus(`Import failed: ${result.error}`, 'error');
            setTimeout(() => showStatus('Ready'), 3000);
        }
    } catch (error) {
        showStatus(`Import error: ${error.message}`, 'error');
        setTimeout(() => showStatus('Ready'), 3000);
    }
}

// RAG Store Functions
function renderRagStoreOptions() {
    // Clear existing options except the default
    ragStoreSelect.innerHTML = '<option value="">Select RAG Store...</option>';
    
    // Add user RAG stores
    ragStores.forEach(store => {
        const option = document.createElement('option');
        option.value = store.id;
        option.textContent = store.name;
        ragStoreSelect.appendChild(option);
    });
}

function onRagStoreSelect(e) {
    const selectedValue = e.target.value;
    console.log('RAG Store selected:', selectedValue);
    
    if (selectedValue && ragStores.length > 0) {
        const selectedStore = ragStores.find(store => store.id === selectedValue);
        if (selectedStore) {
            console.log('Selected RAG Store:', selectedStore);
        }
    }
}

async function saveRagStore() {
    const name = ragStoreNameInput.value.trim();
    const vectorStoreId = ragStoreIdInput.value.trim();
    const isUploadMode = uploadModeCheckbox.checked;
    const file = fileUploadInput.files[0];
    
    if (!name) {
        showStatus('Please enter a RAG store name', 'error');
        return;
    }
    
    if (isUploadMode) {
        // File upload mode - validate file
        if (!file) {
            showStatus('Please select a file to upload', 'error');
            return;
        }
        
        try {
            showStatus('Processing...', 'info');
            await createVectorStoreFromFile(name, file);
        } catch (error) {
            showStatus(`Error: ${error.message}`, 'error');
            return;
        }
    } else {
        // Vector Store ID mode - validate ID
        if (!vectorStoreId) {
            showStatus('Please enter a Vector Store ID', 'error');
            return;
        }
        
        // Check for duplicate names (excluding current editing store)
        const duplicateName = ragStores.find(store => 
            store.name.toLowerCase() === name.toLowerCase() && 
            (!currentEditingRagStore || store.id !== currentEditingRagStore.id)
        );
        if (duplicateName) {
            showStatus('A RAG store with this name already exists. Please choose a different name.', 'error');
            return;
        }
        
        // Check for duplicate Vector Store IDs (excluding current editing store)
        const duplicateId = ragStores.find(store => 
            store.vectorStoreId === vectorStoreId && 
            (!currentEditingRagStore || store.id !== currentEditingRagStore.id)
        );
        if (duplicateId) {
            showStatus('A RAG store with this Vector Store ID already exists. Please choose a different ID.', 'error');
            return;
        }
        
        if (currentEditingRagStore) {
            // Edit existing RAG store
            currentEditingRagStore.name = name;
            currentEditingRagStore.vectorStoreId = vectorStoreId;
        } else {
            // Add new RAG store
            const id = Date.now().toString();
            ragStores.push({ id, name, vectorStoreId });
        }
    }
    
    // Update global reference
    window.ragStores = ragStores;
    
    await ipcRenderer.invoke('save-rag-stores', ragStores);
    renderRagStoreOptions();
    hideRagStoreModal();
    
    // Select the new/edited RAG store
    if (!currentEditingRagStore) {
        const newStore = ragStores[ragStores.length - 1];
        ragStoreSelect.value = newStore.id;
        onRagStoreSelect({ target: ragStoreSelect });
    }
}

function addRagStore() {
    console.log('ADD RAG STORE CLICKED!');
    currentEditingRagStore = null;
    showRagStoreModal('Add RAG Store', '', '');
}

function editRagStore() {
    const val = ragStoreSelect.value;
    const store = ragStores.find(s => s.id === val);
    if (!store) {
        alert('Select a RAG store to edit');
        return;
    }
    currentEditingRagStore = store;
    showRagStoreModal('Edit RAG Store', store.name, store.vectorStoreId);
}

async function deleteRagStore() {
    const val = ragStoreSelect.value;
    const store = ragStores.find(s => s.id === val);
    if (!store) {
        alert('Select a RAG store to delete');
        return;
    }
    if (!confirm(`Delete RAG store "${store.name}"?`)) return;
    
    ragStores = ragStores.filter(s => s.id !== val);
    // Update global reference
    window.ragStores = ragStores;
    await ipcRenderer.invoke('save-rag-stores', ragStores);
    renderRagStoreOptions();
    ragStoreSelect.value = '';
    onRagStoreSelect({ target: ragStoreSelect });
}

async function exportRagStores() {
    try {
        showStatus('Exporting RAG stores...', 'info');
        const result = await ipcRenderer.invoke('export-rag-stores');
        
        if (result.success) {
            showStatus(`RAG stores exported to: ${result.filePath}`, 'success');
            setTimeout(() => showStatus('Ready'), 3000);
        } else {
            showStatus(`Export failed: ${result.error}`, 'error');
            setTimeout(() => showStatus('Ready'), 3000);
        }
    } catch (error) {
        showStatus(`Export error: ${error.message}`, 'error');
        setTimeout(() => showStatus('Ready'), 3000);
    }
}

async function importRagStores() {
    try {
        showStatus('Importing RAG stores...', 'info');
        const result = await ipcRenderer.invoke('import-rag-stores');
        
        if (result.success) {
            // Reload RAG stores from storage
            ragStores = await ipcRenderer.invoke('get-rag-stores');
            // Update global reference
            window.ragStores = ragStores;
            renderRagStoreOptions();
            
            showStatus(`Successfully imported ${result.importedCount} RAG stores (${result.totalCount} total)`, 'success');
            setTimeout(() => showStatus('Ready'), 3000);
        } else {
            showStatus(`Import failed: ${result.error}`, 'error');
            setTimeout(() => showStatus('Ready'), 3000);
        }
    } catch (error) {
        showStatus(`Import error: ${error.message}`, 'error');
        setTimeout(() => showStatus('Ready'), 3000);
    }
}

function showRagStoreModal(title, name = '', vectorStoreId = '') {
    ragModalTitle.textContent = title;
    ragStoreNameInput.value = name;
    ragStoreIdInput.value = vectorStoreId;
    ragStoreModal.style.display = 'block';
    ragStoreNameInput.focus();
}

function hideRagStoreModal() {
    ragStoreModal.style.display = 'none';
    currentEditingRagStore = null;
    ragStoreNameInput.value = '';
    ragStoreIdInput.value = '';
    
    // Reset file upload state
    uploadModeCheckbox.checked = false;
    fileUploadSection.style.display = 'none';
    vectorStoreIdSection.style.display = 'block';
    ragModalSave.textContent = 'Save';
    resetFileUpload();
}

// LLM Clipboard Functions
async function updateLlmClipboardStatus() {
    try {
        const clipboard = await ipcRenderer.invoke('get-llm-clipboard');
        if (clipboard && clipboard.text) {
            const charCount = clipboard.text.length;
            const timestamp = new Date(clipboard.timestamp).toLocaleString();
            llmClipboardText.textContent = `${charCount} characters (${timestamp})`;
            llmClipboardStatus.style.color = '#28a745';
            llmClipboardPreview.style.display = 'block'; // Always show preview
            llmClipboardContent.textContent = clipboard.text;
        } else {
            llmClipboardText.textContent = 'No content in LLM clipboard';
            llmClipboardStatus.style.color = '#6c757d';
            llmClipboardPreview.style.display = 'block'; // Always show preview area
            llmClipboardContent.textContent = 'No content available';
        }
    } catch (error) {
        console.error('Error updating LLM clipboard status:', error);
    }
}

async function clearLlmClipboardContent() {
    try {
        await ipcRenderer.invoke('clear-llm-clipboard');
        updateLlmClipboardStatus();
        showStatus('LLM clipboard cleared', 'success');
        setTimeout(() => showStatus('Ready'), 2000);
    } catch (error) {
        showStatus('Error clearing LLM clipboard: ' + error.message, 'error');
    }
}

// Function to show/hide Copy Send loading indicator
function showCopySendLoading(show) {
    if (copySendLoadingIndicator) {
        copySendLoadingIndicator.style.display = show ? 'inline-block' : 'none';
    }
}

// RAG Search Functions
function updateRagUI() {
    // Show/hide RAG container based on template type
    const ragContainer = document.querySelector('.rag-search-container');
    
    if (!currentTemplate) {
        // Built-in template or no template selected - hide RAG functionality
        ragContainer.style.display = 'none';
        return;
    }
    
    // User template selected - show RAG functionality
    ragContainer.style.display = 'block';
    
    // Update checkbox state
    ragSearchCheckbox.checked = currentTemplate.ragSearch || false;
    
    // Show/hide associations section
    onRagSearchToggle();
    
    // Render associations
    renderRagAssociations();
}

function onRagSearchToggle() {
    const isChecked = ragSearchCheckbox.checked;
    
    // Show/hide associations section
    ragAssociationsSection.style.display = isChecked ? 'block' : 'none';
    
    // Update current template if available
    if (currentTemplate) {
        currentTemplate.ragSearch = isChecked;
        saveCurrentTemplate();
    }
    
    // Update button state based on new checkbox state
    updateAddButtonState();
}

function renderRagAssociations() {
    if (!currentTemplate || !currentTemplate.ragAssociations) {
        ragAssociationsList.innerHTML = '<div class="rag-empty-state">No RAG associations configured</div>';
        updateAddButtonState();
        return;
    }
    
    if (currentTemplate.ragAssociations.length === 0) {
        ragAssociationsList.innerHTML = '<div class="rag-empty-state">No RAG associations configured</div>';
        updateAddButtonState();
        return;
    }
    
    // Render each association
    ragAssociationsList.innerHTML = currentTemplate.ragAssociations.map((assoc, index) => {
        const ragStore = ragStores.find(store => store.id === assoc.ragStoreId);
        const ragStoreName = ragStore ? ragStore.name : 'Unknown RAG Store';
        
        return `
            <div class="rag-association-item" data-index="${index}">
                <div class="rag-association-header">
                    <div class="rag-association-name">${ragStoreName}</div>
                    <button class="rag-association-remove" onclick="removeRagAssociation(${index})">Remove</button>
                </div>
                <div class="rag-association-controls">
                    <div class="rag-control-group">
                        <label>Max Results (1-20):</label>
                        <input type="number" class="rag-control-input" min="1" max="20" 
                               value="${assoc.maxResults || 8}" 
                               onchange="updateRagAssociation(${index}, 'maxResults', this.value)">
                    </div>
                    <div class="rag-control-group">
                        <div class="rag-control-checkbox">
                            <input type="checkbox" 
                                   ${assoc.includeResults ? 'checked' : ''} 
                                   onchange="updateRagAssociation(${index}, 'includeResults', this.checked)">
                            <label>Include results in response</label>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Update add button state
    updateAddButtonState();
}

function updateAddButtonState() {
    const maxAssociations = 5;
    
    if (!currentTemplate) {
        // No template selected - disable button
        addRagAssociationBtn.disabled = true;
        addRagAssociationBtn.textContent = 'Add RAG Association (0/5)';
        return;
    }
    
    if (!currentTemplate.ragSearch) {
        // RAG search disabled - disable button
        addRagAssociationBtn.disabled = true;
        addRagAssociationBtn.textContent = 'Add RAG Association (0/5)';
        return;
    }
    
    const currentCount = currentTemplate.ragAssociations?.length || 0;
    addRagAssociationBtn.disabled = currentCount >= maxAssociations;
    addRagAssociationBtn.textContent = currentCount >= maxAssociations ? 
        'Max Associations (5)' : `Add RAG Association (${currentCount}/5)`;
}

function addRagAssociation() {
    if (!currentTemplate) return;
    
    // Check if we have RAG stores available
    if (ragStores.length === 0) {
        alert('No RAG stores available. Please create a RAG store first.');
        return;
    }
    
    // Check max associations limit
    if (currentTemplate.ragAssociations.length >= 5) {
        alert('Maximum of 5 RAG associations allowed per template.');
        return;
    }
    
    // Show selection modal
    showRagAssociationModal();
}

function showRagAssociationModal() {
    // Create modal HTML
    const modalHTML = `
        <div class="rag-association-modal" id="ragAssociationModal">
            <div class="rag-association-modal-content">
                <div class="rag-association-modal-header">
                    <h3>Add RAG Association</h3>
                    <span class="rag-association-modal-close" onclick="hideRagAssociationModal()">&times;</span>
                </div>
                <div class="rag-association-modal-body">
                    <div class="form-group">
                        <label for="ragAssociationSelect">Select RAG Store:</label>
                        <select id="ragAssociationSelect" class="modal-input">
                            <option value="">Choose a RAG store...</option>
                            ${ragStores.map(store => `<option value="${store.id}">${store.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="ragAssociationMaxResults">Max Results (1-20):</label>
                        <input type="number" id="ragAssociationMaxResults" class="modal-input" min="1" max="20" value="8">
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="ragAssociationIncludeResults" checked>
                            Include search results in response
                        </label>
                    </div>
                </div>
                <div class="rag-association-modal-footer">
                    <button onclick="saveRagAssociation()" class="btn btn-primary">Add</button>
                    <button onclick="hideRagAssociationModal()" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function hideRagAssociationModal() {
    const modal = document.getElementById('ragAssociationModal');
    if (modal) {
        modal.remove();
    }
}

function saveRagAssociation() {
    const select = document.getElementById('ragAssociationSelect');
    const maxResults = document.getElementById('ragAssociationMaxResults');
    const includeResults = document.getElementById('ragAssociationIncludeResults');
    
    if (!select.value) {
        alert('Please select a RAG store.');
        return;
    }
    
    // Check for duplicates
    const isDuplicate = currentTemplate.ragAssociations.some(assoc => assoc.ragStoreId === select.value);
    if (isDuplicate) {
        alert('This RAG store is already associated with this template.');
        return;
    }
    
    // Add new association
    const newAssociation = {
        ragStoreId: select.value,
        maxResults: parseInt(maxResults.value) || 8,
        includeResults: includeResults.checked
    };
    
    currentTemplate.ragAssociations.push(newAssociation);
    saveCurrentTemplate();
    renderRagAssociations();
    hideRagAssociationModal();
}

function removeRagAssociation(index) {
    if (!currentTemplate || !currentTemplate.ragAssociations) return;
    
    if (confirm('Remove this RAG association?')) {
        currentTemplate.ragAssociations.splice(index, 1);
        saveCurrentTemplate();
        renderRagAssociations();
    }
}

function updateRagAssociation(index, field, value) {
    if (!currentTemplate || !currentTemplate.ragAssociations[index]) return;
    
    if (field === 'maxResults') {
        value = parseInt(value);
        if (value < 1) value = 1;
        if (value > 20) value = 20;
    }
    
    currentTemplate.ragAssociations[index][field] = value;
    saveCurrentTemplate();
}

async function saveCurrentTemplate() {
    if (!currentTemplate) return;
    
    // Update the template in the array
    const index = userTemplates.findIndex(t => t.id === currentTemplate.id);
    if (index !== -1) {
        userTemplates[index] = currentTemplate;
        window.userTemplates = userTemplates;
        await ipcRenderer.invoke('save-instruction-templates', userTemplates);
    }
}

// File Upload Functions
function toggleUploadMode() {
    const isUploadMode = uploadModeCheckbox.checked;
    
    if (isUploadMode) {
        fileUploadSection.style.display = 'block';
        vectorStoreIdSection.style.display = 'none';
        ragModalSave.textContent = 'Create Vector Store';
    } else {
        fileUploadSection.style.display = 'none';
        vectorStoreIdSection.style.display = 'block';
        ragModalSave.textContent = 'Save';
        resetFileUpload();
    }
}

function handleFileSelection(event) {
    const file = event.target.files[0];
    if (file) {
        validateAndDisplayFile(file);
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    fileUploadContainer.style.borderColor = '#007bff';
    fileUploadContainer.style.backgroundColor = '#f0f8ff';
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    fileUploadContainer.style.borderColor = '#ddd';
    fileUploadContainer.style.backgroundColor = '#f9f9f9';
}

function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    fileUploadContainer.style.borderColor = '#ddd';
    fileUploadContainer.style.backgroundColor = '#f9f9f9';
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        fileUploadInput.files = files;
        validateAndDisplayFile(file);
    }
}

function validateAndDisplayFile(file) {
    // File size validation (20MB)
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
        showStatus(`File size (${formatFileSize(file.size)}) exceeds 20MB limit`, 'error');
        resetFileUpload();
        return;
    }
    
    // Check for empty files
    if (file.size === 0) {
        showStatus('Cannot upload empty files', 'error');
        resetFileUpload();
        return;
    }
    
    // File type validation
    const allowedTypes = [
        'text/plain', 'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/markdown', 'application/json', 'text/csv'
    ];
    
    const allowedExtensions = ['.txt', '.pdf', '.doc', '.docx', '.md', '.json', '.csv'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        showStatus('Unsupported file type. Please select TXT, PDF, DOC, DOCX, MD, JSON, or CSV files.', 'error');
        resetFileUpload();
        return;
    }
    
    // Additional validation for potentially problematic files
    if (fileExtension === '.pdf' && file.size > 5 * 1024 * 1024) {
        showStatus('Large PDF files may take longer to process. Please wait...', 'warning');
    }
    
    // Display file info
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    selectedFileName.textContent = `${file.name} (${fileSizeMB}MB)`;
    
    // Color code based on file size
    if (file.size > 10 * 1024 * 1024) { // > 10MB
        selectedFileName.style.color = '#ffc107'; // Warning yellow
    } else {
        selectedFileName.style.color = '#28a745'; // Success green
    }
    
    uploadProgressContainer.style.display = 'block';
    updateUploadProgress(0, 'File ready for upload');
}

function resetFileUpload() {
    fileUploadInput.value = '';
    selectedFileName.textContent = 'No file selected';
    selectedFileName.style.color = '#666';
    uploadProgressContainer.style.display = 'none';
    updateUploadProgress(0, 'Preparing upload...');
}

function updateUploadProgress(percentage, status) {
    uploadProgressFill.style.width = `${percentage}%`;
    uploadStatusText.textContent = status;
    uploadPercentage.textContent = `${percentage}%`;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        
        // Handle different file types appropriately
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        
        if (fileExtension === '.pdf' || fileExtension === '.doc' || fileExtension === '.docx') {
            // For binary files, read as ArrayBuffer and then convert to Buffer
            reader.readAsArrayBuffer(file);
        } else {
            // For text files, read as text
            reader.readAsText(file);
        }
    });
}

async function createVectorStoreFromFile(name, file) {
    try {
        // Validate file size (20MB)
        const MAX_FILE_SIZE = 20 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            throw new Error(`File size (${formatFileSize(file.size)}) exceeds 20MB limit`);
        }
        
        // Update progress
        updateUploadProgress(10, 'Reading file...');
        
        // Read file content with timeout
        const fileContent = await Promise.race([
            readFileContent(file),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('File reading timeout - file may be corrupted')), 30000)
            )
        ]);
        
        updateUploadProgress(30, 'Processing content...');
    
    // Create vector store via main process
    const result = await ipcRenderer.invoke('create-vector-store', {
        name,
        fileName: file.name,
        fileContent,
        fileType: file.type,
        fileSize: file.size
    });
    
    updateUploadProgress(100, 'Vector store created successfully!');
    
    // Add to local storage
    const newRagStore = {
        id: result.vectorStoreId,
        name: name,
        vectorStoreId: result.vectorStoreId,
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        createdAt: new Date().toISOString()
    };
    
    ragStores.push(newRagStore);
    await ipcRenderer.invoke('save-rag-stores', ragStores);
    renderRagStoreOptions();
    hideRagStoreModal();
    
    // Select the new RAG store
    ragStoreSelect.value = newRagStore.id;
    showStatus('RAG store created successfully', 'success');
    
    } catch (error) {
        console.error('Error in createVectorStoreFromFile:', error);
        updateUploadProgress(0, 'Upload failed');
        throw error;
    }
}

// RAG Testing Functions
async function testDirectSearch() {
    const query = ragTestQuery.value.trim();
    const selectedStore = ragStores.find(s => s.id === ragStoreSelect.value);
    
    if (!query) {
        showStatus('Please enter a search query', 'error');
        return;
    }
    
    if (!selectedStore) {
        showStatus('Please select a RAG store first', 'error');
        return;
    }
    
    try {
        showStatus('Searching vector store...', 'info');
        
        const results = await ipcRenderer.invoke('search-vector-store', {
            vectorStoreId: selectedStore.vectorStoreId,
            query: query,
            maxResults: parseInt(maxResultsSelect.value) || 5
        });
        
        displaySearchResults(results.results, 'Direct Search Results');
        showStatus('Search completed', 'success');
        
    } catch (error) {
        showStatus(`Search failed: ${error.message}`, 'error');
        console.error('Direct search error:', error);
    }
}

async function testRagQuery() {
    const query = ragTestQuery.value.trim();
    const selectedStore = ragStores.find(s => s.id === ragStoreSelect.value);
    
    if (!query) {
        showStatus('Please enter a query', 'error');
        return;
    }
    
    if (!selectedStore) {
        showStatus('Please select a RAG store first', 'error');
        return;
    }
    
    try {
        showStatus('Generating RAG response...', 'info');
        
        const results = await ipcRenderer.invoke('query-with-rag', {
            vectorStoreId: selectedStore.vectorStoreId,
            query: query,
            model: modelSelect.value || 'gpt-4o-mini',
            maxResults: parseInt(maxResultsSelect.value) || 5
        });
        
        displayRagResults(results);
        showStatus('RAG query completed', 'success');
        
    } catch (error) {
        showStatus(`RAG query failed: ${error.message}`, 'error');
        console.error('RAG query error:', error);
    }
}

function displaySearchResults(results, title) {
    let html = `<h6>${title}</h6>`;
    
    if (results.length === 0) {
        html += '<p><em>No results found</em></p>';
    } else {
        results.forEach((result, index) => {
            const uniqueId = `result-content-${Date.now()}-${index}`;
            const needsTruncation = result.content.length > 300;
            const truncatedContent = result.content.substring(0, 300);
            
            html += `
                <div style="border: 1px solid #eee; margin: 10px 0; padding: 10px; border-radius: 3px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <strong>${result.filename}</strong>
                        <span style="color: #666;">Score: ${result.score.toFixed(3)}</span>
                    </div>
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">
                        File ID: ${result.fileId}
                    </div>
                    ${result.attributes ? `
                        <div style="font-size: 0.85em; color: #777; margin-bottom: 8px;">
                            <strong>Metadata:</strong> ${JSON.stringify(result.attributes)}
                        </div>
                    ` : ''}
                    <div style="background: #f9f9f9; padding: 8px; border-radius: 3px; font-size: 0.9em;">
                        <div id="${uniqueId}" style="max-height: none; overflow: hidden; transition: max-height 0.3s ease-out;">
                            <span class="content-text">${needsTruncation ? truncatedContent + '...' : result.content}</span>
                            ${needsTruncation ? `
                                <span class="expand-btn" data-content-id="${uniqueId}" data-full-content="${escapeHtml(result.content)}" 
                                      style="color: #333; cursor: pointer; margin-left: 5px; font-weight: bold;">
                                    ▼ Show More
                                </span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    ragTestContent.innerHTML = html;
    ragTestResults.style.display = 'block';
    
    // Add event listeners for expand/collapse buttons
    const expandButtons = ragTestContent.querySelectorAll('.expand-btn');
    expandButtons.forEach(button => {
        button.addEventListener('click', function() {
            const contentId = this.getAttribute('data-content-id');
            const fullContent = this.getAttribute('data-full-content');
            toggleContent(contentId, fullContent, this);
        });
    });
}

// Helper function to escape HTML for safe injection
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// Helper function to unescape HTML
function unescapeHtml(escapedText) {
    const div = document.createElement('div');
    div.innerHTML = escapedText.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    return div.textContent;
}

// Toggle content expansion for search results
function toggleContent(elementId, escapedFullContent, buttonElement) {
    const contentElement = document.getElementById(elementId);
    const contentTextElement = contentElement.querySelector('.content-text');
    const isExpanded = buttonElement.textContent.includes('Show Less');
    
    // Unescape the HTML content
    const fullContent = unescapeHtml(escapedFullContent);
    
    if (isExpanded) {
        // Collapse: Show truncated content
        const truncatedContent = fullContent.substring(0, 300) + '...';
        contentTextElement.textContent = truncatedContent;
        buttonElement.innerHTML = '▼ Show More';
        contentElement.style.maxHeight = 'none';
        contentElement.style.overflow = 'hidden';
    } else {
        // Expand: Show full content with scroll
        contentTextElement.textContent = fullContent;
        buttonElement.innerHTML = '▲ Show Less';
        contentElement.style.maxHeight = '400px'; // Maximum height for scrolling
        contentElement.style.overflow = 'auto';
    }
}

function displayRagResults(results) {
    let html = '<h6>RAG Response with Citations</h6>';
    
    // Display the AI response
    html += `
        <div style="border: 1px solid #28a745; margin: 10px 0; padding: 15px; border-radius: 5px; background: #f8fff8;">
            <h6 style="color: #28a745; margin-bottom: 10px;">🤖 AI Response:</h6>
            <div style="line-height: 1.6;">${results.response}</div>
        </div>
    `;
    
    // Display citations
    if (results.citations && results.citations.length > 0) {
        html += `
            <div style="border: 1px solid #007bff; margin: 10px 0; padding: 10px; border-radius: 5px; background: #f0f8ff;">
                <h6 style="color: #007bff; margin-bottom: 8px;">📚 Citations:</h6>
                <ul style="margin: 0; padding-left: 20px;">
        `;
        results.citations.forEach(citation => {
            html += `<li>${citation.filename} (ID: ${citation.fileId})</li>`;
        });
        html += '</ul></div>';
    }
    
    // Display detailed search results if available
    if (results.searchResults && results.searchResults.length > 0) {
        html += '<div style="margin-top: 15px;"><h6>🔍 Underlying Search Results:</h6>';
        results.searchResults.forEach((result, index) => {
            const uniqueId = `rag-result-content-${Date.now()}-${index}`;
            const needsTruncation = result.content.length > 300;
            const truncatedContent = result.content.substring(0, 300);
            
            html += `
                <div style="border: 1px solid #ffc107; margin: 8px 0; padding: 8px; border-radius: 3px; background: #fffef0;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <strong style="color: #856404;">${result.filename}</strong>
                        <span style="color: #856404;">Score: ${result.score.toFixed(3)}</span>
                    </div>
                    <div style="font-size: 0.85em; color: #856404; background: #fff9e6; padding: 5px; border-radius: 2px;">
                        <div id="${uniqueId}" style="max-height: none; overflow: hidden; transition: max-height 0.3s ease-out;">
                            <span class="content-text">${needsTruncation ? truncatedContent + '...' : result.content}</span>
                            ${needsTruncation ? `
                                <span class="expand-btn" data-content-id="${uniqueId}" data-full-content="${escapeHtml(result.content)}" 
                                      style="color: #333; cursor: pointer; margin-left: 5px; font-weight: bold;">
                                    ▼ Show More
                                </span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    ragTestContent.innerHTML = html;
    ragTestResults.style.display = 'block';
    
    // Add event listeners for expand/collapse buttons in RAG results
    const ragExpandButtons = ragTestContent.querySelectorAll('.expand-btn');
    ragExpandButtons.forEach(button => {
        button.addEventListener('click', function() {
            const contentId = this.getAttribute('data-content-id');
            const fullContent = this.getAttribute('data-full-content');
            toggleContent(contentId, fullContent, this);
        });
    });
}

// Validation functions for Max Results input
function validateMaxResults(input) {
    const value = parseInt(input.value);
    const min = parseInt(input.min);
    const max = parseInt(input.max);
    
    if (isNaN(value) || value < min || value > max) {
        // Invalid value - show red border
        input.style.borderColor = '#dc3545';
        input.style.boxShadow = '0 0 0 0.2rem rgba(220, 53, 69, 0.25)';
    } else {
        // Valid value - restore normal border
        input.style.borderColor = '#ddd';
        input.style.boxShadow = 'none';
    }
}

function correctMaxResults(input) {
    const value = parseInt(input.value);
    const min = parseInt(input.min);
    const max = parseInt(input.max);
    
    if (isNaN(value) || input.value === '') {
        // Empty or invalid input - set to default
        input.value = 5;
    } else if (value < min) {
        // Below minimum - set to minimum
        input.value = min;
    } else if (value > max) {
        // Above maximum - set to maximum
        input.value = max;
    }
    
    // Restore normal border after correction
    input.style.borderColor = '#ddd';
    input.style.boxShadow = 'none';
    
    // Trigger save settings if the value changed
    saveSettings();
}

// Debug: Check if RAG test elements are properly loaded
console.log('RAG Test Debug - ragTestQuery element:', ragTestQuery);
console.log('RAG Test Debug - ragTestQuery disabled?', ragTestQuery ? ragTestQuery.disabled : 'element not found');
console.log('RAG Test Debug - ragTestQuery readonly?', ragTestQuery ? ragTestQuery.readOnly : 'element not found');

// =========================
// WEB SEARCH FUNCTIONS
// =========================

// Initialize web search defaults for templates that don't have them
function initializeWebSearchDefaults(template) {
    if (!template.hasOwnProperty('webSearch')) {
        template.webSearch = false;
    }
    if (!template.hasOwnProperty('webSearchConfig')) {
        template.webSearchConfig = {
            enabled: false,
            maxResults: 5,
            includeResults: true
        };
    }
}

// Handle web search checkbox toggle in main interface
function onWebSearchToggle() {
    const isChecked = webSearchCheckbox.checked;
    
    // Show/hide the options section
    if (webSearchOptionsSection) {
        webSearchOptionsSection.style.display = isChecked ? 'block' : 'none';
    }
    
    // Update the current template
    if (currentTemplate) {
        currentTemplate.webSearch = isChecked;
        currentTemplate.webSearchConfig.enabled = isChecked;
        saveCurrentTemplate();
    }
}

// Handle web search checkbox in template modal
function onTemplateWebSearchToggle() {
    const isChecked = templateWebSearchCheckbox.checked;
    const configSection = webSearchConfigSection;
    
    if (configSection) {
        configSection.style.display = isChecked ? 'block' : 'none';
    }
}

// Update the results value display
function updateWebSearchResultsValue() {
    const slider = webSearchResultsSlider;
    const valueDisplay = webSearchResultsValue;
    
    if (slider && valueDisplay) {
        valueDisplay.textContent = slider.value;
        
        // Update current template
        if (currentTemplate) {
            currentTemplate.webSearchConfig.maxResults = parseInt(slider.value);
            saveCurrentTemplate();
        }
    }
}

// Update the web search UI when a template is selected
function updateWebSearchUI() {
    const webSearchContainer = document.querySelector('.web-search-container');
    
    if (!webSearchContainer) return;
    
    if (!currentTemplate) {
        // No user template selected - hide web search
        webSearchContainer.style.display = 'none';
        return;
    }
    
    // Make sure template has web search defaults
    initializeWebSearchDefaults(currentTemplate);
    
    // Show web search container
    webSearchContainer.style.display = 'block';
    
    // Update checkbox
    if (webSearchCheckbox) {
        webSearchCheckbox.checked = currentTemplate.webSearch || false;
    }
    
    // Update slider
    if (webSearchResultsSlider && currentTemplate.webSearchConfig) {
        webSearchResultsSlider.value = currentTemplate.webSearchConfig.maxResults || 5;
        updateWebSearchResultsValue();
    }
    
    // Show/hide options
    onWebSearchToggle();
}

// Debug: Check if RAG test elements are properly loaded
console.log('RAG Test Debug - ragTestQuery element:', ragTestQuery);
console.log('RAG Test Debug - ragTestQuery disabled?', ragTestQuery ? ragTestQuery.disabled : 'element not found');
console.log('RAG Test Debug - ragTestQuery readonly?', ragTestQuery ? ragTestQuery.readOnly : 'element not found');

 