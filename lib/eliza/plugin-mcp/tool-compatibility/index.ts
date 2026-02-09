export { McpToolCompatibility, type ModelInfo, type ModelProvider } from './base';

import type { IAgentRuntime } from '@elizaos/core';
import type { ModelInfo, ModelProvider } from './base';
import { OpenAIMcpCompatibility, OpenAIReasoningMcpCompatibility } from './providers/openai';
import { AnthropicMcpCompatibility } from './providers/anthropic';
import { GoogleMcpCompatibility } from './providers/google';

export function detectModelProvider(runtime: IAgentRuntime): ModelInfo {
  const providerString = String(runtime?.modelProvider || '').toLowerCase();
  const modelString = String(runtime?.model || '').toLowerCase();

  let provider: ModelProvider = 'unknown';
  let supportsStructuredOutputs = false;
  let isReasoningModel = false;

  if (providerString.includes('openai') || modelString.includes('gpt-') || modelString.includes('o1') || modelString.includes('o3')) {
    provider = 'openai';
    supportsStructuredOutputs = modelString.includes('gpt-4') || modelString.includes('o1') || modelString.includes('o3');
    isReasoningModel = modelString.includes('o1') || modelString.includes('o3');
  } else if (providerString.includes('anthropic') || modelString.includes('claude')) {
    provider = 'anthropic';
    supportsStructuredOutputs = true;
  } else if (providerString.includes('google') || modelString.includes('gemini')) {
    provider = 'google';
    supportsStructuredOutputs = true;
  } else if (providerString.includes('openrouter') || modelString.includes('openrouter')) {
    provider = 'openrouter';
  }

  return { provider, modelId: modelString || providerString || 'unknown', supportsStructuredOutputs, isReasoningModel };
}

export function createMcpToolCompatibilitySync(runtime: IAgentRuntime) {
  const info = detectModelProvider(runtime);

  switch (info.provider) {
    case 'openai':
      return info.isReasoningModel ? new OpenAIReasoningMcpCompatibility(info) : new OpenAIMcpCompatibility(info);
    case 'anthropic':
      return new AnthropicMcpCompatibility(info);
    case 'google':
      return new GoogleMcpCompatibility(info);
    default:
      return null;
  }
}

// Async alias for API compatibility
export const createMcpToolCompatibility = createMcpToolCompatibilitySync;
