import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  createManagedGoogleCalendarEvent,
  disconnectManagedGoogleConnection,
  fetchManagedGoogleCalendarFeed,
  fetchManagedGoogleGmailTriage,
  getManagedGoogleConnectorStatus,
  initiateManagedGoogleConnection,
  MiladyGoogleConnectorError,
  readManagedGoogleGmailMessage,
  sendManagedGoogleReply,
} from "@/lib/services/milady-google-connector";

export const miladyGoogleRouteDeps = {
  requireAuthOrApiKeyWithOrg,
  getManagedGoogleConnectorStatus,
  initiateManagedGoogleConnection,
  disconnectManagedGoogleConnection,
  fetchManagedGoogleCalendarFeed,
  createManagedGoogleCalendarEvent,
  fetchManagedGoogleGmailTriage,
  readManagedGoogleGmailMessage,
  sendManagedGoogleReply,
  MiladyGoogleConnectorError,
};
