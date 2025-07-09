# Voice-to-LLM Desktop Assistant

A powerful Windows desktop application that converts your voice to text and processes it with OpenAI's GPT models, then injects the response into any focused text field.

## 🎤 Features

- **Push-to-Talk**: Hold `Win + Alt` to record, release to process
- **Voice Transcription**: Uses OpenAI Whisper API for accurate speech-to-text
- **LLM Processing**: Integrates with GPT-4o, GPT-4, or GPT-3.5 Turbo
- **Text Injection**: Automatically pastes responses into focused applications
- **Instruction Templates**: Pre-built prompts for common tasks
- **Custom Instructions**: Write your own markdown-formatted instructions
- **Settings Management**: Configure model, temperature, and token limits
- **Secure API Storage**: Local, encrypted storage of your OpenAI API key
- **Node.js v24 Support**: Fully compatible with the latest Node.js versions

## 🚀 Quick Start

### Prerequisites

- Windows 10/11
- **Node.js 20+ (including v24)** - Download from https://nodejs.org/
- OpenAI API key
- Microphone access

### Installation

1. **Clone or download this repository**
   ```bash
   git clone <repository-url>
   cd voice-to-llm-desktop-assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Configure your OpenAI API key**
   - Enter your API key in the application
   - Click "Save" to store it securely
   - Click "Test" to verify the connection

## 📖 Usage Guide

### Basic Workflow

1. **Set up your instruction**: Choose a template or write your own
2. **Focus on target application**: Click where you want the response
3. **Hold `Win + Alt`**: Start recording your voice
4. **Speak clearly**: Record for 10-30 seconds
5. **Release keys**: Processing begins automatically
6. **Get response**: The LLM response is injected into your focused field

### Instruction Templates

- **Rewrite**: Convert to professional language
- **Summarize**: Create concise summaries
- **Translate**: Translate to English
- **Expand**: Elaborate on ideas
- **Simplify**: Make content clearer
- **Formal**: Business language conversion
- **Casual**: Conversational tone
- **Bullet Points**: Convert to list format
- **Questions**: Generate related questions
- **Action Items**: Extract tasks and actions

### Custom Instructions

Write your own instructions using markdown:

```
Please analyze the following transcript and provide:
1. Key points summary
2. Action items
3. Follow-up questions

Format the response in a structured manner.
```

### Settings

- **Model**: Choose between GPT-4o, GPT-4, or GPT-3.5 Turbo
- **Temperature**: Control creativity (0.0 = focused, 1.0 = creative)
- **Max Tokens**: Limit response length (100-4000)

## 🔧 Configuration

### API Key Setup

1. Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Enter it in the application's API configuration section
3. Click "Save" to store it locally
4. Click "Test" to verify connectivity

### Hotkey Customization

The default hotkey is `Win + Alt`. To change this, modify the hotkey listener in `main.js`:

```javascript
// Look for 'Left Windows' and 'Left Alt' in the listener
if (e.name === 'Left Windows' || e.name === 'Right Windows') winPressed = true;
if (e.name === 'Left Alt' || e.name === 'Right Alt') altPressed = true;
```

### Audio Settings

The application uses these default audio settings:
- Sample rate: 16kHz
- Format: WAV
- Duration: Up to 30 seconds

## 🏗️ Building for Distribution

### Create Windows Executable

```bash
npm run build
```

The executable will be created in the `dist` folder.

### Portable Mode

For portable installation:
1. Run the build command
2. Copy the entire `dist` folder
3. Run the `.exe` file from any location

## 🔒 Security

- API keys are stored locally using `electron-store`
- No data is sent to external servers except OpenAI
- Clipboard content is restored after injection
- Temporary audio files are automatically deleted

## 🐛 Troubleshooting

### Common Issues

**"API key not configured"**
- Enter your OpenAI API key in the settings
- Click "Save" and "Test" to verify

**"Recording failed"**
- Check microphone permissions
- Ensure microphone is not in use by other applications
- Try restarting the application

**"Text injection not working"**
- Click "Test Injection" to verify functionality
- Ensure target application accepts paste operations
- Try focusing on a different text field

**"Hotkey not responding"**
- Check if another application is using the same hotkey
- Restart the application
- Verify Windows permissions

**"npm install fails with 404 errors"**
- Make sure you're using Node.js v20+ 
- Clear npm cache: `npm cache clean --force`
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again

### Debug Mode

Run with debug logging:
```bash
npm run dev
```

### Logs

Check the console output for detailed error messages and debugging information.

## 📁 Project Structure

```
voice-to-llm-desktop-assistant/
├── main.js                 # Main Electron process
├── index.html             # Application interface
├── styles.css             # UI styling
├── renderer.js            # Frontend logic
├── modules/
│   ├── recorder.js        # Audio recording
│   ├── transcriber.js     # Speech-to-text
│   ├── promptBuilder.js   # Prompt construction
│   ├── llmClient.js       # OpenAI API client
│   └── injector.js        # Text injection
├── package.json           # Dependencies and scripts
└── README.md             # This file
```

## 🧰 Dependencies

This application uses the following key dependencies:
- **Electron**: Desktop application framework
- **OpenAI**: For Whisper transcription and GPT chat completion
- **node-global-key-listener**: Global hotkey detection (Node.js v24 compatible)
- **kbm-robot**: Keyboard and mouse automation
- **clipboardy**: Cross-platform clipboard access
- **electron-store**: Secure local storage

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- OpenAI for Whisper and GPT APIs
- Electron team for the desktop framework
- Contributors and testers

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Search existing issues
3. Create a new issue with detailed information

---

**Note**: This application requires an active internet connection and valid OpenAI API key to function. API usage incurs costs based on OpenAI's pricing. 