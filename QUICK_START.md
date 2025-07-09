# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### 1. Prerequisites
- Windows 10/11
- **Node.js 20+ (including v24)** - Download from https://nodejs.org/
- OpenAI API key (get from https://platform.openai.com/api-keys)

### 2. Installation
```bash
# Option A: Use the installer script
double-click install.bat

# Option B: Manual installation
npm install
npm start
```

**Note**: If you encounter 404 errors during installation, make sure you're using Node.js v20+ and try:
```bash
npm cache clean --force
rm -rf node_modules package-lock.json  # Or delete manually
npm install
```

### 3. First Time Setup
1. **Enter your OpenAI API key** in the application
2. **Click "Save"** to store it securely
3. **Click "Test"** to verify the connection
4. **Choose an instruction template** or write your own

### 4. Start Using
1. **Focus on any text field** (browser, Notepad, VS Code, etc.)
2. **Hold `Win + Alt`** and speak clearly
3. **Release the keys** when done speaking
4. **Wait for processing** (Listening → Transcribing → Thinking → Done)
5. **Get your response** automatically pasted into the focused field

## 🎯 Common Use Cases

### Writing Emails
- Template: "Formal"
- Speak: "I need to schedule a meeting with the marketing team next week"
- Result: Professional email draft

### Taking Notes
- Template: "Bullet Points"
- Speak: "Meeting agenda: discuss Q4 goals, review budget, plan team building"
- Result: Organized bullet points

### Summarizing Content
- Template: "Summarize"
- Speak: "Long meeting discussion about project timeline and resource allocation"
- Result: Concise summary

### Translation
- Template: "Translate"
- Speak: "Hola, necesito ayuda con el proyecto"
- Result: "Hello, I need help with the project"

## ⚙️ Custom Instructions

Write your own instructions for specific tasks:

```
Please convert the following transcript into:
1. A professional email
2. A meeting agenda
3. Action items for follow-up

Use formal business language and structure the response clearly.
```

## 🔧 Troubleshooting

### "API key not configured"
- Enter your OpenAI API key and click "Save"

### "Recording failed"
- Check microphone permissions
- Ensure no other app is using the microphone

### "Text injection not working"
- Click "Test Injection" to verify
- Make sure you're focused on a text field

### "npm install fails"
- Make sure you're using Node.js v20 or v24
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and `package-lock.json`, then retry

### Hotkey not responding
- Restart the application
- Check if another app uses the same hotkey

## 📞 Need Help?

- Check the full README.md for detailed documentation
- Look at the troubleshooting section
- Ensure your OpenAI API key has sufficient credits

---

**Pro Tip**: Start with short recordings (5-10 seconds) to test the system before using longer voice inputs. 