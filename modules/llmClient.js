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

  // Valid OpenAI model names
  getValidOpenAIModels() {
    return [
      'gpt-4-preview',        // GPT-4.5 Preview
      'gpt-4o',               // GPT-4o
      'gpt-4.1',              // GPT-4.1
      'gpt-4.1-mini',         // GPT-4.1 Mini
      'gpt-4o-mini',          // GPT-4o Mini
      'gpt-3.5-turbo',        // GPT-3.5 Turbo
      'gpt-4.1-nano'          // GPT-4.1 Nano
    ];
  }

  validateModel(model) {
    const validModels = this.getValidOpenAIModels();
    const nonOpenAIModels = ['Claude-3.5-Sonnet', 'DeepSeek-R1', 'Meta-Llama-3.1-8B-Instruct'];
    
    // Allow both OpenAI and non-OpenAI models
    if (!validModels.includes(model) && !nonOpenAIModels.includes(model)) {
      console.warn(`Warning: Model "${model}" may not be supported. Using default model instead.`);
      return 'gpt-4o-mini';  // Fallback to default
    }
    
    // Only validate OpenAI models with the API
    if (validModels.includes(model)) {
      return model;
    }
    
    // For non-OpenAI models, return as-is (handled by external services)
    return model;
  }

  async getResponse(prompt, options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const defaultOptions = {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    // Validate and ensure model compatibility
    finalOptions.model = this.validateModel(finalOptions.model);

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

  async getResponseWithRAG(prompt, ragAssociations = [], options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    if (!ragAssociations || ragAssociations.length === 0) {
      // No RAG associations, use regular getResponse
      return this.getResponse(prompt, options);
    }

    const defaultOptions = {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    // Validate and ensure model compatibility
    finalOptions.model = this.validateModel(finalOptions.model);

    try {
      // Prepare vector store IDs and parameters from RAG associations
      const vectorStoreIds = [];
      let maxNumResults = 8;
      let includeSearchResults = true;

      // Process RAG associations to extract vector store IDs and parameters
      ragAssociations.forEach(assoc => {
        if (assoc.vectorStoreId) {
          vectorStoreIds.push(assoc.vectorStoreId);
          // Use the highest max results value among associations
          if (assoc.maxResults && assoc.maxResults > maxNumResults) {
            maxNumResults = assoc.maxResults;
          }
          // If any association wants to exclude results, exclude them
          if (assoc.includeResults === false) {
            includeSearchResults = false;
          }
        }
      });

      if (vectorStoreIds.length === 0) {
        // No valid vector store IDs, use regular getResponse
        return this.getResponse(prompt, options);
      }

      // Build the tools configuration for file search
      const tools = [{
        type: "file_search",
        file_search: {
          max_num_results: Math.min(maxNumResults, 20), // OpenAI limit is 20
          include_search_results: includeSearchResults
        }
      }];

      const completion = await this.openai.chat.completions.create({
        model: finalOptions.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that processes voice transcripts and provides clear, concise responses based on user instructions. Use the file search tool to find relevant information from the connected vector stores to enhance your responses.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        tools: tools,
        tool_choice: "auto",
        temperature: finalOptions.temperature,
        max_tokens: finalOptions.max_tokens,
        top_p: finalOptions.top_p,
        frequency_penalty: finalOptions.frequency_penalty,
        presence_penalty: finalOptions.presence_penalty,
        // Attach vector stores for file search
        tool_resources: {
          file_search: {
            vector_store_ids: vectorStoreIds
          }
        }
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

  // NEW: Responses API method for regular responses
  async getResponseWithResponsesAPI(prompt, options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const defaultOptions = {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_output_tokens: 1000  // Responses API uses max_output_tokens
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    // Validate and ensure model compatibility
    finalOptions.model = this.validateModel(finalOptions.model);

    try {
      const response = await this.openai.responses.create({
        model: finalOptions.model,
        input: prompt,
        temperature: finalOptions.temperature,
        max_output_tokens: finalOptions.max_output_tokens  // Use correct parameter name
      });

      // Extract response text and create enhanced format for consistency
      const responseText = response.output[0]?.content?.[0]?.text || 'No response generated';
      const citations = response.output[0]?.content?.[0]?.annotations || [];
      
      return {
        text: responseText,
        webSearchUsed: false,
        ragUsed: false,
        citations: citations,
        metadata: {
          totalOutputItems: response.output?.length || 0,
          hasAnnotations: citations.length > 0
        }
      };
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

  // NEW: Responses API method for RAG responses
  async getResponseWithRAGUsingResponsesAPI(prompt, ragAssociations = [], options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    if (!ragAssociations || ragAssociations.length === 0) {
      // No RAG associations, use regular Responses API
      return this.getResponseWithResponsesAPI(prompt, options);
    }

    const defaultOptions = {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_output_tokens: 1000  // Responses API uses max_output_tokens
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    // Validate and ensure model compatibility
    finalOptions.model = this.validateModel(finalOptions.model);

    try {
      // Prepare vector store IDs and parameters from RAG associations
      const vectorStoreIds = [];
      let maxNumResults = 8;

      // Process RAG associations to extract vector store IDs and parameters
      ragAssociations.forEach(assoc => {
        if (assoc.vectorStoreId) {
          vectorStoreIds.push(assoc.vectorStoreId);
          // Use the highest max results value among associations
          if (assoc.maxResults && assoc.maxResults > maxNumResults) {
            maxNumResults = assoc.maxResults;
          }
        }
      });

      if (vectorStoreIds.length === 0) {
        // No valid vector store IDs, use regular Responses API
        return this.getResponseWithResponsesAPI(prompt, options);
      }

      // Build the tools configuration for file search (Responses API format)
      const tools = [{
        type: "file_search",
        vector_store_ids: vectorStoreIds,
        max_num_results: Math.min(maxNumResults, 20) // OpenAI limit is 20
      }];

      const response = await this.openai.responses.create({
        model: finalOptions.model,
        input: prompt,
        tools: tools,
        temperature: finalOptions.temperature,
        max_output_tokens: finalOptions.max_output_tokens,  // Use correct parameter name
        // Include search results for debugging
        include: ['output[*].file_search_call.search_results']
      });

      // Check if RAG search was actually used
      const ragUsed = response.output?.some(item => item.type === 'file_search_call') || false;
      console.log('📁 RAG search actually used:', ragUsed);
      
      // Extract text and metadata
      const finalMessage = response.output?.find(item => item.type === 'message' && item.content) || response.output?.[response.output.length - 1];
      const responseText = finalMessage?.content?.[0]?.text || 'No response generated';
      const citations = finalMessage?.content?.[0]?.annotations || [];
      
      console.log('📄 RAG Response text length:', responseText.length);
      console.log('📚 RAG Citations found:', citations.length);
      
      // Return enhanced response with metadata
      return {
        text: responseText,
        webSearchUsed: false,
        ragUsed: ragUsed,
        citations: citations,
        metadata: {
          totalOutputItems: response.output?.length || 0,
          hasAnnotations: citations.length > 0
        }
      };
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

  // Get current settings from storage
  getCurrentSettings() {
    return {
      model: this.store.get('selected-model', 'gpt-4o-mini'),
      temperature: this.store.get('temperature', 0.7),
      maxTokens: this.store.get('max-tokens', 1000)
    };
  }

  // Web search using Responses API
  async getResponseWithWebSearchUsingResponsesAPI(prompt, webSearchConfig = {}, options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const settings = this.getCurrentSettings();
    const defaultOptions = {
      model: settings.model,
      temperature: settings.temperature,
      max_output_tokens: settings.maxTokens
    };

    const finalOptions = { ...defaultOptions, ...options };
    finalOptions.model = this.validateModel(finalOptions.model);

    try {
      console.log('🌐 Creating standalone web search request');
      console.log('Web search config received:', JSON.stringify(webSearchConfig, null, 2));
      console.log('Final options:', JSON.stringify(finalOptions, null, 2));
      
      // Create web search tool
      const webSearchTool = {
        type: "web_search"
      };
      
      // NOTE: OpenAI's web search does NOT support 'sites' parameter
      // The sites configuration is for UI display only
      console.log('Standalone web search tool created:', JSON.stringify(webSearchTool, null, 2));

      const requestData = {
        model: finalOptions.model,
        input: prompt,
        tools: [webSearchTool],
        temperature: finalOptions.temperature,
        max_output_tokens: finalOptions.max_output_tokens
      };
      
      console.log('🚀 Sending request to OpenAI:', JSON.stringify(requestData, null, 2));
      
      const response = await this.openai.responses.create(requestData);
      
      console.log('✅ Received response from OpenAI');
      console.log('Response output length:', response.output?.length || 0);
      console.log('Response structure:', response.output?.map(item => ({ type: item.type, id: item.id })) || []);

      // Check if web search was actually used
      const webSearchUsed = response.output?.some(item => item.type === 'web_search_call') || false;
      console.log('🔍 Web search actually used:', webSearchUsed);
      
      // Extract text and metadata
      const finalMessage = response.output?.find(item => item.type === 'message' && item.content) || response.output?.[response.output.length - 1];
      const responseText = finalMessage?.content?.[0]?.text || 'No response generated';
      const citations = finalMessage?.content?.[0]?.annotations || [];
      
      console.log('📄 Response text length:', responseText.length);
      console.log('📚 Citations found:', citations.length);
      
      // Return enhanced response with metadata
      return {
        text: responseText,
        webSearchUsed: webSearchUsed,
        citations: citations,
        metadata: {
          totalOutputItems: response.output?.length || 0,
          hasAnnotations: citations.length > 0
        }
      };
    } catch (error) {
      console.error('❌ Error in web search request:');
      console.error('Error details:', error);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        throw new Error(`OpenAI API Error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`);
      } else if (error.request) {
        console.error('Request details:', error.request);
        throw new Error('Network error: Could not reach OpenAI API');
      } else {
        console.error('Error message:', error.message);
        throw new Error(`LLM error: ${error.message}`);
      }
    }
  }

  // Combined RAG + Web Search using Responses API
  async getResponseWithRAGAndWebSearchUsingResponsesAPI(prompt, ragAssociations = [], webSearchConfig = {}, options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const settings = this.getCurrentSettings();
    const defaultOptions = {
      model: settings.model,
      temperature: settings.temperature,
      max_output_tokens: settings.maxTokens
    };

    const finalOptions = { ...defaultOptions, ...options };
    finalOptions.model = this.validateModel(finalOptions.model);

    try {
      const tools = [];

      // Add file search (RAG) if available
      if (ragAssociations && ragAssociations.length > 0) {
        const vectorStoreIds = ragAssociations
          .map(assoc => assoc.vectorStoreId)
          .filter(id => id);
        
        if (vectorStoreIds.length > 0) {
          tools.push({
            type: "file_search",
            vector_store_ids: vectorStoreIds,
            max_num_results: Math.min(ragAssociations[0]?.maxResults || 8, 20)
          });
        }
      }

      // Add web search if enabled
      if (webSearchConfig.enabled) {
        console.log('🌐 Adding web search tool to request');
        console.log('Web search config:', JSON.stringify(webSearchConfig, null, 2));
        
        const webSearchTool = {
          type: "web_search"
        };
        
        // NOTE: OpenAI's web search does NOT support 'sites' parameter
        // The sites configuration is for UI display only
        console.log('Web search tool created:', JSON.stringify(webSearchTool, null, 2));
        
        tools.push(webSearchTool);
      }

      const requestData = {
        model: finalOptions.model,
        input: prompt,
        tools: tools,
        temperature: finalOptions.temperature,
        max_output_tokens: finalOptions.max_output_tokens
      };
      
      console.log('🚀 Sending combined RAG + Web Search request to OpenAI');
      console.log('Request tools:', JSON.stringify(tools.map(t => ({type: t.type, vectorStoreIds: t.vector_store_ids})), null, 2));
      console.log('Final options:', JSON.stringify(finalOptions, null, 2));
      
      const response = await this.openai.responses.create(requestData);
      
      console.log('✅ Received response from OpenAI (RAG + Web Search)');
      console.log('Response output length:', response.output?.length || 0);
      console.log('Response structure:', response.output?.map(item => ({ type: item.type, id: item.id })) || []);

      // Check if web search was actually used
      const webSearchUsed = response.output?.some(item => item.type === 'web_search_call') || false;
      const ragUsed = response.output?.some(item => item.type === 'file_search_call') || false;
      console.log('🔍 Web search actually used:', webSearchUsed);
      console.log('📁 RAG search actually used:', ragUsed);
      
      // Extract text and metadata
      const finalMessage = response.output?.find(item => item.type === 'message' && item.content) || response.output?.[response.output.length - 1];
      const responseText = finalMessage?.content?.[0]?.text || 'No response generated';
      const citations = finalMessage?.content?.[0]?.annotations || [];
      
      console.log('📄 Response text length:', responseText.length);
      console.log('📚 Citations found:', citations.length);
      
      // Return enhanced response with metadata
      return {
        text: responseText,
        webSearchUsed: webSearchUsed,
        ragUsed: ragUsed,
        citations: citations,
        metadata: {
          totalOutputItems: response.output?.length || 0,
          hasAnnotations: citations.length > 0
        }
      };
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

  // NEW: Method to choose which API to use based on feature flag
  async getResponseSmart(prompt, ragAssociations = [], webSearchConfig = {}, options = {}) {
    console.log('🧠 LLM CLIENT - getResponseSmart called with:');
    console.log('- RAG associations:', ragAssociations.length);
    console.log('- Web search config:', JSON.stringify(webSearchConfig, null, 2));
    
    const useResponsesAPI = this.store.get('use-responses-api', false);
    console.log('- Using Responses API:', useResponsesAPI);
    
    const settings = this.getCurrentSettings();
    
    // Merge settings with provided options (options take precedence)
    const finalOptions = {
      model: settings.model,
      temperature: settings.temperature,
      ...options
    };
    
    if (useResponsesAPI) {
      // Use Responses API - supports web search
      finalOptions.max_output_tokens = settings.maxTokens;
      delete finalOptions.max_tokens;
      
      const hasRAG = ragAssociations && ragAssociations.length > 0;
      const hasWebSearch = webSearchConfig && webSearchConfig.enabled;
      
      console.log('🔍 API Decision Logic:');
      console.log('- Has RAG:', hasRAG);
      console.log('- Has Web Search:', hasWebSearch);
      console.log('- webSearchConfig.enabled:', webSearchConfig.enabled);
      
      if (hasRAG && hasWebSearch) {
        console.log('➡️ Calling: getResponseWithRAGAndWebSearchUsingResponsesAPI');
        return this.getResponseWithRAGAndWebSearchUsingResponsesAPI(prompt, ragAssociations, webSearchConfig, finalOptions);
      } else if (hasWebSearch) {
        console.log('➡️ Calling: getResponseWithWebSearchUsingResponsesAPI');
        return this.getResponseWithWebSearchUsingResponsesAPI(prompt, webSearchConfig, finalOptions);
      } else if (hasRAG) {
        console.log('➡️ Calling: getResponseWithRAGUsingResponsesAPI');
        return this.getResponseWithRAGUsingResponsesAPI(prompt, ragAssociations, finalOptions);
      } else {
        console.log('➡️ Calling: getResponseWithResponsesAPI (no tools)');
        return this.getResponseWithResponsesAPI(prompt, finalOptions);
      }
    } else {
      // Use Chat Completions API - no web search support
      finalOptions.max_tokens = settings.maxTokens;
      delete finalOptions.max_output_tokens;
      
      if (webSearchConfig && webSearchConfig.enabled) {
        console.warn('Web search requires Responses API. Please enable it in Settings.');
      }
      
      if (ragAssociations && ragAssociations.length > 0) {
        return this.getResponseWithRAG(prompt, ragAssociations, finalOptions);
      } else {
        return this.getResponse(prompt, finalOptions);
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