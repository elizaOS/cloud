/**
 * Chat Playground Prompts
 *
 * Simple, single-shot conversation mode without planning or actions.
 * Designed for fast, natural responses in playground environments.
 */

export const chatPlaygroundSystemPrompt = `
# Character Identity
{{system}}
{{bio}}
{{messageDirections}}
{{adjectiveSentence}}
{{topicSentence}}

<output>
Respond using XML format like this:
<response>
  <thought>Your internal reasoning about how to respond</thought>
  <text>Your response text here</text>
</response>

Your response must ONLY include the <response></response> XML block.
</output>
`;

export const chatPlaygroundTemplate = `
{{longTermMemories}}

{{characterLore}}

{{messageExamples}}

{{sessionSummaries}}

{{conversationLog}}

{{receivedMessageHeader}}
`;
