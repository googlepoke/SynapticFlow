const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
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
    maxWidth: 1200, // Maximum width to prevent issues
    maxHeight: 1200, // Increased maximum height for more flexibility
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Voice-to-LLM Assistant',
    resizable: true, // Enable resizing
    alwaysOnTop: store.get('always-on-top', true), // Load saved preference
    webSecurity: false,
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
          label: 'Reset Window Size',
          click: () => {
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

  mainWindow.loadFile('index.html');

  // Wait for the window to be ready
  mainWindow.webContents.once('did-finish-load', () => {
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
    // Save window bounds before closing
    saveWindowBounds();
    
    if (recorder) {
      recorder.stop();
    }
    // gkl.removeAllListeners(); // Removed, not a function in this version
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

ipcMain.handle('test-injection', async (event) => {
  try {
    const status = injector.getStatus();
    return { success: status.available, status };
  } catch (error) {
    return { success: false, error: error.message };
  }
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', () => {
  // globalShortcut.unregisterAll(); // This line is removed as per the edit hint
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