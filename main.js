const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const Store = require('electron-store');
const clipboardy = require('clipboardy');
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
• Ctrl + Alt + C (copy selected text to LLM clipboard)
• Ctrl + Alt + V (process LLM clipboard and paste result)

⌨️ APPLICATION SHORTCUTS:
• F1 (show this help)
• F11 (maximize/restore window)
• F12 (toggle developer tools)

📝 WORKFLOW:
1. Select text in any application
2. Press Ctrl + Alt + C to copy to LLM clipboard
3. Press Ctrl + Alt + V to process with current instruction template
4. Or use Win + Alt to record voice and process immediately

💡 TIP: Make sure "Enable LLM Shortcuts" is checked in Settings
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

        // Check for Ctrl+Alt+C combination (LLM Copy)
        if (ctrlPressed && altPressed && e.name === 'C' && !isRecording && llmShortcutsEnabled) {
          console.log('=== LLM COPY TRIGGERED ===');
          handleLlmCopy();
        }

        // Check for Ctrl+Alt+V combination (LLM Paste)  
        if (ctrlPressed && altPressed && e.name === 'V' && !isRecording && llmShortcutsEnabled) {
          console.log('=== LLM PASTE TRIGGERED ===');
          handleLlmPaste();
        }
        
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
    
    // Get instruction from renderer
    const { instruction, ragAssociations } = await getInstructionAndRagFromRenderer();
    
    // Build prompt using existing promptBuilder
    const prompt = promptBuilder.build(instruction, transcript);
    
    // Get LLM response using existing pipeline (with RAG if available)
    const llmStartTime = Date.now();
    let response;
    if (ragAssociations && ragAssociations.length > 0) {
      response = await llmClient.getResponseWithRAG(prompt, ragAssociations);
    } else {
      response = await llmClient.getResponse(prompt);
    }
    
    const llmDuration = Date.now() - llmStartTime;
    // console.log(`LLM response completed in ${llmDuration}ms`);
    
    // Send transcript and response to UI
    mainWindow.webContents.send('transcript-update', transcript);
    mainWindow.webContents.send('response-update', response);
    
    // Inject response
    const injectionResult = await injector.injectText(response);
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

// LLM Clipboard Functions
async function captureLlmClipboard() {
  let originalClipboard = '';
  try {
    // Step 1: Store original clipboard (handle empty clipboard)
    try {
      originalClipboard = await clipboardy.read();
    } catch (e) {
      originalClipboard = '';
    }
    
    console.log('Original clipboard length:', originalClipboard.length);
    
    // Step 2: Simulate Ctrl+C based on platform (synchronously)
    try {
      if (process.platform === 'win32') {
        // Use a more reliable Windows method with longer timeout
        execSync(`powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c'); Start-Sleep -Milliseconds 300"`, { timeout: 2000 });
      } else if (process.platform === 'darwin') {
        execSync(`osascript -e 'tell application "System Events" to keystroke "c" using command down'`, { timeout: 2000 });
      } else {
        execSync(`xdotool key --clearmodifiers ctrl+c`, { timeout: 2000 });
      }
    } catch (execError) {
      console.error('Error executing copy command:', execError);
      throw new Error('Failed to simulate Ctrl+C');
    }
    
    // Step 3: Wait additional time for clipboard to update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 4: Read new clipboard content
    const selectedText = await clipboardy.read();
    console.log('New clipboard length:', selectedText.length);
    console.log('Clipboard changed:', selectedText !== originalClipboard);
    
    // Step 5: Restore original clipboard
    await clipboardy.write(originalClipboard);
    
    // Step 6: Validate we got content (allow same content to be copied again)
    if (!selectedText || selectedText.trim().length === 0) {
      throw new Error('Selected text is empty');
    }
    
    // If clipboard didn't change, it could mean:
    // 1. Same text was selected again (valid)
    // 2. No text was actually selected (invalid)
    // We'll allow it through since we can't reliably distinguish between these cases
    
    return selectedText;
  } catch (error) {
    // Ensure clipboard is restored even on error
    try {
      await clipboardy.write(originalClipboard);
    } catch (restoreError) {
      console.error('Failed to restore clipboard:', restoreError);
    }
    throw error;
  }
}

async function handleLlmCopy() {
  // Prevent concurrent operations
  if (isLlmOperationInProgress) {
    console.log('=== LLM COPY BLOCKED: Operation in progress ===');
    mainWindow.webContents.send('status-update', 'Copy in progress - please wait');
    return;
  }
  
  console.log('=== LLM COPY START ===');
  console.log('Copy Send enabled:', copySendEnabled);
  
  const operationId = Date.now();
  isLlmOperationInProgress = true;
  pendingOperations.add(operationId);
  
  try {
    mainWindow.webContents.send('status-update', 'Copying to LLM clipboard...');
    
    console.log('Attempting to capture clipboard...');
    const selectedText = await captureLlmClipboard();
    console.log('Captured text length:', selectedText?.length || 0);
    console.log('Captured text preview:', selectedText?.substring(0, 100) + '...');
    
    if (!selectedText || selectedText.trim().length === 0) {
      console.log('=== LLM COPY FAILED: No text captured ===');
      mainWindow.webContents.send('status-update', 'No text selected');
      return;
    }
    
    // Truncate if too long
    const truncatedText = selectedText.length > 10000 ? 
      selectedText.substring(0, 10000) + '...' : selectedText;
    
    console.log('Final text length:', truncatedText.length);
    
    // Store in LLM clipboard (memory only, not electron-store)
    global.llmClipboard = {
      text: truncatedText,
      timestamp: new Date().toISOString()
    };
    
    console.log('Stored in global.llmClipboard:', !!global.llmClipboard);
    
    mainWindow.webContents.send('llm-clipboard-updated');
    mainWindow.webContents.send('status-update', `Copied ${truncatedText.length} characters to LLM clipboard`);
    
    // NEW: If Copy Send is enabled, process LLM in background
    if (copySendEnabled) {
      console.log('Copy Send enabled, processing in background...');
      await processLlmInBackground(truncatedText);
    } else {
      console.log('Copy Send disabled, text ready for manual paste');
    }
    
    // Clear previous status timeouts to avoid conflicts
    clearAllTimeouts();
    
    const timeoutId = setTimeout(() => {
      if (activeTimeouts.has(timeoutId)) {
        mainWindow.webContents.send('status-update', 'Ready');
        activeTimeouts.delete(timeoutId);
      }
    }, 2000);
    activeTimeouts.add(timeoutId);
    
  } catch (error) {
    console.error('LLM Copy error:', error);
    mainWindow.webContents.send('status-update', 'LLM Copy failed: ' + error.message);
    
    // Clear previous status timeouts to avoid conflicts
    clearAllTimeouts();
    
    const timeoutId = setTimeout(() => {
      if (activeTimeouts.has(timeoutId)) {
        mainWindow.webContents.send('status-update', 'Ready');
        activeTimeouts.delete(timeoutId);
      }
    }, 3000);
    activeTimeouts.add(timeoutId);
  } finally {
    isLlmOperationInProgress = false;
    pendingOperations.delete(operationId);
  }
}

async function handleLlmPaste() {
  // Prevent concurrent operations
  if (isLlmOperationInProgress) {
    console.log('=== LLM PASTE BLOCKED: Operation in progress ===');
    mainWindow.webContents.send('status-update', 'Operation in progress - please wait');
    return;
  }
  
  console.log('=== LLM PASTE START ===');
  console.log('Copy Send enabled:', copySendEnabled);
  console.log('Processed LLM result exists:', !!processedLlmResult);
  console.log('Global LLM clipboard exists:', !!global.llmClipboard);
  console.log('LLM clipboard text length:', global.llmClipboard?.text?.length || 0);
  
  const operationId = Date.now();
  isLlmOperationInProgress = true;
  pendingOperations.add(operationId);
  
  try {
    // Check if already processing something
    if (isRecording) {
      console.log('=== LLM PASTE BLOCKED: Recording in progress ===');
      mainWindow.webContents.send('status-update', 'Cannot paste while recording');
      return;
    }
    
    // NEW: If Copy Send is enabled and we have a processed result, use it
    if (copySendEnabled && processedLlmResult) {
      console.log('=== USING COPY SEND MODE ===');
      mainWindow.webContents.send('status-update', 'Pasting processed LLM result...');
      
      // Inject the processed response
      const injectionResult = await injector.injectText(processedLlmResult.text);
      
      if (injectionResult.success) {
        console.log('=== COPY SEND PASTE SUCCESS ===');
        mainWindow.webContents.send('status-update', 'Processed LLM response pasted successfully');
        
        // Auto-paste if enabled
        if (store.get('auto-paste', true)) {
          if (process.platform === 'darwin') {
            exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
          } else if (process.platform === 'win32') {
            exec(`powershell -WindowStyle Hidden -command "Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('^v')"`);
          } else {
            exec(`xdotool key --clearmodifiers ctrl+v`);
          }
        }
        
        // Clear the processed result after successful paste
        processedLlmResult = null;
        
      } else {
        console.log('=== COPY SEND PASTE FAILED ===', injectionResult.error);
        mainWindow.webContents.send('status-update', 'Paste failed: ' + injectionResult.error);
      }
      
    } else if (copySendEnabled && !processedLlmResult) {
      console.log('=== COPY SEND MODE BUT NO PROCESSED RESULT ===');
      mainWindow.webContents.send('status-update', 'No processed result available. Copy text first.');
      return;
      
    } else {
      console.log('=== USING REGULAR PASTE MODE ===');
      // Original logic for non-Copy Send mode
      if (!global.llmClipboard || !global.llmClipboard.text) {
        console.log('=== REGULAR PASTE FAILED: Empty clipboard ===');
        mainWindow.webContents.send('status-update', 'LLM clipboard is empty');
        return;
      }
      
      console.log('LLM clipboard text preview:', global.llmClipboard.text.substring(0, 200) + '...');
      mainWindow.webContents.send('status-update', 'Processing LLM clipboard...');
      
      // Get current instruction
      const { instruction, ragAssociations } = await getInstructionAndRagFromRenderer();
      console.log('Instruction:', instruction.substring(0, 100) + '...');
      console.log('RAG associations:', ragAssociations?.length || 0);
      
      // Build prompt using existing promptBuilder
      const prompt = promptBuilder.build(instruction, global.llmClipboard.text);
      console.log('Built prompt preview:', prompt.substring(0, 200) + '...');
      
      // Get LLM response using existing pipeline (with RAG if available)
      console.log('Calling LLM API...');
      let response;
      if (ragAssociations && ragAssociations.length > 0) {
        console.log('Using RAG-enabled LLM call');
        response = await llmClient.getResponseWithRAG(prompt, ragAssociations);
      } else {
        console.log('Using regular LLM call');
        response = await llmClient.getResponse(prompt);
      }
      
      console.log('LLM response received, length:', response?.length || 0);
      console.log('Response preview:', response?.substring(0, 100) + '...');
      
      // Inject response using existing injector
      console.log('Attempting to inject text...');
      const injectionResult = await injector.injectText(response);
      console.log('Injection result:', injectionResult);
      
      if (injectionResult.success) {
        mainWindow.webContents.send('status-update', 'LLM response pasted successfully');
        
        // Auto-paste if enabled
        if (store.get('auto-paste', true)) {
          if (process.platform === 'darwin') {
            exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
          } else if (process.platform === 'win32') {
            exec(`powershell -WindowStyle Hidden -command "Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('^v')"`);
          } else {
            exec(`xdotool key --clearmodifiers ctrl+v`);
          }
        }
      } else {
        mainWindow.webContents.send('status-update', 'Paste failed: ' + injectionResult.error);
      }
    }
    
    // Clear previous status timeouts to avoid conflicts
    clearAllTimeouts();
    
    const timeoutId = setTimeout(() => {
      if (activeTimeouts.has(timeoutId)) {
        mainWindow.webContents.send('status-update', 'Ready');
        activeTimeouts.delete(timeoutId);
      }
    }, 2000);
    activeTimeouts.add(timeoutId);
    
  } catch (error) {
    console.error('LLM Paste error:', error);
    mainWindow.webContents.send('status-update', 'LLM Paste failed: ' + error.message);
    
    // Clear previous status timeouts to avoid conflicts
    clearAllTimeouts();
    
    const timeoutId = setTimeout(() => {
      if (activeTimeouts.has(timeoutId)) {
        mainWindow.webContents.send('status-update', 'Ready');
        activeTimeouts.delete(timeoutId);
      }
    }, 3000);
    activeTimeouts.add(timeoutId);
  } finally {
    isLlmOperationInProgress = false;
    pendingOperations.delete(operationId);
  }
}

// Function to get instruction template from renderer
async function getInstructionFromRenderer() {
  try {
    return await mainWindow.webContents.executeJavaScript(`
      (function() {
        const templateSelect = document.getElementById('templateSelect');
        const instructionInput = document.getElementById('instructionInput');
        
        if (templateSelect && templateSelect.value && templateSelect.value.trim() !== '') {
          // Get predefined template
          const builtInTemplates = {
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
          
          // Check if it's a built-in template
          if (builtInTemplates[templateSelect.value]) {
            return builtInTemplates[templateSelect.value];
          }
          
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
        
        if (templateSelect && templateSelect.value && templateSelect.value.trim() !== '') {
          // Get predefined template
          const builtInTemplates = {
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
          
          // Check if it's a built-in template
          if (builtInTemplates[templateSelect.value]) {
            instruction = builtInTemplates[templateSelect.value];
          } else if (window.userTemplates) {
            // Check if it's a user template
            const userTemplate = window.userTemplates.find(t => t.id === templateSelect.value);
            if (userTemplate) {
              instruction = userTemplate.content;
              
              // Get RAG associations if RAG search is enabled
              if (userTemplate.ragSearch && userTemplate.ragAssociations) {
                ragAssociations = userTemplate.ragAssociations.map(assoc => {
                  // Find the corresponding RAG store to get vector store ID
                  const ragStore = window.ragStores ? window.ragStores.find(store => store.id === assoc.ragStoreId) : null;
                  return {
                    vectorStoreId: ragStore ? ragStore.vectorStoreId : null,
                    maxResults: assoc.maxResults || 8,
                    includeResults: assoc.includeResults !== false
                  };
                }).filter(assoc => assoc.vectorStoreId); // Filter out invalid associations
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
        
        return {
          instruction: instruction,
          ragAssociations: ragAssociations
        };
      })()
    `);
  } catch (error) {
    console.error('Error getting instruction and RAG from renderer:', error);
    return {
      instruction: 'Please process the following text:',
      ragAssociations: []
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
    // Get current instruction template
    const { instruction, ragAssociations } = await getInstructionAndRagFromRenderer();
    
    // Build prompt using existing promptBuilder
    const prompt = promptBuilder.build(instruction, text);
    
    // Get LLM response using existing pipeline (with RAG if available)
    let response;
    if (ragAssociations && ragAssociations.length > 0) {
      response = await llmClient.getResponseWithRAG(prompt, ragAssociations);
    } else {
      response = await llmClient.getResponse(prompt);
    }
    
    // Store the processed result in memory
    processedLlmResult = {
      text: response,
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

// Add missing IPC handlers for model settings
ipcMain.handle('get-model', async () => {
  return store.get('model', 'gpt-4o');
});

ipcMain.handle('get-temperature', async () => {
  return store.get('temperature', 0.7);
});

ipcMain.handle('get-max-tokens', async () => {
  return store.get('max-tokens', 1000);
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