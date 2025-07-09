const OpenAI = require('openai');
const Store = require('electron-store');

class LLMClient {
  constructor(apiKey = null) {
    this.store = new Store();
    this.openai = null;
    
    if (apiKey) {
      this.setApiKey(apiKey);
    } else {
      this.initializeOpenAI();
    }
  }

  initializeOpenAI() {
    const apiKey = this.store.get('openai-api-key');
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey: apiKey
      });
    }
  }

  setApiKey(apiKey) {
    this.store.set('openai-api-key', apiKey);
    this.openai = new OpenAI({
      apiKey: apiKey
    });
  }

  async getResponse(prompt, options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const defaultOptions = {
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };

    const finalOptions = { ...defaultOptions, ...options };

    try {
      const completion = await this.openai.chat.completions.create({
        model: finalOptions.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that processes voice transcripts and provides clear, concise responses based on user instructions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: finalOptions.temperature,
        max_tokens: finalOptions.max_tokens,
        top_p: finalOptions.top_p,
        frequency_penalty: finalOptions.frequency_penalty,
        presence_penalty: finalOptions.presence_penalty
      });

      return completion.choices[0].message.content;
    } catch (error) {
      if (error.response) {
        throw new Error(`OpenAI API Error: ${error.response.status} - ${error.response.data.error.message}`);
      } else if (error.request) {
        throw new Error('Network error: Could not reach OpenAI API');
      } else {
        throw new Error(`LLM error: ${error.message}`);
      }
    }
  }

  async testConnection() {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Test with a simple prompt
      const response = await this.getResponse('Hello, this is a test message.', {
        max_tokens: 10,
        temperature: 0
      });
      return true;
    } catch (error) {
      throw new Error(`API test failed: ${error.message}`);
    }
  }

  // Get available models
  async getAvailableModels() {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const models = await this.openai.models.list();
      return models.data
        .filter(model => model.id.includes('gpt'))
        .map(model => ({
          id: model.id,
          name: model.id
        }));
    } catch (error) {
      throw new Error(`Failed to fetch models: ${error.message}`);
    }
  }

  // Get usage statistics
  async getUsage() {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const usage = await this.openai.usage.retrieve();
      return usage;
    } catch (error) {
      throw new Error(`Failed to fetch usage: ${error.message}`);
    }
  }
}

module.exports = LLMClient; 