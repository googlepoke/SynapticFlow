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

  // Predefined prompt templates
  getTemplates() {
    return {
      'rewrite': 'Please rewrite the following transcript in a clear and professional manner:',
      'summarize': 'Please provide a concise summary of the following transcript:',
      'translate': 'Please translate the following transcript to English (if not already in English):',
      'expand': 'Please expand on the ideas mentioned in the following transcript:',
      'simplify': 'Please simplify and clarify the following transcript:',
      'formal': 'Please convert the following transcript into formal business language:',
      'casual': 'Please convert the following transcript into casual, conversational language:',
      'bullet': 'Please convert the following transcript into bullet points:',
      'question': 'Please generate questions based on the following transcript:',
      'action': 'Please extract action items from the following transcript:',
      'clean': 'You are a professional transcript editor.Your job is to take a raw, verbatim transcript of spoken language and turn it into a clear, concise, and coherent written transcript by: 1. Removing all filler words such as “um,” “uh,” “like,” “you know,” “so,” “actually,” “basically,” “right,” etc.2. Eliminating repetitions, stutters, and restarts (e.g., “I—I mean, we… we should…” → “We should…”) 3. Merging fragmented sentences when the speaker trails off and immediately corrects themselves. 4. Maintaining the original meaning and tone—do not change technical terms, names, or emphasis. 5. Keeping punctuation and capitalization correct for readability.'
    };
  }

  buildWithTemplate(templateName, transcript) {
    const templates = this.getTemplates();
    const instruction = templates[templateName];
    
    if (!instruction) {
      throw new Error(`Unknown template: ${templateName}`);
    }

    return this.build(instruction, transcript);
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