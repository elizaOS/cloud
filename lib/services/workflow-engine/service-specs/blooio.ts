/**
 * Blooio (iMessage) Service Specification
 *
 * Defines Blooio/Sendblue API capabilities for iMessage integration.
 */

import type { ServiceSpecification } from "./types";

export const blooioSpec: ServiceSpecification = {
  id: "blooio",
  name: "Blooio (iMessage)",
  description:
    "iMessage integration via Blooio/Sendblue for sending and receiving iMessages",
  authentication: {
    type: "api_key",
    requiredCredentials: ["api_key", "from_number"],
    refreshable: false,
  },
  baseUrl: "https://api.blooio.com/v1",
  resources: {
    message: {
      send: {
        requires: ["api_key", "from_number", "to", "content"],
        outputs: ["message_id", "status"],
        description: "Send an iMessage to a phone number or email",
        method: "POST",
        endpoint: "/chats/{chat_id}/messages",
        rateLimit: { requests: 50, period: "day" }, // Basic tier
      },
      send_media: {
        requires: ["api_key", "from_number", "to", "media_url"],
        outputs: ["message_id", "status"],
        description: "Send an iMessage with media attachment",
        method: "POST",
        endpoint: "/chats/{chat_id}/messages",
      },
      get_status: {
        requires: ["api_key", "message_id"],
        outputs: ["status", "delivered_at", "read_at"],
        description: "Get delivery status of a sent message",
        method: "GET",
        endpoint: "/messages/{message_id}",
      },
    },
    chat: {
      list: {
        requires: ["api_key"],
        outputs: ["chats[]"],
        description: "List all chat conversations",
        method: "GET",
        endpoint: "/chats",
      },
      get_messages: {
        requires: ["api_key", "chat_id"],
        outputs: ["messages[]"],
        description: "Get messages in a chat",
        method: "GET",
        endpoint: "/chats/{chat_id}/messages",
      },
      create_group: {
        requires: ["api_key", "from_number", "participants[]", "name"],
        outputs: ["chat_id"],
        description: "Create a group chat",
        method: "POST",
        endpoint: "/chats",
      },
    },
    contact: {
      lookup: {
        requires: ["api_key", "identifier"],
        outputs: ["contact", "imessage_available"],
        description: "Check if a phone/email can receive iMessage",
        method: "GET",
        endpoint: "/contacts/lookup",
      },
    },
  },
  dependencies: [
    {
      operation: "message.send",
      dependsOn: ["contact.lookup"],
      resolution: "prompt_user",
    },
    {
      operation: "chat.get_messages",
      dependsOn: ["chat.exists"],
      resolution: "fail",
    },
  ],
  examples: [
    {
      intent: "Send a text message to a contact",
      operations: ["contact.lookup", "message.send"],
      code: `
// First verify the contact can receive iMessage
const lookup = await blooio.contacts.lookup({ identifier: phoneNumber });
if (!lookup.imessage_available) {
  throw new Error('Contact cannot receive iMessage, consider SMS fallback');
}

// Send the message
const result = await blooio.messages.send({
  from: fromNumber,
  to: phoneNumber,
  content: messageText
});

return { messageId: result.message_id, status: result.status };
`,
    },
    {
      intent: "Text someone from my contacts",
      operations: ["google.contacts.search", "contact.lookup", "message.send"],
      code: `
// Find contact in Google Contacts
const contacts = await google.contacts.search({ query: contactName });
const contact = contacts[0];
if (!contact?.phone) throw new Error('Contact not found or has no phone');

// Verify iMessage availability
const lookup = await blooio.contacts.lookup({ identifier: contact.phone });

// Send message
const result = await blooio.messages.send({
  from: fromNumber,
  to: contact.phone,
  content: messageText
});

return { 
  sentTo: contact.name,
  phone: contact.phone,
  messageId: result.message_id 
};
`,
    },
    {
      intent: "Send a photo via iMessage",
      operations: ["message.send_media"],
      code: `
const result = await blooio.messages.send({
  from: fromNumber,
  to: phoneNumber,
  media_url: imageUrl,
  content: caption || ''
});

return { messageId: result.message_id, status: result.status };
`,
    },
  ],
};
