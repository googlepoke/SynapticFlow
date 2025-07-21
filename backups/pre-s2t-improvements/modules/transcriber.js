const OpenAI = require('openai');
const fs = require('fs');
const Store = require('electron-store');
const path = require('path');

class Transcriber {
  constructor() {
    this.store = new Store();
    this.openai = null;
    this.initializeOpenAI();
  }

  initializeOpenAI() {
    const apiKey = this.store.get('openai-api-key');
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey: apiKey,
        timeout: 30000, // 30 second timeout for faster failures
        maxRetries: 2   // Reduce retries for faster response
      });
    }
  }

  setApiKey(apiKey) {
    this.store.set('openai-api-key', apiKey);
    this.openai = new OpenAI({
      apiKey: apiKey,
      timeout: 30000,
      maxRetries: 2
    });
  }

  async transcribe(audioFilePath) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const startTime = Date.now();
    // console.log('=== TRANSCRIPTION STARTED ===');

    try {
      // Check if file exists and get its size
      const stats = await fs.promises.stat(audioFilePath);
      // console.log(`Audio file size: ${(stats.size / 1024).toFixed(2)} KB`);
      
      // Optimize for small files (under 1MB) - common for voice recordings
      if (stats.size > 25 * 1024 * 1024) { // 25MB limit for Whisper API
        throw new Error('Audio file too large for transcription (max 25MB)');
      }

      // Use createReadStream for better memory efficiency
      const audioFile = fs.createReadStream(audioFilePath);

      // Optimized transcription parameters for speed
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "en", // Explicit language for faster processing
        response_format: "text", // Text format is fastest
        temperature: 0, // Deterministic output for consistency
        // Skip prompt for faster processing unless needed
      });

      const duration = Date.now() - startTime;
      // console.log(`=== TRANSCRIPTION COMPLETED in ${duration}ms ===`);

      // Clean up the temporary file asynchronously
      fs.promises.unlink(audioFilePath).catch(err => {
        // console.warn('Could not delete temp file:', err.message);
      });

      return transcription;
    } catch (error) {
      const duration = Date.now() - startTime;
      // console.error(`=== TRANSCRIPTION FAILED after ${duration}ms ===`);
      
      // Clean up the temporary file even if transcription fails
      fs.promises.unlink(audioFilePath).catch(err => {
        // console.warn('Could not delete temp file:', err.message);
      });

      // Enhanced error handling with more specific messages
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.error?.message || 'Unknown API error';
        
        if (status === 413) {
          throw new Error('Audio file too large for transcription');
        } else if (status === 429) {
          throw new Error('Rate limit exceeded - please wait and try again');
        } else if (status === 400) {
          throw new Error('Invalid audio format - please try recording again');
        } else {
          throw new Error(`OpenAI API Error (${status}): ${message}`);
        }
      } else if (error.request) {
        throw new Error('Network error: Could not reach OpenAI API (check internet connection)');
      } else if (error.code === 'ENOENT') {
        throw new Error('Audio file not found - recording may have failed');
      } else {
        throw new Error(`Transcription error: ${error.message}`);
      }
    }
  }

  async testConnection() {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // console.log('Testing OpenAI API connection...');
      const startTime = Date.now();
      
      // Test with a lightweight API call
      const models = await this.openai.models.retrieve("whisper-1");
      
      const duration = Date.now() - startTime;
      // console.log(`API test completed in ${duration}ms`);
      
      return true;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API key');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded');
      } else {
        throw new Error(`API test failed: ${error.message}`);
      }
    }
  }
}

module.exports = Transcriber; 