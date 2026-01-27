/**
 * Google Service Specification
 *
 * Defines Google APIs (Gmail, Calendar, Contacts) capabilities
 * for the AI Workflow Factory.
 */

import type { ServiceSpecification } from "./types";

export const googleSpec: ServiceSpecification = {
  id: "google",
  name: "Google",
  description:
    "Google services including Gmail, Calendar, and Contacts for email, scheduling, and contact management",
  authentication: {
    type: "oauth2",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/contacts.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    requiredCredentials: ["access_token", "refresh_token"],
    refreshable: true,
  },
  baseUrl: "https://www.googleapis.com",
  resources: {
    email: {
      list: {
        requires: ["access_token"],
        outputs: ["emails[]"],
        description: "List emails from inbox",
        method: "GET",
        endpoint: "/gmail/v1/users/me/messages",
        rateLimit: { requests: 100, period: "second" },
      },
      read: {
        requires: ["access_token", "message_id"],
        outputs: ["email"],
        description: "Read a specific email",
        method: "GET",
        endpoint: "/gmail/v1/users/me/messages/{message_id}",
      },
      send: {
        requires: ["access_token", "to", "subject", "body"],
        outputs: ["message_id"],
        description: "Send an email",
        method: "POST",
        endpoint: "/gmail/v1/users/me/messages/send",
      },
      search: {
        requires: ["access_token", "query"],
        outputs: ["emails[]"],
        description: "Search emails with query",
        method: "GET",
        endpoint: "/gmail/v1/users/me/messages?q={query}",
      },
      draft: {
        requires: ["access_token", "to", "subject", "body"],
        outputs: ["draft_id"],
        description: "Create an email draft",
        method: "POST",
        endpoint: "/gmail/v1/users/me/drafts",
      },
    },
    calendar: {
      list_events: {
        requires: ["access_token"],
        outputs: ["events[]"],
        description: "List upcoming calendar events",
        method: "GET",
        endpoint: "/calendar/v3/calendars/primary/events",
      },
      get_event: {
        requires: ["access_token", "event_id"],
        outputs: ["event"],
        description: "Get a specific calendar event",
        method: "GET",
        endpoint: "/calendar/v3/calendars/primary/events/{event_id}",
      },
      create_event: {
        requires: ["access_token", "summary", "start_time", "end_time"],
        outputs: ["event_id"],
        description: "Create a calendar event",
        method: "POST",
        endpoint: "/calendar/v3/calendars/primary/events",
      },
      update_event: {
        requires: ["access_token", "event_id", "updates"],
        outputs: ["event"],
        description: "Update a calendar event",
        method: "PATCH",
        endpoint: "/calendar/v3/calendars/primary/events/{event_id}",
      },
      delete_event: {
        requires: ["access_token", "event_id"],
        description: "Delete a calendar event",
        method: "DELETE",
        endpoint: "/calendar/v3/calendars/primary/events/{event_id}",
      },
      list_calendars: {
        requires: ["access_token"],
        outputs: ["calendars[]"],
        description: "List all calendars",
        method: "GET",
        endpoint: "/calendar/v3/users/me/calendarList",
      },
    },
    contacts: {
      list: {
        requires: ["access_token"],
        outputs: ["contacts[]"],
        description: "List contacts",
        method: "GET",
        endpoint: "/v1/people/me/connections",
      },
      search: {
        requires: ["access_token", "query"],
        outputs: ["contacts[]"],
        description: "Search contacts by name or email",
        method: "GET",
        endpoint: "/v1/people:searchContacts?query={query}",
      },
      get: {
        requires: ["access_token", "resource_name"],
        outputs: ["contact"],
        description: "Get a specific contact",
        method: "GET",
        endpoint: "/v1/{resource_name}",
      },
    },
  },
  dependencies: [
    {
      operation: "email.send",
      dependsOn: ["contacts.search"],
      resolution: "prompt_user",
    },
    {
      operation: "calendar.create_event",
      dependsOn: ["contacts.search"],
      resolution: "prompt_user",
    },
  ],
  examples: [
    {
      intent: "Check my unread emails",
      operations: ["email.search"],
      code: `
// Search for unread emails
const response = await gmail.users.messages.list({
  userId: 'me',
  q: 'is:unread',
  maxResults: 10
});
return response.data.messages;
`,
    },
    {
      intent: "Send an email to someone",
      operations: ["contacts.search", "email.send"],
      code: `
// Find contact first, then send email
const contact = await findContact(name);
const email = await sendEmail({
  to: contact.email,
  subject: subject,
  body: body
});
return { sent: true, messageId: email.id };
`,
    },
    {
      intent: "Schedule a meeting",
      operations: ["contacts.search", "calendar.create_event"],
      code: `
// Find attendees and create event
const attendees = await findContacts(names);
const event = await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: title,
    start: { dateTime: startTime },
    end: { dateTime: endTime },
    attendees: attendees.map(c => ({ email: c.email }))
  }
});
return event.data;
`,
    },
  ],
};
