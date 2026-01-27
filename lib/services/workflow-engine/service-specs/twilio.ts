/**
 * Twilio Service Specification
 *
 * Defines Twilio API capabilities for SMS, MMS, and Voice.
 */

import type { ServiceSpecification } from "./types";

export const twilioSpec: ServiceSpecification = {
  id: "twilio",
  name: "Twilio",
  description: "SMS, MMS, and Voice communications via Twilio",
  authentication: {
    type: "basic",
    requiredCredentials: ["account_sid", "auth_token", "phone_number"],
    refreshable: false,
  },
  baseUrl: "https://api.twilio.com/2010-04-01",
  resources: {
    sms: {
      send: {
        requires: ["account_sid", "auth_token", "from_number", "to", "body"],
        outputs: ["message_sid", "status"],
        description: "Send an SMS message",
        method: "POST",
        endpoint: "/Accounts/{account_sid}/Messages.json",
        rateLimit: { requests: 1, period: "second" },
      },
      send_mms: {
        requires: [
          "account_sid",
          "auth_token",
          "from_number",
          "to",
          "media_url",
        ],
        outputs: ["message_sid", "status"],
        description: "Send an MMS message with media",
        method: "POST",
        endpoint: "/Accounts/{account_sid}/Messages.json",
      },
      get_status: {
        requires: ["account_sid", "auth_token", "message_sid"],
        outputs: ["status", "error_code", "error_message"],
        description: "Get message delivery status",
        method: "GET",
        endpoint: "/Accounts/{account_sid}/Messages/{message_sid}.json",
      },
      list: {
        requires: ["account_sid", "auth_token"],
        outputs: ["messages[]"],
        description: "List sent/received messages",
        method: "GET",
        endpoint: "/Accounts/{account_sid}/Messages.json",
      },
    },
    voice: {
      make_call: {
        requires: ["account_sid", "auth_token", "from_number", "to", "twiml"],
        outputs: ["call_sid", "status"],
        description: "Initiate a voice call",
        method: "POST",
        endpoint: "/Accounts/{account_sid}/Calls.json",
      },
      get_call: {
        requires: ["account_sid", "auth_token", "call_sid"],
        outputs: ["call"],
        description: "Get call details",
        method: "GET",
        endpoint: "/Accounts/{account_sid}/Calls/{call_sid}.json",
      },
      list_calls: {
        requires: ["account_sid", "auth_token"],
        outputs: ["calls[]"],
        description: "List calls",
        method: "GET",
        endpoint: "/Accounts/{account_sid}/Calls.json",
      },
    },
    phone_number: {
      list: {
        requires: ["account_sid", "auth_token"],
        outputs: ["phone_numbers[]"],
        description: "List owned phone numbers",
        method: "GET",
        endpoint: "/Accounts/{account_sid}/IncomingPhoneNumbers.json",
      },
      lookup: {
        requires: ["account_sid", "auth_token", "phone_number"],
        outputs: ["phone_info"],
        description: "Lookup phone number information",
        method: "GET",
        endpoint: "/v2/PhoneNumbers/{phone_number}",
      },
    },
  },
  dependencies: [
    {
      operation: "sms.send",
      dependsOn: ["phone_number.valid"],
      resolution: "fail",
    },
    {
      operation: "voice.make_call",
      dependsOn: ["phone_number.valid"],
      resolution: "fail",
    },
  ],
  examples: [
    {
      intent: "Send an SMS to a phone number",
      operations: ["sms.send"],
      code: `
const client = twilio(accountSid, authToken);

const message = await client.messages.create({
  body: messageText,
  from: fromNumber,
  to: toNumber
});

return { 
  messageSid: message.sid, 
  status: message.status 
};
`,
    },
    {
      intent: "Send SMS to a contact from my address book",
      operations: ["google.contacts.search", "sms.send"],
      code: `
// Find contact in Google Contacts
const contacts = await google.contacts.search({ query: contactName });
const contact = contacts[0];
if (!contact?.phone) throw new Error('Contact not found or has no phone');

// Send SMS
const client = twilio(accountSid, authToken);
const message = await client.messages.create({
  body: messageText,
  from: fromNumber,
  to: contact.phone
});

return { 
  sentTo: contact.name,
  phone: contact.phone,
  messageSid: message.sid 
};
`,
    },
    {
      intent: "Send a picture via MMS",
      operations: ["sms.send_mms"],
      code: `
const client = twilio(accountSid, authToken);

const message = await client.messages.create({
  body: caption || '',
  from: fromNumber,
  to: toNumber,
  mediaUrl: [imageUrl]
});

return { 
  messageSid: message.sid, 
  status: message.status 
};
`,
    },
    {
      intent: "Check message delivery status",
      operations: ["sms.get_status"],
      code: `
const client = twilio(accountSid, authToken);

const message = await client.messages(messageSid).fetch();

return {
  status: message.status,
  errorCode: message.errorCode,
  errorMessage: message.errorMessage,
  dateSent: message.dateSent
};
`,
    },
  ],
};
