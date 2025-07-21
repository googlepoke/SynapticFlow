const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const Store = require('electron-store');
const clipboardy = require('clipboardy');
const Recorder = require('./modules/recorder');
const Transcriber = require('./modules/transcriber');
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
let isRecording = false;
let winPressed = false;
let altPressed = false;
let ctrlPressed = false;
let shiftPressed = false;
let llmShortcutsEnabled = true;
let isCleaningUp = false;
let activeTimeouts = new Set();
let cleanupTimeout = null;

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
    
    // Show window now that it's ready
    mainWindow.show();
    
    // Test IPC communication
    setTimeout(() => {
      // console.log('=== TESTING IPC COMMUNICATION ===');
      mainWindow.webContents.send('test-message', 'Hello from main process');
    }, 2000);
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
  transcriber = new Transcriber();
  promptBuilder = new PromptBuilder();
  llmClient = new LLMClient();
  injector = new TextInjector();
  // console.log('=== MODULES INITIALIZED ===');

  // Register global hotkey using node-global-key-listener
  const gkl = new GlobalKeyboardListener();
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
        startRecording();
      }
      // Alternative: Check for Ctrl+Shift combination
      if (ctrlPressed && shiftPressed && !isRecording) {
        // console.log('=== ALTERNATIVE HOTKEY DETECTED: Ctrl+Shift pressed ===');
        // console.log('ctrlPressed:', ctrlPressed, 'shiftPressed:', shiftPressed, 'isRecording:', isRecording);
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
      
      // Stop recording if either hotkey combination is released
      if ((!winPressed || !altPressed) || (!ctrlPressed || !shiftPressed)) {
        if (isRecording) {
          // console.log('=== HOTKEY RELEASED: Keys released ===');
          // console.log('winPressed:', winPressed, 'altPressed:', altPressed);
          // console.log('ctrlPressed:', ctrlPressed, 'shiftPressed:', shiftPressed, 'isRecording:', isRecording);
          stopRecording();
        }
      }
    }
  });

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
    
    // Transcribe audio
    mainWindow.webContents.send('status-update', 'Transcribing...');
    const transcriptionStartTime = Date.now();
    const transcript = await transcriber.transcribe(audioData);
    const transcriptionDuration = Date.now() - transcriptionStartTime;
    // console.log(`Transcription completed in ${transcriptionDuration}ms`);
    
    mainWindow.webContents.send('status-update', 'Thinking...');
    
    // Get instruction from renderer
    const instruction = await getInstructionFromRenderer();
    
    // Build prompt
    const prompt = promptBuilder.build(instruction, transcript);
    
    // Get LLM response
    const llmStartTime = Date.now();
    const response = await llmClient.getResponse(prompt);
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
    
    // Step 6: Validate we got new content
    if (selectedText === originalClipboard) {
      throw new Error('No text was selected or clipboard unchanged');
    }
    
    if (!selectedText || selectedText.trim().length === 0) {
      throw new Error('Selected text is empty');
    }
    
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
  try {
    mainWindow.webContents.send('status-update', 'Copying to LLM clipboard...');
    
    const selectedText = await captureLlmClipboard();
    
    if (!selectedText || selectedText.trim().length === 0) {
      mainWindow.webContents.send('status-update', 'No text selected');
      return;
    }
    
    // Truncate if too long
    const truncatedText = selectedText.length > 10000 ? 
      selectedText.substring(0, 10000) + '...' : selectedText;
    
    // Store in LLM clipboard (memory only, not electron-store)
    global.llmClipboard = {
      text: truncatedText,
      timestamp: new Date().toISOString()
    };
    
    mainWindow.webContents.send('llm-clipboard-updated');
    mainWindow.webContents.send('status-update', `Copied ${truncatedText.length} characters to LLM clipboard`);
    
    const timeoutId = setTimeout(() => {
      mainWindow.webContents.send('status-update', 'Ready');
      activeTimeouts.delete(timeoutId);
    }, 2000);
    activeTimeouts.add(timeoutId);
    
  } catch (error) {
    console.error('LLM Copy error:', error);
    mainWindow.webContents.send('status-update', 'LLM Copy failed: ' + error.message);
    const timeoutId = setTimeout(() => {
      mainWindow.webContents.send('status-update', 'Ready');
      activeTimeouts.delete(timeoutId);
    }, 3000);
    activeTimeouts.add(timeoutId);
  }
}

async function handleLlmPaste() {
  try {
    // Check if already processing something
    if (isRecording) {
      mainWindow.webContents.send('status-update', 'Cannot paste while recording');
      return;
    }
    
    if (!global.llmClipboard || !global.llmClipboard.text) {
      mainWindow.webContents.send('status-update', 'LLM clipboard is empty');
      return;
    }
    
    mainWindow.webContents.send('status-update', 'Processing LLM clipboard...');
    
    // Get current instruction
    const instruction = await getInstructionFromRenderer();
    
    // Build prompt using existing promptBuilder
    const prompt = promptBuilder.build(instruction, global.llmClipboard.text);
    
    // Get LLM response using existing pipeline
    const response = await llmClient.getResponse(prompt);
    
    // Inject response using existing injector
    const injectionResult = await injector.injectText(response);
    
    if (injectionResult.success) {
      mainWindow.webContents.send('status-update', 'LLM response pasted successfully');
      
      // Auto-paste if enabled (copy existing logic from stopRecording)
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
    
    const timeoutId = setTimeout(() => {
      mainWindow.webContents.send('status-update', 'Ready');
      activeTimeouts.delete(timeoutId);
    }, 2000);
    activeTimeouts.add(timeoutId);
    
  } catch (error) {
    console.error('LLM Paste error:', error);
    mainWindow.webContents.send('status-update', 'LLM Paste failed: ' + error.message);
    const timeoutId = setTimeout(() => {
      mainWindow.webContents.send('status-update', 'Ready');
      activeTimeouts.delete(timeoutId);
    }, 3000);
    activeTimeouts.add(timeoutId);
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

function cleanupGlobalKeyboardListener() {
  try {
    console.log('Cleaning up GlobalKeyboardListener...');
    if (gkl) {
      // Try multiple cleanup methods (library may have different versions)
      if (typeof gkl.destroy === 'function') {
        gkl.destroy();
        console.log('GlobalKeyboardListener destroyed');
      } else if (typeof gkl.removeAllListeners === 'function') {
        gkl.removeAllListeners();
        console.log('GlobalKeyboardListener listeners removed');
      } else if (typeof gkl.stop === 'function') {
        gkl.stop();
        console.log('GlobalKeyboardListener stopped');
      } else {
        console.log('No cleanup method found for GlobalKeyboardListener');
      }
      
      // Set reference to null for garbage collection
      gkl = null;
    }
  } catch (error) {
    // If cleanup fails, log but don't prevent app closing
    console.warn('GlobalKeyboardListener cleanup failed:', error.message);
  }
}

async function cleanupModules() {
  try {
    console.log('Cleaning up modules...');
    
    // Phase 1: Stop active system resources (100ms max each)
    if (recorder) {
      try {
        await Promise.race([
          recorder.stop(),
          new Promise(resolve => setTimeout(resolve, 100))
        ]);
        console.log('Recorder stopped');
        
        // Call cleanup method if available
        if (typeof recorder.cleanup === 'function') {
          recorder.cleanup();
          console.log('Recorder cleanup completed');
        }
      } catch (error) {
        console.warn('Recorder cleanup failed:', error.message);
      }
    }
    
    // Phase 2: Cleanup other modules
    if (transcriber) {
      try {
        // Close any pending OpenAI connections
        if (transcriber.openai) {
          transcriber.openai = null;
        }
        console.log('Transcriber cleaned up');
      } catch (error) {
        console.warn('Transcriber cleanup failed:', error.message);
      }
    }
    
    if (llmClient) {
      try {
        // Close any pending connections
        llmClient = null;
        console.log('LLM Client cleaned up');
      } catch (error) {
        console.warn('LLM Client cleanup failed:', error.message);
      }
    }
    
    if (injector) {
      try {
        injector = null;
        console.log('Text Injector cleaned up');
      } catch (error) {
        console.warn('Text Injector cleanup failed:', error.message);
      }
    }
    
  } catch (error) {
    console.warn('Module cleanup error:', error.message);
  }
}

function clearMemoryReferences() {
  try {
    console.log('Clearing memory references...');
    
    // Clear global LLM clipboard
    global.llmClipboard = null;
    
    // Clear module references
    recorder = null;
    transcriber = null;
    promptBuilder = null;
    llmClient = null;
    injector = null;
    
    console.log('Memory references cleared');
  } catch (error) {
    console.warn('Memory cleanup error:', error.message);
  }
}

async function performCleanup() {
  if (isCleaningUp) {
    console.log('Cleanup already in progress...');
    return;
  }
  
  isCleaningUp = true;
  console.log('=== STARTING RESOURCE CLEANUP ===');
  
  try {
    // Set maximum cleanup time to prevent hanging
    const cleanupPromise = cleanupInOrder();
    const timeoutPromise = new Promise(resolve => {
      cleanupTimeout = setTimeout(() => {
        console.warn('Cleanup timeout reached (5 seconds), forcing shutdown...');
        resolve();
      }, 5000);
    });
    
    // Race between cleanup completion and timeout
    await Promise.race([cleanupPromise, timeoutPromise]);
    
    if (cleanupTimeout) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }
    
  } catch (error) {
    console.error('Cleanup error:', error.message);
  } finally {
    console.log('=== CLEANUP COMPLETED ===');
    
    // Save window bounds as final step
    saveWindowBounds();
    
    isCleaningUp = false;
  }
}

async function cleanupInOrder() {
  try {
    // Phase 1: Stop active system resources (Critical - Clean First)
    console.log('Phase 1: Stopping active system resources...');
    await cleanupModules();
    
    // Phase 2: Release OS hooks (Critical - Clean Second)  
    console.log('Phase 2: Releasing OS-level hooks...');
    await Promise.race([
      Promise.resolve(cleanupGlobalKeyboardListener()),
      new Promise(resolve => setTimeout(resolve, 500))
    ]);
    
    // Phase 3: Memory cleanup (Important - Clean Third)
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

function getInstructionFromRenderer() {
  return new Promise((resolve) => {
    mainWindow.webContents.send('get-instruction');
    ipcMain.once('instruction-response', (event, instruction) => {
      resolve(instruction);
    });
  });
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

ipcMain.handle('get-llm-shortcuts-enabled', () => {
  return llmShortcutsEnabled;
});

ipcMain.handle('set-llm-shortcuts-enabled', (event, enabled) => {
  llmShortcutsEnabled = enabled;
  return true;
});

ipcMain.on('instruction-response', (event, instruction) => {
  // This is handled in the getInstructionFromRenderer function
});

// Recording data is now handled directly in the Recorder class

// App event handlers
app.whenReady().then(() => {
  // Disable security warnings
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
  
  // Set additional app flags to handle cache issues
  app.commandLine.appendSwitch('--disable-gpu-sandbox');
  app.commandLine.appendSwitch('--no-sandbox');
  app.commandLine.appendSwitch('--disable-web-security');
  
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