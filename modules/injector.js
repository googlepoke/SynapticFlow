const { clipboard } = require('electron');

class TextInjector {
    constructor() {
        this.isAvailable = true; // Electron clipboard is always available
    }

    async injectText(text) {
        try {
            // Direct clipboard write using Electron's clipboard - much more reliable
            clipboard.writeText(text);
            
            // Immediate verification
            const verifyClipboard = clipboard.readText();
            const clipboardMatches = verifyClipboard === text;
            
            console.log('Clipboard updated successfully:', clipboardMatches);
            
            // If clipboard write failed, retry immediately
            if (!clipboardMatches) {
                console.error('WARNING: Clipboard verification failed! Retrying immediately...');
                clipboard.writeText(text);
                const retryVerify = clipboard.readText();
                const retrySuccess = retryVerify === text;
                console.log('Immediate retry verification:', retrySuccess);
                
                if (!retrySuccess) {
                    throw new Error('Clipboard write failed after retry');
                }
            }
            
            // No clipboard restoration - we want to keep the LLM response for pasting
            return { success: true, method: 'electron-clipboard' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    getStatus() {
        return {
            available: true,
            method: 'electron-clipboard',
            description: 'Text is copied to clipboard using Electron - use Ctrl+V to paste'
        };
    }
}

module.exports = TextInjector; 