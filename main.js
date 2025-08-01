const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const Store = require('electron-store');

const Recorder = require('./modules/recorder');
const EnhancedTranscriber = require('./modules/transcriber-enhanced');
const PromptBuilder = require('./modules/promptBuilder');
const LLMClient = require('./modules/llmClient');
const TextInjector = require('./modules/injector');
const { GlobalKeyboardListener } = require('node-global-key-listener');

// Initialize store for settings
const store = new Store();

let mainWindow;
let recorder;
let transcriber;
let promptBuilder;
let llmClient;
let injector;
let gkl; // Move to global scope for proper cleanup
let isRecording = false;
let winPressed = false;
let altPressed = false;
let ctrlPressed = false;
let shiftPressed = false;
let recordingStartedWith = null; // Track which combination started recording
let llmShortcutsEnabled = true;
let isCleaningUp = false;
let activeTimeouts = new Set();
let cleanupTimeout = null;
// Add new variables for Copy Send feature
let processedLlmResult = null; // Store processed LLM result
let copySendEnabled = false; // Track Copy Send setting
let isProcessingCopy = false; // Track if background processing is happening
let isLlmOperationInProgress = false; // Track if any LLM copy/paste operation is active
let pendingOperations = new Set(); // Track all pending async operations

function createWindow() {
  // Load saved window size or use defaults
  const savedBounds = store.get('window-bounds', {
    width: 600,
    height: 700,  // Increased default height for better usability
    x: undefined,
    y: undefined
  });

  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 400,  // Minimum width for usability
    minHeight: 350, // Minimum height for usability
    // Remove max constraints to allow fullscreen
    maximizable: true, // Enable maximize button
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false, // Allow development flexibility
      allowRunningInsecureContent: true, // For development
      experimentalFeatures: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Voice-to-LLM Assistant',
    resizable: true, // Enable resizing
    alwaysOnTop: store.get('always-on-top', true), // Load saved preference
    show: false // Don't show until ready to prevent flashing
  });

  // Create application menu
  const { Menu } = require('electron');
  const template = [
    {
      label: 'Window',
      submenu: [
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: store.get('always-on-top', true),
          click: (item) => {
            mainWindow.setAlwaysOnTop(item.checked);
            store.set('always-on-top', item.checked);
          }
        },
        {
          label: 'Maximize Window',
          accelerator: 'F11',
          click: () => {
            if (mainWindow.isMaximized()) {
              mainWindow.unmaximize();
            } else {
              mainWindow.maximize();
            }
          }
        },
        {
          label: 'Reset Window Size',
          click: () => {
            mainWindow.unmaximize();
            mainWindow.setBounds({ width: 600, height: 700 });
            mainWindow.center();
          }
        },
        { type: 'separator' },
        {
          label: 'Dark Mode',
          type: 'checkbox',
          checked: store.get('dark-mode', false),
          click: (item) => {
            const isDarkMode = item.checked;
            store.set('dark-mode', isDarkMode);
            mainWindow.webContents.send('theme-changed', isDarkMode);
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            require('electron').shell.openExternal('https://github.com/your-repo/SpeechLLM');
          }
        },
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'F1',
          click: () => {
            showKeyboardShortcutsDialog();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Load with cache busting for development
  mainWindow.loadFile('index.html');

  // Wait for the window to be ready and clear cache
  mainWindow.webContents.once('did-finish-load', () => {
    // Clear cache to ensure fresh content
    mainWindow.webContents.session.clearCache();
    // console.log('=== MAIN WINDOW LOADED ===');
    // console.log('Window ready, WebContents available');
    
    mainWindow.show(); // Show window after everything is loaded
  });

  // Save window bounds when resized or moved
  mainWindow.on('resize', () => {
    saveWindowBounds();
  });

  mainWindow.on('move', () => {
    saveWindowBounds();
  });

  // Initialize modules
  // console.log('=== INITIALIZING MODULES ===');
  recorder = new Recorder();
  transcriber = new EnhancedTranscriber();
  promptBuilder = new PromptBuilder();
  llmClient = new LLMClient();
  injector = new TextInjector();
  // console.log('=== MODULES INITIALIZED ===');

  // Initialize GlobalKeyboardListener in global scope for proper cleanup
  initializeGlobalKeyboardListener();

  // Handle window close
  mainWindow.on('closed', () => {
    performCleanup();
  });

  // Handle window closing (before closed)
  mainWindow.on('close', (event) => {
    if (!isCleaningUp) {
      // Prevent immediate close to allow cleanup
      event.preventDefault();
      performCleanup().then(() => {
        // Force close after cleanup
        mainWindow.destroy();
      });
    }
  });
}

// Function to show keyboard shortcuts dialog
function showKeyboardShortcutsDialog() {
  const { dialog } = require('electron');
  
  const shortcuts = `
🎤 RECORDING SHORTCUTS:
• Win + Alt (hold to record, release to process)
• Ctrl + Shift (alternative recording combination)

📋 LLM CLIPBOARD SHORTCUTS:
• Ctrl+C (copy selected text → process with LLM → ready to paste)
• Ctrl+V (paste the processed result)

⌨️ APPLICATION SHORTCUTS:
• F1 (show this help)
• F11 (maximize/restore window)
• F12 (toggle developer tools)

📝 WORKFLOW:
1. Select text in any application
2. Press Ctrl+C to copy and process with current instruction template
3. Press Ctrl+V to paste the processed result
4. Or use Win + Alt to record voice and process immediately

💡 TIPS: 
• Enable "LLM Shortcuts" in Settings to use Ctrl+C processing
• Enable "Copy Send" in Settings for Ctrl+C to process text automatically  
• If Copy Send is disabled, Ctrl+C only stores text for manual processing
  `;

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Keyboard Shortcuts - SynapticFlow',
    message: 'Keyboard Shortcuts & Usage Guide',
    detail: shortcuts.trim(),
    buttons: ['OK']
  });
}

// Move GlobalKeyboardListener initialization to separate function for better cleanup
function initializeGlobalKeyboardListener() {
  try {
    // Clean up any existing listener first
    if (gkl) {
      cleanupGlobalKeyboardListener();
    }
    
    // Register global hotkey using node-global-key-listener
    gkl = new GlobalKeyboardListener();
    gkl.addListener((e) => {
      // console.log('KEY EVENT:', e.name, e.state); // Log ALL key events
      
      if (e.state === 'DOWN') {
        // Check for various Windows key names (including LEFT META and RIGHT META)
        if (e.name === 'Left Windows' || e.name === 'Right Windows' || 
            e.name === 'Left Cmd' || e.name === 'Right Cmd' ||
            e.name === 'Left Meta' || e.name === 'Right Meta' ||
            e.name === 'LEFT META' || e.name === 'RIGHT META' ||
            e.name === 'Windows' || e.name === 'Cmd' || e.name === 'Meta') {
          winPressed = true;
          // console.log('Windows/Meta key pressed:', e.name);
        }
        // Check for various Alt key names (including LEFT ALT and RIGHT ALT)
        if (e.name === 'Left Alt' || e.name === 'Right Alt' || e.name === 'Alt' ||
            e.name === 'LEFT ALT' || e.name === 'RIGHT ALT') {
          altPressed = true;
          // console.log('Alt key pressed:', e.name);
        }
        // Check for Ctrl key
        if (e.name === 'Left Ctrl' || e.name === 'Right Ctrl' || e.name === 'Ctrl' ||
            e.name === 'LEFT CTRL' || e.name === 'RIGHT CTRL') {
          ctrlPressed = true;
          // console.log('Ctrl key pressed:', e.name);
        }
        // Check for Shift key
        if (e.name === 'Left Shift' || e.name === 'Right Shift' || e.name === 'Shift' ||
            e.name === 'LEFT SHIFT' || e.name === 'RIGHT SHIFT') {
          shiftPressed = true;
          // console.log('Shift key pressed:', e.name);
        }
        
        // Check for Win+Alt combination
        if (winPressed && altPressed && !isRecording) {
          // console.log('=== HOTKEY DETECTED: Win+Alt pressed ===');
          // console.log('winPressed:', winPressed, 'altPressed:', altPressed, 'isRecording:', isRecording);
          recordingStartedWith = 'win-alt';
          startRecording();
        }
        // Alternative: Check for Ctrl+Shift combination
        if (ctrlPressed && shiftPressed && !isRecording) {
          // console.log('=== ALTERNATIVE HOTKEY DETECTED: Ctrl+Shift pressed ===');
          // console.log('ctrlPressed:', ctrlPressed, 'shiftPressed:', shiftPressed, 'isRecording:', isRecording);
          recordingStartedWith = 'ctrl-shift';
          startRecording();
        }

        // Check for Ctrl+C combination (LLM processing)
        if (ctrlPressed && e.name === 'C' && !isRecording && llmShortcutsEnabled) {
          console.log('=== LLM COPY TRIGGERED (Ctrl+C) ===');
          // Small delay to allow normal copy to complete, then process
          setTimeout(() => {
            handleLlmCopyFromClipboard();
          }, 100);
        }

        // Ctrl+C now handles the complete workflow: capture → process → clipboard
        
        // Check for F1 key (Help)
        if (e.name === 'F1') {
          console.log('=== F1 HELP TRIGGERED ===');
          showKeyboardShortcutsDialog();
        }
      } else if (e.state === 'UP') {
        // Check for various Windows key names (including LEFT META and RIGHT META)
        if (e.name === 'Left Windows' || e.name === 'Right Windows' || 
            e.name === 'Left Cmd' || e.name === 'Right Cmd' ||
            e.name === 'Left Meta' || e.name === 'Right Meta' ||
            e.name === 'LEFT META' || e.name === 'RIGHT META' ||
            e.name === 'Windows' || e.name === 'Cmd' || e.name === 'Meta') {
          winPressed = false;
          // console.log('Windows/Meta key released:', e.name);
        }
        // Check for various Alt key names (including LEFT ALT and RIGHT ALT)
        if (e.name === 'Left Alt' || e.name === 'Right Alt' || e.name === 'Alt' ||
            e.name === 'LEFT ALT' || e.name === 'RIGHT ALT') {
          altPressed = false;
          // console.log('Alt key released:', e.name);
        }
        // Check for Ctrl key release
        if (e.name === 'Left Ctrl' || e.name === 'Right Ctrl' || e.name === 'Ctrl' ||
            e.name === 'LEFT CTRL' || e.name === 'RIGHT CTRL') {
          ctrlPressed = false;
          // console.log('Ctrl key released:', e.name);
        }
        // Check for Shift key release
        if (e.name === 'Left Shift' || e.name === 'Right Shift' || e.name === 'Shift' ||
            e.name === 'LEFT SHIFT' || e.name === 'RIGHT SHIFT') {
          shiftPressed = false;
          // console.log('Shift key released:', e.name);
        }
        
        // Stop recording when the active hotkey combination is released
        if (isRecording && recordingStartedWith) {
          let shouldStop = false;
          
          if (recordingStartedWith === 'win-alt' && (!winPressed || !altPressed)) {
            shouldStop = true;
          } else if (recordingStartedWith === 'ctrl-shift' && (!ctrlPressed || !shiftPressed)) {
            shouldStop = true;
          }
          
          if (shouldStop) {
            // console.log('=== HOTKEY RELEASED: Recording combination released ===');
            // console.log('recordingStartedWith:', recordingStartedWith);
            // console.log('winPressed:', winPressed, 'altPressed:', altPressed);
            // console.log('ctrlPressed:', ctrlPressed, 'shiftPressed:', shiftPressed);
            recordingStartedWith = null;
            stopRecording();
          }
        }
      }
    });
    
    console.log('✅ GlobalKeyboardListener initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize GlobalKeyboardListener:', error.message);
  }
}

function saveWindowBounds() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    store.set('window-bounds', bounds);
    // console.log('Window bounds saved:', bounds);
  }
}

async function startRecording() {
  try {
    // console.log('=== START RECORDING FUNCTION CALLED ===');
    // console.log('Setting isRecording to true and updating status...');
    isRecording = true;
    mainWindow.webContents.send('status-update', 'Listening...');
    
    // console.log('Calling recorder.start()...');
    await recorder.start();
    // console.log('=== RECORDING STARTED SUCCESSFULLY ===');
    
  } catch (error) {
    // console.error('=== ERROR IN START RECORDING ===');
    // console.error('Error details:', error);
    // console.error('Error stack:', error.stack);
    mainWindow.webContents.send('status-update', 'Error: ' + error.message);
    isRecording = false;
  }
}

async function stopRecording() {
  const workflowStartTime = Date.now();
  
  try {
    // console.log('=== STOP RECORDING CALLED ===');
    // console.log('Current isRecording state:', isRecording);
    // console.log('Recorder state:', recorder ? recorder.isRecording() : 'recorder not available');
    
    if (!isRecording && (!recorder || !recorder.isRecording())) {
      // console.log('Not recording, ignoring stop request');
      return;
    }
    
    isRecording = false;
    recordingStartedWith = null; // Reset the recording combination tracker
    mainWindow.webContents.send('status-update', 'Processing audio...');
    
    // Stop recording and get audio data
    let audioData;
    const recordingStopTime = Date.now();
    try {
      audioData = await recorder.stop();
      const recordingStopDuration = Date.now() - recordingStopTime;
      // console.log(`Recording stopped in ${recordingStopDuration}ms, audio data received:`, !!audioData);
    } catch (stopError) {
      // console.error('Error stopping recorder:', stopError);
      // Reset recording state on error
      isRecording = false;
      if (recorder) {
        recorder.recording = false; // Force reset recorder state
      }
      throw stopError;
    }
    
    // Enhanced: Transcribe audio with chunking support
    mainWindow.webContents.send('status-update', 'Analyzing audio file...');
    const transcriptionStartTime = Date.now();
    
    let transcript; // Declare transcript variable outside try block
    try {
      transcript = await transcriber.transcribe(audioData);
      const transcriptionDuration = Date.now() - transcriptionStartTime;
      console.log(`Enhanced transcription completed in ${transcriptionDuration}ms`);
      
      if (!transcript || transcript.trim().length === 0) {
        throw new Error('No speech detected in audio');
      }
      
      mainWindow.webContents.send('status-update', 'Transcription complete ✅');
      
      // Brief pause to show completion status
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (transcriptionError) {
      console.error('Transcription failed:', transcriptionError.message);
      mainWindow.webContents.send('status-update', `Transcription error: ${transcriptionError.message}`);
      throw transcriptionError;
    }
    
    mainWindow.webContents.send('status-update', 'Thinking...');
    
    // Get instruction, RAG, and web search configuration from renderer
    const { instruction, ragAssociations, webSearchConfig } = await getInstructionAndRagFromRenderer();
    
    console.log('🎤 AUDIO PROCESSING - Configuration received:');
    console.log('- Instruction preview:', instruction.substring(0, 50) + '...');
    console.log('- RAG associations count:', ragAssociations.length);
    console.log('- Web search enabled:', webSearchConfig.enabled);
    console.log('- Full web search config:', JSON.stringify(webSearchConfig, null, 2));
    
    // Build prompt using existing promptBuilder
    const prompt = promptBuilder.build(instruction, transcript);
    
    // Get LLM response using smart method with web search support
    const llmStartTime = Date.now();
    const response = await llmClient.getResponseSmart(prompt, ragAssociations, webSearchConfig);
    
    const llmDuration = Date.now() - llmStartTime;
    // console.log(`LLM response completed in ${llmDuration}ms`);
    
    // Handle both old string format and new object format for backward compatibility
    const responseText = typeof response === 'string' ? response : response.text;
    const webSearchUsed = typeof response === 'object' ? response.webSearchUsed : false;
    const ragUsed = typeof response === 'object' ? response.ragUsed : false;
    const citations = typeof response === 'object' ? response.citations : [];
    
    console.log('📊 Response Summary:', {
      textLength: responseText.length,
      webSearchUsed: webSearchUsed,
      ragUsed: ragUsed,
      citationsCount: citations.length,
      processingTime: llmDuration + 'ms'
    });
    
    // Send transcript and enhanced response to UI
    mainWindow.webContents.send('transcript-update', transcript);
    mainWindow.webContents.send('response-update', {
      text: responseText,
      webSearchUsed: webSearchUsed,
      ragUsed: ragUsed,
      citations: citations,
      processingTime: llmDuration
    });
    
    // Inject response (use text content for injection)
    const injectionResult = await injector.injectText(responseText);
    // Auto-paste if enabled
    if (injectionResult.success && store.get('auto-paste', true)) {
      if (process.platform === 'darwin') {
        exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
      } else if (process.platform === 'win32') {
        exec(`powershell -WindowStyle Hidden -command "Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('^v')"`);
      } else {
        exec(`xdotool key --clearmodifiers ctrl+v`);
      }
    }
    const totalWorkflowTime = Date.now() - workflowStartTime;
    // console.log(`=== COMPLETE WORKFLOW FINISHED in ${totalWorkflowTime}ms ===`);
    // console.log(`Breakdown: Recording=${recordingStopTime - workflowStartTime}ms, Transcription=${transcriptionDuration}ms, LLM=${llmDuration}ms`);
    
    if (injectionResult.success) {
      mainWindow.webContents.send('status-update', `Done in ${(totalWorkflowTime/1000).toFixed(1)}s - Ctrl+V to paste`);
    } else {
      mainWindow.webContents.send('status-update', 'Error: ' + injectionResult.error);
    }
    
  } catch (error) {
    const totalTime = Date.now() - workflowStartTime;
    // console.error(`Error in recording workflow after ${totalTime}ms:`, error);
    mainWindow.webContents.send('status-update', 'Error: ' + error.message);
    // Ensure state is reset on any error
    isRecording = false;
  }
}

// LLM Clipboard Functions - simplified with Electron clipboard

async function handleLlmCopyFromClipboard() {
  // Prevent concurrent operations
  if (isLlmOperationInProgress) {
    console.log('=== LLM COPY BLOCKED: Operation in progress ===');
    mainWindow.webContents.send('status-update', 'Processing...');
    return;
  }
  
  console.log('=== CTRL+C TRIGGERED ===');
  console.log('Copy Send enabled:', copySendEnabled);
  
  const operationId = Date.now();
  isLlmOperationInProgress = true;
  pendingOperations.add(operationId);
  
  try {
    // Step 1: Read text from clipboard (user already copied it with Ctrl+C)
    const selectedText = clipboard.readText();
    
    if (!selectedText || selectedText.trim().length === 0) {
      console.log('=== CTRL+C FAILED: No text in clipboard ===');
      mainWindow.webContents.send('status-update', 'No text in clipboard');
      return;
    }
    
    console.log('Clipboard text length:', selectedText.length);
    
    // Truncate if too long
    const truncatedText = selectedText.length > 10000 ? 
      selectedText.substring(0, 10000) + '...' : selectedText;
    
    // Store in LLM clipboard for UI display
    global.llmClipboard = {
      text: truncatedText,
      timestamp: new Date().toISOString()
    };
    
    mainWindow.webContents.send('llm-clipboard-updated');
    
    if (copySendEnabled) {
      // Step 2: Process with LLM immediately
      console.log('Processing with LLM...');
      mainWindow.webContents.send('status-update', 'Processing with LLM...');
      
      // Get current instruction template, RAG, and web search configuration
      const { instruction, ragAssociations, webSearchConfig } = await getInstructionAndRagFromRenderer();
      
      console.log('LLM clipboard processing with:', {
        ragAssociations: ragAssociations.length,
        webSearchEnabled: webSearchConfig.enabled
      });
      
      // Build prompt using existing promptBuilder
      const prompt = promptBuilder.build(instruction, truncatedText);
      
      // Get LLM response using smart method with web search support
      const response = await llmClient.getResponseSmart(prompt, ragAssociations, webSearchConfig);
      
      // Handle both old string format and new object format for backward compatibility
      const responseText = typeof response === 'string' ? response : response.text;
      const webSearchUsed = typeof response === 'object' ? response.webSearchUsed : false;
      const ragUsed = typeof response === 'object' ? response.ragUsed : false;
      const citations = typeof response === 'object' ? response.citations : [];
      
      // Log enhanced LLM response for verification
      console.log('📊 LLM Clipboard Response Summary:', {
        textLength: responseText.length,
        webSearchUsed: webSearchUsed,
        ragUsed: ragUsed,
        citationsCount: citations.length
      });
      
      // Step 3: Put result directly in clipboard using Electron's clipboard
      clipboard.writeText(responseText);
      
      console.log('=== CTRL+C SUCCESS: Text processed and ready to paste ===');
      mainWindow.webContents.send('status-update', '✅ Ready to paste - Press Ctrl+V');
      
    } else {
      // Copy Send disabled - just store in LLM clipboard
      console.log('Copy Send disabled - text stored for manual processing');
      mainWindow.webContents.send('status-update', `Stored ${truncatedText.length} chars in LLM clipboard`);
    }
    
  } catch (error) {
    console.error('Ctrl+C processing error:', error);
    mainWindow.webContents.send('status-update', 'Error: ' + error.message);
    
    // Clear any incomplete state
    global.llmClipboard = null;
    mainWindow.webContents.send('llm-clipboard-updated');
  } finally {
    isLlmOperationInProgress = false;
    pendingOperations.delete(operationId);
  }
}

// handleLlmPaste function removed - F10 no longer used
// Ctrl+C now handles the complete workflow: capture → process → clipboard

// Function to get instruction template from renderer
async function getInstructionFromRenderer() {
  try {
    return await mainWindow.webContents.executeJavaScript(`
      (function() {
        const templateSelect = document.getElementById('templateSelect');
        const instructionInput = document.getElementById('instructionInput');
        
        if (templateSelect && templateSelect.value && templateSelect.value.trim() !== '') {
          // Check if it's a user template
          if (window.userTemplates) {
            const userTemplate = window.userTemplates.find(t => t.id === templateSelect.value);
            if (userTemplate) {
              return userTemplate.content;
            }
          }
          
          return 'Please process the following text:';
        } else if (instructionInput && instructionInput.value.trim()) {
          return instructionInput.value.trim();
        } else {
          return 'Please process the following text:';
        }
      })()
    `);
  } catch (error) {
    console.error('Error getting instruction from renderer:', error);
    return 'Please process the following text:';
  }
}

// Function to get instruction and RAG information from renderer
async function getInstructionAndRagFromRenderer() {
  try {
    return await mainWindow.webContents.executeJavaScript(`
      (function() {
        const templateSelect = document.getElementById('templateSelect');
        const instructionInput = document.getElementById('instructionInput');
        
        let instruction = '';
        let ragAssociations = [];
        let webSearchConfig = { enabled: false }; // Initialize webSearchConfig with default
        
        console.log('=== getInstructionAndRagFromRenderer DEBUG ===');
        console.log('templateSelect.value:', templateSelect ? templateSelect.value : 'templateSelect not found');
        console.log('window.userTemplates available:', !!window.userTemplates);
        console.log('window.ragStores available:', !!window.ragStores);
        
        // Force reload of user templates and RAG stores if they're not available
        if (!window.userTemplates || !window.ragStores) {
          console.log('FORCE RELOADING: userTemplates or ragStores not available');
          // Reload from storage immediately
          if (typeof loadSettings === 'function') {
            try {
              // Force reload of userTemplates and ragStores
              const ipcRenderer = require('electron').ipcRenderer;
              window.userTemplates = ipcRenderer.sendSync('get-instruction-templates-sync') || [];
              window.ragStores = ipcRenderer.sendSync('get-rag-stores-sync') || [];
              console.log('RELOADED - userTemplates:', window.userTemplates.length);
              console.log('RELOADED - ragStores:', window.ragStores.length);
            } catch (e) {
              console.error('Failed to reload templates/stores:', e);
              window.userTemplates = [];
              window.ragStores = [];
            }
          }
        }
        
        if (window.userTemplates) {
          console.log('userTemplates length:', window.userTemplates.length);
          console.log('userTemplates:', window.userTemplates.map(t => ({ id: t.id, name: t.name, ragSearch: t.ragSearch })));
        }
        if (window.ragStores) {
          console.log('ragStores length:', window.ragStores.length);
          console.log('ragStores:', window.ragStores.map(s => ({ id: s.id, name: s.name, vectorStoreId: s.vectorStoreId })));
        }
        
        if (templateSelect && templateSelect.value && templateSelect.value.trim() !== '') {
          // Check if it's a user template
          if (window.userTemplates) {
            // Check if it's a user template
            const userTemplate = window.userTemplates.find(t => t.id === templateSelect.value);
            if (userTemplate) {
              instruction = userTemplate.content;
              
              // Get RAG associations if RAG search is enabled
              if (userTemplate.ragSearch && userTemplate.ragAssociations) {
                console.log('Processing RAG associations for template:', userTemplate.name);
                console.log('Template ragSearch:', userTemplate.ragSearch);
                console.log('Template ragAssociations:', userTemplate.ragAssociations);
                
                ragAssociations = userTemplate.ragAssociations.map(assoc => {
                  // Find the corresponding RAG store to get vector store ID
                  const ragStore = window.ragStores ? window.ragStores.find(store => store.id === assoc.ragStoreId) : null;
                  console.log('Looking for RAG store with ID:', assoc.ragStoreId);
                  console.log('Found RAG store:', ragStore);
                  
                  return {
                    vectorStoreId: ragStore ? ragStore.vectorStoreId : null,
                    maxResults: assoc.maxResults || 8,
                    includeResults: assoc.includeResults !== false
                  };
                }).filter(assoc => assoc.vectorStoreId); // Filter out invalid associations
                
                console.log('Final ragAssociations after processing:', ragAssociations);
              }
              
              // Get web search configuration (NEW)
              console.log('🔍 Checking web search for template:', userTemplate.name);
              console.log('Template.webSearch:', userTemplate.webSearch);
              console.log('Template.webSearchConfig:', userTemplate.webSearchConfig);
              
              if (userTemplate.webSearch && userTemplate.webSearchConfig) {
                console.log('✅ Processing web search config for template:', userTemplate.name);
                webSearchConfig = {
                  enabled: userTemplate.webSearchConfig.enabled,
                  maxResults: userTemplate.webSearchConfig.maxResults || 5,
                  includeResults: userTemplate.webSearchConfig.includeResults !== false
                };
                console.log('🌐 Final web search config:', webSearchConfig);
              } else {
                console.log('❌ No web search configured for template');
                console.log('userTemplate.webSearch:', userTemplate.webSearch);
                console.log('userTemplate.webSearchConfig exists:', !!userTemplate.webSearchConfig);
              }
            }
          }
          
          if (!instruction) {
            instruction = 'Please process the following text:';
          }
        } else if (instructionInput && instructionInput.value.trim()) {
          instruction = instructionInput.value.trim();
        } else {
          instruction = 'Please process the following text:';
        }
        
        console.log('🔄 Final values being returned:');
        console.log('- Instruction length:', instruction.length);
        console.log('- RAG associations count:', ragAssociations.length);
        console.log('- Web search config:', JSON.stringify(webSearchConfig, null, 2));
        
        return {
          instruction: instruction,
          ragAssociations: ragAssociations,
          webSearchConfig: webSearchConfig
        };
      })()
    `);
  } catch (error) {
    console.error('Error getting instruction and RAG from renderer:', error);
    return {
      instruction: 'Please process the following text:',
      ragAssociations: [],
      webSearchConfig: { enabled: false }
    };
  }
}

// NEW: Function to process LLM in background
async function processLlmInBackground(text) {
  if (isProcessingCopy) {
    console.log('Already processing copy, skipping...');
    return;
  }
  
  isProcessingCopy = true;
  mainWindow.webContents.send('copy-processing-started');
  mainWindow.webContents.send('status-update', 'Processing LLM in background...');
  
  try {
    // Get current instruction template, RAG, and web search configuration
    const { instruction, ragAssociations, webSearchConfig } = await getInstructionAndRagFromRenderer();
    
    console.log('LLM clipboard processing with:', {
      ragAssociations: ragAssociations.length,
      webSearchEnabled: webSearchConfig.enabled
    });
    
    // Build prompt using existing promptBuilder
    const prompt = promptBuilder.build(instruction, text);
    
    // Debug: Log RAG and web search information before LLM call
    console.log('=== RAG & WEB SEARCH DEBUG INFO ===');
    console.log('Template instruction:', instruction.substring(0, 100) + '...');
    console.log('RAG associations found:', ragAssociations.length);
    console.log('RAG associations details:', JSON.stringify(ragAssociations, null, 2));
    console.log('Will use RAG?', ragAssociations && ragAssociations.length > 0);
    console.log('Web search enabled?', webSearchConfig.enabled);
    
    // Get LLM response using smart method with web search support
    const response = await llmClient.getResponseSmart(prompt, ragAssociations, webSearchConfig);
    
    // Handle both old string format and new object format for backward compatibility
    const responseText = typeof response === 'string' ? response : response.text;
    const webSearchUsed = typeof response === 'object' ? response.webSearchUsed : false;
    const ragUsed = typeof response === 'object' ? response.ragUsed : false;
    const citations = typeof response === 'object' ? response.citations : [];
    
    console.log('📊 Background LLM Processing Summary:', {
      textLength: responseText.length,
      webSearchUsed: webSearchUsed,
      ragUsed: ragUsed,
      citationsCount: citations.length
    });
    
    // Store the processed result in memory
    processedLlmResult = {
      text: responseText,
      webSearchUsed: webSearchUsed,
      ragUsed: ragUsed,
      citations: citations,
      timestamp: new Date().toISOString(),
      originalText: text,
      instruction: instruction
    };
    
    mainWindow.webContents.send('copy-processing-completed');
    mainWindow.webContents.send('status-update', 'LLM processing completed - ready to paste');
    
  } catch (error) {
    console.error('Background LLM processing error:', error);
    mainWindow.webContents.send('copy-processing-error', error.message);
    mainWindow.webContents.send('status-update', 'Background LLM processing failed: ' + error.message);
    
    // Clear any previous result on error
    processedLlmResult = null;
  } finally {
    isProcessingCopy = false;
  }
}

// Resource Cleanup Functions
function clearAllTimeouts() {
  try {
    console.log(`Clearing ${activeTimeouts.size} active timeouts...`);
    for (const timeoutId of activeTimeouts) {
      clearTimeout(timeoutId);
    }
    activeTimeouts.clear();
  } catch (error) {
    console.warn('Error clearing timeouts:', error.message);
  }
}

// Enhanced cleanup for pending operations
function abortPendingOperations() {
  try {
    console.log(`Aborting ${pendingOperations.size} pending operations...`);
    pendingOperations.clear();
    isLlmOperationInProgress = false;
    isProcessingCopy = false;
    processedLlmResult = null; // Clear processed result
    console.log('All pending operations aborted');
  } catch (error) {
    console.error('Error aborting operations:', error.message);
  }
}

function cleanupGlobalShortcuts() {
  try {
    console.log('Cleaning up global shortcuts...');
    const { globalShortcut } = require('electron');
    globalShortcut.unregisterAll();
    console.log('All global shortcuts unregistered');
  } catch (error) {
    console.warn('Error cleaning up global shortcuts:', error.message);
  }
}

// Enhanced cleanup for GlobalKeyboardListener with proper error handling
function cleanupGlobalKeyboardListener() {
  try {
    console.log('🧹 Cleaning up GlobalKeyboardListener...');
    if (gkl) {
      // Try multiple cleanup methods (library may have different versions)
      if (typeof gkl.destroy === 'function') {
        gkl.destroy();
        console.log('✅ GlobalKeyboardListener destroyed');
      } else if (typeof gkl.removeAllListeners === 'function') {
        gkl.removeAllListeners();
        console.log('✅ GlobalKeyboardListener listeners removed');
      } else if (typeof gkl.stop === 'function') {
        gkl.stop();
        console.log('✅ GlobalKeyboardListener stopped');
      } else if (typeof gkl.kill === 'function') {
        gkl.kill();
        console.log('✅ GlobalKeyboardListener killed');
      } else {
        console.log('⚠️ No cleanup method found for GlobalKeyboardListener, forcing null assignment');
      }
      
      // Force garbage collection by setting to null
      gkl = null;
      console.log('✅ GlobalKeyboardListener reference cleared');
    } else {
      console.log('ℹ️ GlobalKeyboardListener was already null');
    }
  } catch (error) {
    // If cleanup fails, log but don't prevent app closing
    console.warn('⚠️ GlobalKeyboardListener cleanup failed:', error.message);
    // Force null assignment even if cleanup fails
    gkl = null;
  }
}

async function cleanupModules() {
  try {
    console.log('🧹 Cleaning up modules...');
    
    // Phase 1: Stop active system resources (100ms max each)
    if (recorder) {
      try {
        await Promise.race([
          recorder.stop(),
          new Promise(resolve => setTimeout(resolve, 100))
        ]);
        console.log('✅ Recorder stopped');
        
        // Call cleanup method if available
        if (typeof recorder.cleanup === 'function') {
          recorder.cleanup();
          console.log('✅ Recorder cleanup completed');
        }
      } catch (error) {
        console.warn('⚠️ Recorder cleanup failed:', error.message);
      }
    }
    
    // Phase 2: Cleanup other modules with enhanced safety
    if (transcriber) {
      try {
        // Close any pending OpenAI connections and clear timers
        if (transcriber.openai) {
          transcriber.openai = null;
        }
        // Clear any pending transcription timers or intervals
        if (typeof transcriber.cleanup === 'function') {
          transcriber.cleanup();
        }
        console.log('✅ Transcriber cleaned up');
      } catch (error) {
        console.warn('⚠️ Transcriber cleanup failed:', error.message);
      }
    }
    
    if (llmClient) {
      try {
        // Close any pending connections and clear request queues
        if (typeof llmClient.cleanup === 'function') {
          llmClient.cleanup();
        }
        llmClient = null;
        console.log('✅ LLM Client cleaned up');
      } catch (error) {
        console.warn('⚠️ LLM Client cleanup failed:', error.message);
      }
    }
    
    if (injector) {
      try {
        // Clear any pending injection operations
        if (typeof injector.cleanup === 'function') {
          injector.cleanup();
        }
        injector = null;
        console.log('✅ Text Injector cleaned up');
      } catch (error) {
        console.warn('⚠️ Text Injector cleanup failed:', error.message);
      }
    }
    
    // Force garbage collection hint (if available)
    if (global.gc) {
      global.gc();
      console.log('✅ Forced garbage collection');
    }
    
  } catch (error) {
    console.warn('⚠️ Module cleanup error:', error.message);
  }
}

function clearMemoryReferences() {
  try {
    console.log('🧹 Clearing memory references...');
    
    // Clear global LLM clipboard
    global.llmClipboard = null;
    
    // Clear new Copy Send references
    processedLlmResult = null;
    isProcessingCopy = false;
    
    // Clear operation state flags
    isLlmOperationInProgress = false;
    isRecording = false;
    isCleaningUp = false;
    
    // Clear key state tracking
    winPressed = false;
    altPressed = false;
    ctrlPressed = false;
    shiftPressed = false;
    recordingStartedWith = null;
    
    // Clear module references
    recorder = null;
    transcriber = null;
    promptBuilder = null;
    llmClient = null;
    injector = null;
    
    // Clear window reference (will be null after close anyway, but explicit)
    if (mainWindow && mainWindow.isDestroyed()) {
      mainWindow = null;
    }
    
    console.log('✅ Memory references cleared');
  } catch (error) {
    console.warn('⚠️ Memory cleanup error:', error.message);
  }
}

async function performCleanup() {
  if (isCleaningUp) {
    console.log('🔄 Cleanup already in progress...');
    return;
  }
  
  isCleaningUp = true;
  const cleanupStartTime = Date.now();
  console.log('🚀 === STARTING COMPREHENSIVE RESOURCE CLEANUP ===');
  
  try {
    // Set maximum cleanup time to prevent hanging (reduced to 3 seconds for responsiveness)
    const cleanupPromise = cleanupInOrder();
    const timeoutPromise = new Promise(resolve => {
      cleanupTimeout = setTimeout(() => {
        console.warn('⏱️ Cleanup timeout reached (3 seconds), forcing shutdown...');
        resolve();
      }, 3000);
    });
    
    // Race between cleanup completion and timeout
    await Promise.race([cleanupPromise, timeoutPromise]);
    
    if (cleanupTimeout) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }
    
  } catch (error) {
    console.error('❌ Cleanup error:', error.message);
  } finally {
    const cleanupDuration = Date.now() - cleanupStartTime;
    console.log(`✅ === CLEANUP COMPLETED in ${cleanupDuration}ms ===`);
    
    // Save window bounds as final step
    saveWindowBounds();
    
    // Force final state reset
    process.nextTick(() => {
      isCleaningUp = false;
      console.log('🏁 Final cleanup state reset completed');
    });
  }
}

async function cleanupInOrder() {
  try {
    // Phase 0: Abort pending operations (Immediate - Clean First)
    console.log('Phase 0: Aborting pending operations...');
    abortPendingOperations();
    
    // Phase 1: Stop active system resources (Critical - Clean Second)
    console.log('Phase 1: Stopping active system resources...');
    await cleanupModules();
    
    // Phase 2: Release OS hooks (Critical - Clean Third)  
    console.log('Phase 2: Releasing OS-level hooks...');
    await Promise.race([
      Promise.all([
        Promise.resolve(cleanupGlobalKeyboardListener()),
        Promise.resolve(cleanupGlobalShortcuts())
      ]),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);
    
    // Phase 3: Memory cleanup (Important - Clean Fourth)
    console.log('Phase 3: Clearing memory references...');
    clearMemoryReferences();
    
    // Phase 4: Final cleanup (Nice to have - Clean Last)
    console.log('Phase 4: Final cleanup...');
    clearAllTimeouts();
    
    console.log('All cleanup phases completed successfully');
    
  } catch (error) {
    console.error('Error during cleanup phases:', error.message);
  }
}

// IPC handlers
ipcMain.handle('get-api-key', () => {
  return store.get('openai-api-key', '');
});

ipcMain.handle('save-api-key', async (event, apiKey) => {
  store.set('openai-api-key', apiKey);
  return true;
});

ipcMain.handle('test-api-key', async (event, apiKey) => {
  try {
    // console.log('Testing API key...');
    const testClient = new LLMClient(apiKey);
    const result = await testClient.testConnection();
    // console.log('API key test successful');
    return { success: true };
  } catch (error) {
    // console.error('API key test failed:', error.message);
    return { success: false, error: error.message };
  }
});

// Instruction Templates persistence
ipcMain.handle('get-instruction-templates', () => {
  return store.get('instruction-templates', []);
});
// Synchronous version for immediate access
ipcMain.on('get-instruction-templates-sync', (event) => {
  event.returnValue = store.get('instruction-templates', []);
});
ipcMain.handle('save-instruction-templates', (event, templates) => {
  store.set('instruction-templates', templates);
  return true;
});

// Template Import/Export functionality
ipcMain.handle('export-templates', async (event) => {
  try {
    const templates = store.get('instruction-templates', []);
    if (templates.length === 0) {
      return { success: false, error: 'No templates to export' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Instruction Templates',
      defaultPath: 'instruction-templates.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled) {
      return { success: false, error: 'Export cancelled' };
    }

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      templates: templates
    };

    await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2), 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-templates', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Instruction Templates',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled) {
      return { success: false, error: 'Import cancelled' };
    }

    const fileContent = await fs.readFile(result.filePaths[0], 'utf8');
    const importData = JSON.parse(fileContent);

    // Validate import data structure
    if (!importData.templates || !Array.isArray(importData.templates)) {
      return { success: false, error: 'Invalid file format: missing templates array' };
    }

    // Validate each template
    const validTemplates = [];
    const existingTemplates = store.get('instruction-templates', []);
    const existingNames = new Set(existingTemplates.map(t => t.name));

    for (const template of importData.templates) {
      if (!template.id || !template.name || !template.content) {
        continue; // Skip invalid templates
      }

      // Handle duplicate names by appending a number suffix
      let newName = template.name;
      let counter = 1;
      while (existingNames.has(newName)) {
        newName = `${template.name} (${counter})`;
        counter++;
      }

      validTemplates.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // Generate new unique ID
        name: newName,
        content: template.content
      });

      existingNames.add(newName);
    }

    if (validTemplates.length === 0) {
      return { success: false, error: 'No valid templates found in file' };
    }

    // Merge with existing templates
    const updatedTemplates = [...existingTemplates, ...validTemplates];
    store.set('instruction-templates', updatedTemplates);

    return { 
      success: true, 
      importedCount: validTemplates.length,
      totalCount: updatedTemplates.length
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { success: false, error: 'Invalid JSON file format' };
    }
    return { success: false, error: error.message };
  }
});

// RAG Store persistence
ipcMain.handle('get-rag-stores', () => {
  return store.get('rag-stores', []);
});
// Synchronous version for immediate access
ipcMain.on('get-rag-stores-sync', (event) => {
  event.returnValue = store.get('rag-stores', []);
});

ipcMain.handle('save-rag-stores', (event, ragStores) => {
  store.set('rag-stores', ragStores);
  return true;
});

// RAG Store Import/Export functionality
ipcMain.handle('export-rag-stores', async (event) => {
  try {
    const ragStores = store.get('rag-stores', []);
    if (ragStores.length === 0) {
      return { success: false, error: 'No RAG stores to export' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export RAG Stores',
      defaultPath: 'rag-stores.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled) {
      return { success: false, error: 'Export cancelled' };
    }

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      ragStores: ragStores
    };

    await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2), 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-rag-stores', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import RAG Stores',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled) {
      return { success: false, error: 'Import cancelled' };
    }

    const fileContent = await fs.readFile(result.filePaths[0], 'utf8');
    const importData = JSON.parse(fileContent);

    // Validate import data structure
    if (!importData.ragStores || !Array.isArray(importData.ragStores)) {
      return { success: false, error: 'Invalid file format: missing ragStores array' };
    }

    // Validate each RAG store
    const validRagStores = [];
    const existingRagStores = store.get('rag-stores', []);
    const existingNames = new Set(existingRagStores.map(s => s.name));
    const existingIds = new Set(existingRagStores.map(s => s.vectorStoreId));

    for (const ragStore of importData.ragStores) {
      if (!ragStore.id || !ragStore.name || !ragStore.vectorStoreId) {
        continue; // Skip invalid RAG stores
      }

      // Handle duplicate names by appending a number suffix
      let newName = ragStore.name;
      let counter = 1;
      while (existingNames.has(newName)) {
        newName = `${ragStore.name} (${counter})`;
        counter++;
      }

      // Handle duplicate Vector Store IDs by appending a number suffix
      let newVectorStoreId = ragStore.vectorStoreId;
      counter = 1;
      while (existingIds.has(newVectorStoreId)) {
        newVectorStoreId = `${ragStore.vectorStoreId}_${counter}`;
        counter++;
      }

      validRagStores.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // Generate new unique ID
        name: newName,
        vectorStoreId: newVectorStoreId
      });

      existingNames.add(newName);
      existingIds.add(newVectorStoreId);
    }

    if (validRagStores.length === 0) {
      return { success: false, error: 'No valid RAG stores found in file' };
    }

    // Merge with existing RAG stores
    const updatedRagStores = [...existingRagStores, ...validRagStores];
    store.set('rag-stores', updatedRagStores);

    return { 
      success: true, 
      importedCount: validRagStores.length,
      totalCount: updatedRagStores.length
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { success: false, error: 'Invalid JSON file format' };
    }
    return { success: false, error: error.message };
  }
});

// Auto-paste setting
ipcMain.handle('get-auto-paste', () => {
  return store.get('auto-paste', true);
});
ipcMain.handle('save-auto-paste', (event, enabled) => {
  store.set('auto-paste', enabled);
  return true;
});

ipcMain.handle('test-injection', async (event) => {
  try {
    const status = injector.getStatus();
    return { success: status.available, status };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// LLM Clipboard IPC handlers
ipcMain.handle('get-llm-clipboard', () => {
  return global.llmClipboard || null;
});

ipcMain.handle('clear-llm-clipboard', () => {
  global.llmClipboard = null;
  return true;
});



ipcMain.on('instruction-response', (event, instruction) => {
  // This is handled in the getInstructionFromRenderer function
});

// Recording data is now handled directly in the Recorder class

// IPC handlers for LLM shortcuts setting
ipcMain.handle('save-llm-shortcuts-enabled', async (event, enabled) => {
  store.set('llm-shortcuts-enabled', enabled);
  llmShortcutsEnabled = enabled;
  return true;
});

// Alias for backward compatibility with renderer
ipcMain.handle('set-llm-shortcuts-enabled', async (event, enabled) => {
  store.set('llm-shortcuts-enabled', enabled);
  llmShortcutsEnabled = enabled;
  return true;
});

ipcMain.handle('get-llm-shortcuts-enabled', async () => {
  return store.get('llm-shortcuts-enabled', true);
});

// Add IPC handlers for Copy Send setting
ipcMain.handle('save-copy-send', async (event, enabled) => {
  store.set('copy-send', enabled);
  copySendEnabled = enabled;
  return true;
});

ipcMain.handle('get-copy-send', async () => {
  return store.get('copy-send', false);
});

// Add IPC handlers for Responses API setting
ipcMain.handle('save-use-responses-api', async (event, enabled) => {
  store.set('use-responses-api', enabled);
  return true;
});

ipcMain.handle('get-use-responses-api', async () => {
  return store.get('use-responses-api', false);
});

// Add missing IPC handlers for model settings
ipcMain.handle('get-model', async () => {
  return store.get('model', 'gpt-4o-mini');
});

ipcMain.handle('get-temperature', async () => {
  return store.get('temperature', 0.7);
});

ipcMain.handle('get-max-tokens', async () => {
  return store.get('max-tokens', 1000);
});

ipcMain.handle('get-max-results', async () => {
  return store.get('max-results', 5);
});

ipcMain.handle('get-dark-mode', async () => {
  return store.get('dark-mode', false);
});

// Add missing IPC save handlers for model settings
ipcMain.handle('save-model', async (event, model) => {
  store.set('model', model);
  return true;
});

ipcMain.handle('save-temperature', async (event, temperature) => {
  store.set('temperature', temperature);
  return true;
});

ipcMain.handle('save-max-tokens', async (event, maxTokens) => {
  store.set('max-tokens', maxTokens);
  return true;
});

ipcMain.handle('save-max-results', async (event, maxResults) => {
  store.set('max-results', maxResults);
  return true;
});

// Vector Store Search Handler (Direct Search API)
ipcMain.handle('search-vector-store', async (event, data) => {
    try {
        const { vectorStoreId, query, maxResults = 5, filters } = data;
        
        // Get API key from store
        const apiKey = store.get('openai-api-key');
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }
        
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey });
        
        // Use the direct vector store search API
        const searchParams = {
            query,
            max_num_results: maxResults
        };
        
        // Add filters if provided
        if (filters) {
            searchParams.filters = filters;
        }
        
        const searchResults = await openai.vectorStores.search(
            vectorStoreId,
            searchParams
        );
        
        return {
            results: searchResults.data.map(result => ({
                fileId: result.file_id,
                filename: result.filename,
                score: result.score,
                content: result.content.map(c => c.text).join('\n'),
                attributes: result.attributes
            }))
        };
        
    } catch (error) {
        console.error('Error searching vector store:', error);
        throw error;
    }
});

// RAG Query Handler (Using Responses API with File Search)
ipcMain.handle('query-with-rag', async (event, data) => {
    try {
        const { vectorStoreId, query, model = 'gpt-4o-mini', filters, maxResults = 5 } = data;
        
        // Get API key from store
        const apiKey = store.get('openai-api-key');
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }
        
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey });
        
        // Use the modern Responses API with file_search tool
        const tools = [{
            type: 'file_search',
            vector_store_ids: [vectorStoreId],
            max_num_results: maxResults
        }];
        
        // Add filters if provided
        if (filters) {
            tools[0].filters = filters;
        }
        
        const response = await openai.responses.create({
            model,
            input: query,
            tools,
            // Include search results for debugging
            include: ['output[*].file_search_call.search_results']
        });
        
        // Extract the response text
        const responseText = response.output_text || 
                           (response.output[1]?.content?.[0]?.text) ||
                           'No response generated';
        
        // Extract file citations if available
        const citations = [];
        if (response.output[1]?.content?.[0]?.annotations) {
            for (const annotation of response.output[1].content[0].annotations) {
                if (annotation.type === 'file_citation') {
                    citations.push({
                        fileId: annotation.file_id,
                        filename: annotation.filename
                    });
                }
            }
        }
        
        // Extract detailed search results if available
        const searchResults = [];
        if (response.output[0]?.results) {
            for (const result of response.output[0].results) {
                searchResults.push({
                    fileId: result.file_id,
                    filename: result.filename,
                    score: result.score,
                    content: result.text,
                    attributes: result.attributes
                });
            }
        }
        
        return {
            response: responseText,
            citations,
            searchResults
        };
        
    } catch (error) {
        console.error('Error in RAG query:', error);
        throw error;
    }
});

// Vector Store Creation Handler
ipcMain.handle('create-vector-store', async (event, data) => {
    try {
        const { name, fileName, fileContent, fileType, fileSize } = data;
        
        // Additional validation for large files
        const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
        if (fileSize > MAX_FILE_SIZE) {
            throw new Error(`File size exceeds 20MB limit`);
        }
        
        // Get API key from store
        const apiKey = store.get('openai-api-key');
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }
        
        // Show progress for large files
        if (fileSize > 5 * 1024 * 1024) { // > 5MB
            event.sender.send('upload-progress-update', {
                percentage: 50,
                status: 'Uploading large file to OpenAI...'
            });
        }
        
        // Create vector store using OpenAI API
        const vectorStoreId = await createOpenAIVectorStore(apiKey, name, fileName, fileContent, fileType);
        
        return { vectorStoreId };
        
    } catch (error) {
        console.error('Error creating vector store:', error);
        throw error;
    }
});

async function createOpenAIVectorStore(apiKey, name, fileName, fileContent, fileType) {
    const OpenAI = require('openai');
    const fs = require('fs').promises;
    const path = require('path');
    const openai = new OpenAI({ apiKey });
    
    try {
        // Step 1: Create a temporary file for upload
        const tempDir = require('os').tmpdir();
        const tempFilePath = path.join(tempDir, fileName);
        
        let fileBuffer;
        // Handle different content types
        if (fileContent instanceof ArrayBuffer) {
            // Binary file (PDF, DOC, DOCX)
            fileBuffer = Buffer.from(fileContent);
        } else {
            // Text file (TXT, MD, JSON, CSV)
            fileBuffer = Buffer.from(fileContent, 'utf8');
        }
        
        // Write to temporary file
        await fs.writeFile(tempFilePath, fileBuffer);
        
        // Step 2: Upload file to OpenAI
        const file = await openai.files.create({
            file: require('fs').createReadStream(tempFilePath),
            purpose: 'assistants'
        });
        
        // Clean up temporary file
        await fs.unlink(tempFilePath).catch(() => {}); // Ignore errors
        
        // Step 3: Create vector store
        const vectorStore = await openai.vectorStores.create({
            name: name,
            expires_after: { anchor: 'last_active_at', days: 7 } // Auto-cleanup after 7 days
        });
        
        // Step 4: Add file to vector store with metadata
        const vectorStoreFile = await openai.vectorStores.files.create(
            vectorStore.id,
            {
                file_id: file.id,
                // Add metadata for filtering
                attributes: {
                    filename: fileName,
                    upload_date: new Date().toISOString(),
                    file_type: fileType || 'text/plain',
                    original_name: fileName
                }
            }
        );
        
        // Step 5: Poll until file is processed
        let attempts = 0;
        const maxAttempts = 60; // 2 minute timeout
        
        while (attempts < maxAttempts) {
            const fileStatus = await openai.vectorStores.files.retrieve(
                vectorStore.id,
                vectorStoreFile.id
            );
            
            if (fileStatus.status === 'completed') {
                return vectorStore.id;
            } else if (fileStatus.status === 'failed') {
                throw new Error(`Vector store file processing failed: ${fileStatus.last_error}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            attempts++;
        }
        
        throw new Error('Vector store creation timeout');
        
    } catch (error) {
        console.error('OpenAI API error:', error);
        throw new Error(`Failed to create vector store: ${error.message}`);
    }
}

// Initialize settings function
async function initializeSettings() {
  copySendEnabled = store.get('copy-send', false);
  llmShortcutsEnabled = store.get('llm-shortcuts-enabled', true);
}

// App event handlers
app.whenReady().then(async () => {
  // Disable security warnings
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
  
  // Set additional app flags to handle cache issues
  app.commandLine.appendSwitch('--disable-gpu-sandbox');
  app.commandLine.appendSwitch('--no-sandbox');
  app.commandLine.appendSwitch('--disable-web-security');
  
  await initializeSettings(); // Initialize settings first
  createWindow();
});

app.on('window-all-closed', () => {
  console.log('All windows closed');
  if (process.platform !== 'darwin') {
    // Perform final cleanup before quitting
    performCleanup().then(() => {
      app.quit();
    });
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', (event) => {
  if (!isCleaningUp) {
    console.log('App will quit - performing final cleanup...');
    event.preventDefault();
    
    performCleanup().then(() => {
      // Force quit after cleanup
      app.exit();
    }).catch(() => {
      // Force quit even if cleanup fails
      console.warn('Cleanup failed, forcing app exit...');
      app.exit();
    });
  }
});

app.on('before-quit', () => {
  console.log('App before quit event');
  isCleaningUp = true;
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  // console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
  // Reset recording state if it was a recording-related error
  if (reason && reason.message && reason.message.includes('recording')) {
    // console.log('Resetting recording state due to unhandled rejection');
    isRecording = false;
    if (recorder) {
      recorder.recording = false;
    }
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  // console.error('Uncaught Exception:', error);
}); 