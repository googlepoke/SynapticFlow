const clipboardy = require('clipboardy');

class TextInjector {
    constructor() {
        this.isAvailable = true; // Clipboard is always available
    }

    async injectText(text) {
        try {
            // Store current clipboard content to restore later (with error handling)
            let previousClipboard = '';
            try {
                previousClipboard = await clipboardy.read();
            } catch (readError) {
                // console.warn('Could not read current clipboard content:', readError.message);
                // Continue without storing previous content
            }
            
            // Copy the text to clipboard
            await clipboardy.write(text);
            
            // console.log('Text copied to clipboard. User can paste with Ctrl+V');
            
            // Optional: Restore previous clipboard after a delay (only if we successfully read it)
            if (previousClipboard) {
                setTimeout(async () => {
                    try {
                        await clipboardy.write(previousClipboard);
                    } catch (error) {
                        // console.warn('Could not restore previous clipboard content:', error.message);
                    }
                }, 5000); // 5 seconds delay
            }
            
            return { success: true, method: 'clipboard' };
        } catch (error) {
            // console.error('Failed to copy text to clipboard:', error);
            return { success: false, error: error.message };
        }
    }

    getStatus() {
        return {
            available: true,
            method: 'clipboard',
            description: 'Text is copied to clipboard - use Ctrl+V to paste'
        };
    }
}

module.exports = TextInjector; 