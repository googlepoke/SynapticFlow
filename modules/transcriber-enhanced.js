const OpenAI = require('openai');
const fs = require('fs');
const Store = require('electron-store');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Enhanced Transcription Configuration
const TRANSCRIPTION_CONFIG = {
  MAX_FILE_SIZE_MB: 20,           // 20MB maximum per chunk (under Whisper's 25MB limit)
  CHUNK_DURATION_SECONDS: 30,    // 30-second chunks for optimal processing
  MIN_CHUNK_SIZE_KB: 10,          // Minimum 10KB per chunk
  MAX_RETRIES: 3,                 // Maximum retry attempts per chunk
  RETRY_DELAY_BASE: 1000,         // Base delay for exponential backoff (1 second)
  OVERLAP_SECONDS: 2              // 2-second overlap between chunks for continuity
};

class EnhancedTranscriber {
  constructor() {
    this.store = new Store();
    this.openai = null;
    this.ffmpegPath = ffmpegStatic;
    this.initializeOpenAI();
    this.setupFFmpeg();
  }

  // Setup FFmpeg configuration
  setupFFmpeg() {
    ffmpeg.setFfmpegPath(this.ffmpegPath);
    console.log('✅ FFmpeg initialized for audio chunking');
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

  // Main transcription method with enhanced chunking support
  async transcribe(audioFilePath) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const startTime = Date.now();
    console.log('=== ENHANCED TRANSCRIPTION STARTED ===');

    try {
      // Validate file and determine processing method
      const fileValidation = await this.validateAudioFile(audioFilePath);
      
      if (fileValidation.needsChunking) {
        console.log(`📦 Large file detected (${fileValidation.fileSizeMB.toFixed(2)}MB) - using chunked transcription`);
        return await this.transcribeWithChunking(audioFilePath);
      } else {
        console.log(`📄 Standard file size (${fileValidation.fileSizeMB.toFixed(2)}MB) - using single file transcription`);
        return await this.transcribeSingleFile(audioFilePath);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`=== TRANSCRIPTION FAILED after ${duration}ms ===`);
      throw error;
    }
  }

  // File validation method
  async validateAudioFile(filePath) {
    const stats = await fs.promises.stat(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    console.log(`📊 Audio file analysis: ${fileSizeMB.toFixed(2)}MB`);
    
    // Check minimum file size
    if (stats.size < 1024) {
      throw new Error('Audio file too small - no speech detected');
    }
    
    // Check if chunking is needed
    const needsChunking = fileSizeMB > TRANSCRIPTION_CONFIG.MAX_FILE_SIZE_MB;
    
    return {
      fileSizeMB,
      needsChunking,
      fileSize: stats.size
    };
  }

  // Single file transcription with retry logic
  async transcribeSingleFile(audioFilePath) {
    for (let attempt = 1; attempt <= TRANSCRIPTION_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const startTime = Date.now();
        const stats = await fs.promises.stat(audioFilePath);
        console.log(`🎵 Transcribing single file: ${(stats.size / 1024).toFixed(2)} KB (attempt ${attempt}/${TRANSCRIPTION_CONFIG.MAX_RETRIES})`);
        
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
        });

        const duration = Date.now() - startTime;
        console.log(`✅ Single file transcription completed in ${duration}ms`);

        // Clean up the temporary file asynchronously
        fs.promises.unlink(audioFilePath).catch(err => {
          console.warn('Could not delete temp file:', err.message);
        });

        return transcription;

      } catch (error) {
        if (attempt === TRANSCRIPTION_CONFIG.MAX_RETRIES) {
          // Clean up the temporary file even if transcription fails
          fs.promises.unlink(audioFilePath).catch(err => {
            console.warn('Could not delete temp file:', err.message);
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
        
        const delay = TRANSCRIPTION_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
        console.log(`⚠️ Transcription attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Chunked transcription for large files
  async transcribeWithChunking(audioFilePath) {
    console.log('🔄 Starting chunked transcription process...');
    
    try {
      // Create audio chunks
      const chunks = await this.createAudioChunks(audioFilePath);
      
      if (chunks.length === 0) {
        throw new Error('Failed to create audio chunks');
      }
      
      console.log(`📦 Created ${chunks.length} audio chunks`);
      
      // Transcribe each chunk
      const transcriptions = [];
      
      for (let i = 0; i < chunks.length; i++) {
        try {
          console.log(`🎵 Transcribing chunk ${i + 1}/${chunks.length}...`);
          
          const chunkTranscription = await this.transcribeSingleChunk(chunks[i], i + 1);
          
          if (chunkTranscription && chunkTranscription.trim()) {
            transcriptions.push(chunkTranscription.trim());
          }
          
        } catch (error) {
          console.error(`❌ Error transcribing chunk ${i + 1}:`, error.message);
          // Continue with other chunks instead of failing completely
        } finally {
          // Clean up chunk file immediately after processing
          try {
            await fs.promises.unlink(chunks[i]);
          } catch (cleanupError) {
            console.warn(`Could not delete chunk ${i + 1}:`, cleanupError.message);
          }
        }
      }
      
      // Clean up original file
      fs.promises.unlink(audioFilePath).catch(err => {
        console.warn('Could not delete original temp file:', err.message);
      });
      
      // Combine all transcriptions
      const fullTranscription = transcriptions.join(' ');
      
      console.log(`✅ Chunked transcription completed: ${transcriptions.length}/${chunks.length} chunks successful`);
      
      if (fullTranscription.trim()) {
        return fullTranscription;
      } else {
        throw new Error('No successful transcriptions from any chunks');
      }
      
    } catch (error) {
      // Clean up original file on error
      fs.promises.unlink(audioFilePath).catch(err => {
        console.warn('Could not delete temp file:', err.message);
      });
      
      throw new Error(`Chunked transcription failed: ${error.message}`);
    }
  }

  // Create audio chunks using FFmpeg
  async createAudioChunks(inputFilePath) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const tempDir = os.tmpdir();
      
      // Get audio duration first
      ffmpeg.ffprobe(inputFilePath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to analyze audio file: ${err.message}`));
          return;
        }
        
        const duration = metadata.format.duration;
        const chunkDuration = TRANSCRIPTION_CONFIG.CHUNK_DURATION_SECONDS;
        const numChunks = Math.ceil(duration / chunkDuration);
        
        console.log(`🎬 Audio duration: ${duration.toFixed(2)}s, creating ${numChunks} chunks`);
        
        let processedChunks = 0;
        
        for (let i = 0; i < numChunks; i++) {
          const startTime = i * chunkDuration;
          const chunkPath = path.join(tempDir, `chunk_${Date.now()}_${i}.webm`);
          
          ffmpeg(inputFilePath)
            .seekInput(startTime)
            .duration(chunkDuration)
            .audioCodec('copy')
            .format('webm')
            .output(chunkPath)
            .on('end', () => {
              processedChunks++;
              
              // Validate chunk size
              try {
                const stats = fs.statSync(chunkPath);
                if (stats.size > TRANSCRIPTION_CONFIG.MIN_CHUNK_SIZE_KB * 1024) {
                  chunks.push(chunkPath);
                  console.log(`✅ Chunk ${i + 1} created: ${(stats.size / 1024).toFixed(2)} KB`);
                } else {
                  console.warn(`⚠️ Chunk ${i + 1} too small, skipping`);
                  fs.unlinkSync(chunkPath);
                }
              } catch (statError) {
                console.warn(`⚠️ Could not validate chunk ${i + 1}:`, statError.message);
              }
              
              // Check if all chunks are processed
              if (processedChunks === numChunks) {
                resolve(chunks);
              }
            })
            .on('error', (error) => {
              console.error(`❌ Error creating chunk ${i + 1}:`, error.message);
              processedChunks++;
              
              if (processedChunks === numChunks) {
                resolve(chunks);
              }
            })
            .run();
        }
      });
    });
  }

  // Transcribe a single chunk with retry logic
  async transcribeSingleChunk(chunkPath, chunkNumber) {
    for (let attempt = 1; attempt <= TRANSCRIPTION_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const audioFile = fs.createReadStream(chunkPath);
        
        const transcription = await this.openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          language: "en",
          response_format: "text",
          temperature: 0,
        });
        
        console.log(`✅ Chunk ${chunkNumber} transcribed successfully (attempt ${attempt})`);
        return transcription;
        
      } catch (error) {
        if (attempt === TRANSCRIPTION_CONFIG.MAX_RETRIES) {
          throw error;
        }
        
        const delay = TRANSCRIPTION_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
        console.log(`⚠️ Chunk ${chunkNumber} attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Test connection method
  async testConnection() {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      console.log('Testing OpenAI API connection...');
      const startTime = Date.now();
      
      // Test with a lightweight API call
      const models = await this.openai.models.retrieve("whisper-1");
      
      const duration = Date.now() - startTime;
      console.log(`API test completed in ${duration}ms`);
      
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

module.exports = EnhancedTranscriber; 