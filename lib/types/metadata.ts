/**
 * Type-safe metadata definitions for credit transactions and usage records
 * Provides strict typing for metadata fields to improve type safety
 */

/**
 * Base metadata interface with common fields
 */
interface BaseMetadata {
  user_id: string;
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Metadata for text generation operations
 */
export interface TextGenerationMetadata extends BaseMetadata {
  user_id: string;
  model: string;
  generation_id?: string;
  prompt?: string;
  input_tokens?: number;
  output_tokens?: number;
  error?: string;
}

/**
 * Metadata for image generation operations
 */
export interface ImageGenerationMetadata extends BaseMetadata {
  user_id: string;
  model?: string;
  generation_id?: string;
  prompt?: string;
  aspect_ratio?: string;
  error?: string;
}

/**
 * Metadata for memory operations
 */
export interface MemoryOperationMetadata extends BaseMetadata {
  user_id: string;
  memory_id?: string;
  type?: string;
  query?: string;
  count?: number;
  room_id?: string;
}

/**
 * Metadata for conversation operations
 */
export interface ConversationMetadata extends BaseMetadata {
  user_id: string;
  conversation_id?: string;
  source_conversation_id?: string;
  new_conversation_id?: string;
  room_id?: string;
  query?: string;
  format?: string;
  depth?: number;
  tokens?: number;
}

/**
 * Metadata for agent operations
 */
export interface AgentMetadata extends BaseMetadata {
  user_id: string;
  room_id?: string;
  message_id?: string;
  input_tokens?: number;
  output_tokens?: number;
  model?: string;
}

/**
 * Metadata for container operations
 */
export interface ContainerMetadata extends BaseMetadata {
  user_id: string;
  container_id?: string;
  character_id?: string;
  deployment_status?: string;
}

/**
 * Metadata for analysis operations
 */
export interface AnalysisMetadata extends BaseMetadata {
  user_id: string;
  analysis_type?: string;
  time_range_from?: string;
  time_range_to?: string;
}

/**
 * Union type of all metadata types
 */
export type CreditMetadata =
  | TextGenerationMetadata
  | ImageGenerationMetadata
  | MemoryOperationMetadata
  | ConversationMetadata
  | AgentMetadata
  | ContainerMetadata
  | AnalysisMetadata;

/**
 * Type guard to check if metadata is text generation metadata
 */
export function isTextGenerationMetadata(
  metadata: unknown
): metadata is TextGenerationMetadata {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "user_id" in metadata &&
    "model" in metadata
  );
}

/**
 * Type guard to check if metadata is image generation metadata
 */
export function isImageGenerationMetadata(
  metadata: unknown
): metadata is ImageGenerationMetadata {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "user_id" in metadata &&
    ("generation_id" in metadata || "prompt" in metadata)
  );
}

/**
 * Helper function to create type-safe text generation metadata
 */
export function createTextGenerationMetadata(
  data: TextGenerationMetadata
): TextGenerationMetadata {
  return data;
}

/**
 * Helper function to create type-safe image generation metadata
 */
export function createImageGenerationMetadata(
  data: ImageGenerationMetadata
): ImageGenerationMetadata {
  return data;
}

/**
 * Helper function to create type-safe memory operation metadata
 */
export function createMemoryOperationMetadata(
  data: MemoryOperationMetadata
): MemoryOperationMetadata {
  return data;
}

/**
 * Helper function to create type-safe conversation metadata
 */
export function createConversationMetadata(
  data: ConversationMetadata
): ConversationMetadata {
  return data;
}

/**
 * Helper function to create type-safe agent metadata
 */
export function createAgentMetadata(data: AgentMetadata): AgentMetadata {
  return data;
}
