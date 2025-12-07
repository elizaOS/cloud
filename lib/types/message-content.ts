/**
 * Shared type definitions for message content structures
 */

import type { Content, Media } from "@elizaos/core";

/**
 * Message content with text, attachments, and source metadata
 */
export interface MessageContent {
  text?: string;
  attachments?: Media[];
  source?: "user" | "agent" | "api";
  thought?: string;
  inReplyTo?: string;
  action?: string;
}

/**
 * Type guard to check if content has attachments
 */
export function hasAttachments(
  content: unknown,
): content is MessageContent & { attachments: Media[] } {
  return (
    typeof content === "object" &&
    content !== null &&
    "attachments" in content &&
    Array.isArray((content as MessageContent).attachments) &&
    (content as MessageContent).attachments!.length > 0
  );
}

/**
 * Type guard to check if content has text
 */
export function hasText(content: unknown): content is MessageContent & { text: string } {
  return (
    typeof content === "object" &&
    content !== null &&
    "text" in content &&
    typeof (content as MessageContent).text === "string"
  );
}

/**
 * Safely parse message content from unknown
 * Handles various formats: string, JSON string, double-encoded JSON, or object
 */
export function parseMessageContent(content: unknown): MessageContent {
  // Handle string content (may be JSON or plain text)
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      // Check if result is still a string (double-encoded)
      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed) as MessageContent;
        } catch {
          return { text: parsed };
        }
      }
      return parsed as MessageContent;
    } catch {
      return { text: content };
    }
  }

  // Handle object content
  if (typeof content === "object" && content !== null) {
    // Check if the object has a stringified content field
    const obj = content as Record<string, unknown>;
    if (typeof obj.content === "string") {
      try {
        const innerParsed = JSON.parse(obj.content);
        if (typeof innerParsed === "object" && innerParsed !== null) {
          return { ...obj, ...innerParsed } as MessageContent;
        }
      } catch {
        // content field is plain text, not JSON
      }
    }
    return content as MessageContent;
  }

  return {};
}

/**
 * Room metadata structure
 */
export interface RoomMetadata {
  creatorUserId?: string;
  [key: string]: unknown;
}

/**
 * Attachment structure for API responses
 */
export interface MessageAttachment {
  id: string;
  url: string;
  title?: string;
  contentType?: string;
}

/**
 * Voice structure from ElevenLabs
 */
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: "premade" | "professional" | "cloned" | "generated";
  [key: string]: unknown;
}

