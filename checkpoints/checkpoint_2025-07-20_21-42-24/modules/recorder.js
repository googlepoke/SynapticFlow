const fs = require('fs');
const path = require('path');
const os = require('os');
const { BrowserWindow, ipcMain } = require('electron');

class Recorder {
  constructor() {
    this.recording = false;
    this.tempFilePath = null;
    this.recordingPromise = null;
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
        
        // console.log('Sending start-recording message to renderer...');
        mainWindow.webContents.send('start-recording');

        // Set up timeout for recording (30 seconds max)
        this.recordingTimeout = setTimeout(() => {
          // console.log('Recording timeout reached (30 seconds)');
          if (this.recording) {
            this.stop().catch(console.error);
          }
        }, 30000);

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

      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }

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
    // console.log('=== RECORDER: handleRecordingData called ===');
    // console.log('audioData received:', audioData ? `${audioData.length} bytes` : 'null/undefined');
    
    if (!this.recordingPromise) {
      // console.log('Received recording data but no promise waiting');
      return;
    }

    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }

    if (audioData && Array.isArray(audioData) && audioData.length > 0) {
      // Save audio data directly without slow conversion
      const tempDir = os.tmpdir();
      const timestamp = Date.now();
      
      // Use WebM format directly - OpenAI Whisper supports WebM
      const audioFile = path.join(tempDir, `recording_${timestamp}.webm`);
      
      // console.log('=== SAVING AUDIO FILE ===');
      // console.log('File path:', audioFile);
      // console.log('Audio data size:', audioData.length, 'bytes');
      
      const startTime = Date.now();
      const buffer = Buffer.from(audioData);
      
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
      // console.error('Invalid or empty audio data received');
      this.recordingPromise.reject(new Error('No audio data received'));
      this.recordingPromise = null;
    }
  }

  isRecording() {
    return this.recording;
  }

  cleanup() {
    // Clean up temporary file if it exists
    if (this.tempFilePath && fs.existsSync(this.tempFilePath)) {
      fs.unlinkSync(this.tempFilePath);
      this.tempFilePath = null;
    }
  }
}

module.exports = Recorder; 