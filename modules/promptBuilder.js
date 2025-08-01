class PromptBuilder {
  constructor() {
    this.defaultInstruction = "Please process the following transcript and provide a helpful response:";
  }

  build(instruction, transcript) {
    if (!transcript || transcript.trim() === '') {
      throw new Error('No transcript provided');
    }

    // Use default instruction if none provided
    const finalInstruction = instruction && instruction.trim() !== '' 
      ? instruction.trim() 
      : this.defaultInstruction;

    // Build the prompt with clear formatting
    const prompt = `${finalInstruction}

Transcript: "${transcript}"

Please provide a clear and helpful response based on the instruction and transcript above.`;

    return prompt;
  }

  // Custom prompt builder for specific use cases
  buildCustom(instruction, transcript, additionalContext = '') {
    if (!transcript || transcript.trim() === '') {
      throw new Error('No transcript provided');
    }

    const finalInstruction = instruction && instruction.trim() !== '' 
      ? instruction.trim() 
      : this.defaultInstruction;

    let prompt = `${finalInstruction}

Transcript: "${transcript}"`;

    if (additionalContext && additionalContext.trim() !== '') {
      prompt += `\n\nAdditional Context: ${additionalContext}`;
    }

    prompt += '\n\nPlease provide a clear and helpful response based on the instruction and transcript above.';

    return prompt;
  }
}

module.exports = PromptBuilder; 