const fs = require('fs');
const path = require('path');
const os = require('os');
const { BrowserWindow, ipcMain } = require('electron');

// Enhanced Recording Configuration
const RECORDING_CONFIG = {
  MAX_DURATION: 300000,        // 5 minutes (300 seconds)
  WARNING_DURATION: 240000,    // 4 minutes (warning threshold)
  CHUNK_DURATION: 2000,        // 2-second chunks (existing)
  MAX_FILE_SIZE_MB: 20,        // 20MB maximum (under Whisper's 25MB limit)
  AUTO_STOP: true              // Enable auto-stop at max duration
};

class Recorder {
  constructor() {
    this.recording = false;
    this.tempFilePath = null;
    this.recordingPromise = null;
    this.recordingStartTime = null;    // Enhanced: Track recording start time
    this.progressInterval = null;      // Enhanced: Progress tracking interval
    this.setupIPC();
  }

  setupIPC() {
    // Handle recording data from renderer
    ipcMain.removeAllListeners('recording-data');
    ipcMain.on('recording-data', (event, audioData) => {
      this.handleRecordingData(audioData);
    });
  }

  async start() {
    return new Promise((resolve, reject) => {
      // console.log('=== RECORDER.START() CALLED ===');
      // console.log('Current recording state:', this.recording);
      
      if (this.recording) {
        // console.log('ERROR: Already recording');
        reject(new Error('Already recording'));
        return;
      }

      try {
        // console.log('Getting main window...');
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (!mainWindow) {
          // console.log('ERROR: No window available');
          throw new Error('No window available for recording');
        }
        // console.log('Main window found, webContents ready:', !!mainWindow.webContents);

        // console.log('Setting recording state to true...');
        this.recording = true;
        this.recordingStartTime = Date.now();  // Enhanced: Track start time
        
        // console.log('Sending start-recording message to renderer...');
        mainWindow.webContents.send('start-recording');

        // Enhanced: Set up timeout for recording (5 minutes max)
        this.recordingTimeout = setTimeout(() => {
          console.log(`Recording timeout reached (${RECORDING_CONFIG.MAX_DURATION/1000} seconds)`);
          if (this.recording) {
            mainWindow.webContents.send('status-update', 'Recording stopped: Maximum duration reached');
            this.stop().catch(console.error);
          }
        }, RECORDING_CONFIG.MAX_DURATION);

        // Enhanced: Set up progress tracking and warning
        this.progressInterval = setInterval(() => {
          if (this.recording && this.recordingStartTime) {
            const elapsed = Date.now() - this.recordingStartTime;
            const progress = (elapsed / RECORDING_CONFIG.MAX_DURATION) * 100;
            
            // Send progress update
            mainWindow.webContents.send('recording-progress', {
              elapsed: elapsed,
              progress: progress,
              remaining: RECORDING_CONFIG.MAX_DURATION - elapsed
            });
            
            // Enhanced: Warning at 4 minutes
            if (elapsed >= RECORDING_CONFIG.WARNING_DURATION && elapsed < RECORDING_CONFIG.WARNING_DURATION + 1000) {
              mainWindow.webContents.send('status-update', '⚠️ Recording will stop in 1 minute');
            }
          }
        }, 1000); // Update every second

        // console.log('=== RECORDER START COMPLETED SUCCESSFULLY ===');
        resolve();

      } catch (error) {
        // console.log('=== ERROR IN RECORDER.START() ===');
        // console.error('Error details:', error);
        this.recording = false;
        reject(new Error(`Failed to start recording: ${error.message}`));
      }
    });
  }

  async stop() {
    return new Promise((resolve, reject) => {
      // console.log('=== RECORDER STOP CALLED ===');
      // console.log('Current recording state:', this.recording);
      
      if (!this.recording) {
        // console.log('Recorder not in recording state, checking if we have pending data...');
        // If we're not recording but have a pending promise, wait for it
        if (this.recordingPromise) {
          // console.log('Found pending recording promise, waiting for it...');
          // Don't reject, just wait for the existing promise
          return;
        } else {
          // console.log('No recording in progress and no pending promise');
        reject(new Error('Not recording'));
        return;
        }
      }

      this.recording = false;

      // Enhanced: Clear all recording-related timers
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }

      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }

      // Enhanced: Reset recording start time
      this.recordingStartTime = null;

      try {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (!mainWindow) {
          throw new Error('No window available for stopping recording');
        }

        // Set up promise to wait for recording data
        this.recordingPromise = { resolve, reject };
        
        // Request stop recording
        mainWindow.webContents.send('stop-recording');
        
        // Timeout if no response within 10 seconds
        this.stopTimeout = setTimeout(() => {
          if (this.recordingPromise) {
            this.recordingPromise.reject(new Error('Recording stop timeout'));
            this.recordingPromise = null;
      }
        }, 10000);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  handleRecordingData(audioData) {
    console.log('=== RECORDER: handleRecordingData called ===');
    console.log('audioData type:', typeof audioData);
    console.log('audioData is Array:', Array.isArray(audioData));
    console.log('audioData is Buffer:', Buffer.isBuffer(audioData));
    console.log('audioData has data property:', audioData && audioData.data !== undefined);
    console.log('audioData length/size:', audioData ? (audioData.length || audioData.size || 'no length/size') : 'null/undefined');
    
    if (!this.recordingPromise) {
      console.log('Received recording data but no promise waiting');
      return;
    }

    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }

    // Try multiple formats that could be coming through IPC
    let buffer = null;
    
    if (audioData && Array.isArray(audioData) && audioData.length > 0) {
      console.log('✅ Processing as Array');
      buffer = Buffer.from(audioData);
    } else if (audioData && Buffer.isBuffer(audioData) && audioData.length > 0) {
      console.log('✅ Processing as Buffer');
      buffer = audioData;
    } else if (audioData && typeof audioData === 'object' && audioData.type === 'Buffer' && audioData.data) {
      console.log('✅ Processing as IPC-serialized Buffer');
      buffer = Buffer.from(audioData.data);
    } else if (audioData && audioData instanceof Uint8Array && audioData.length > 0) {
      console.log('✅ Processing as Uint8Array');
      buffer = Buffer.from(audioData);
    }

    if (buffer && buffer.length > 0) {
      // Save audio data directly without slow conversion
      const tempDir = os.tmpdir();
      const timestamp = Date.now();
      
      // Use WebM format directly - OpenAI Whisper supports WebM
      const audioFile = path.join(tempDir, `recording_${timestamp}.webm`);
      
      console.log('=== SAVING AUDIO FILE ===');
      console.log('File path:', audioFile);
      console.log('Audio data size:', buffer.length, 'bytes');
      
      const startTime = Date.now();
      
      // Use async file write for better performance
      fs.writeFile(audioFile, buffer, (error) => {
        const writeTime = Date.now() - startTime;
        // console.log(`File write completed in ${writeTime}ms`);
        
        if (error) {
          // console.error('Error writing audio file:', error);
          this.recordingPromise.reject(error);
          this.recordingPromise = null;
        } else {
          this.tempFilePath = audioFile;
          // console.log('Audio file saved successfully:', audioFile);
          this.recordingPromise.resolve(audioFile);
          this.recordingPromise = null;
        }
      });
    } else {
      console.log('❌ No valid audio data could be processed');
      console.log('Data type:', typeof audioData);
      console.log('Data details:', audioData);
      this.recordingPromise.reject(new Error(`No valid audio data received. Type: ${typeof audioData}, isArray: ${Array.isArray(audioData)}, isBuffer: ${Buffer.isBuffer(audioData)}`));
      this.recordingPromise = null;
    }
  }

  isRecording() {
    return this.recording;
  }

  cleanup() {
    try {
      console.log('🧹 Recorder cleanup starting...');
      
      // Force stop any active recording
      if (this.recording) {
        this.recording = false;
        console.log('✅ Forced recording state to false');
      }
      
      // Clear all recording-related timers
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
        console.log('✅ Recording timeout cleared');
      }

      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
        console.log('✅ Progress interval cleared');
      }

      if (this.stopTimeout) {
        clearTimeout(this.stopTimeout);
        this.stopTimeout = null;
        console.log('✅ Stop timeout cleared');
      }
      
      // Clear pending promises
      if (this.recordingPromise) {
        this.recordingPromise = null;
        console.log('✅ Recording promise cleared');
      }
      
      // Reset recording state variables
      this.recordingStartTime = null;
      
      // Clean up temporary file if it exists
      if (this.tempFilePath && fs.existsSync(this.tempFilePath)) {
        try {
          fs.unlinkSync(this.tempFilePath);
          console.log('✅ Temporary audio file deleted');
        } catch (deleteError) {
          console.warn('⚠️ Could not delete temporary file:', deleteError.message);
        }
        this.tempFilePath = null;
      }
      
      console.log('✅ Recorder cleanup completed');
    } catch (error) {
      console.warn('⚠️ Recorder cleanup error:', error.message);
    }
  }
}

module.exports = Recorder; 