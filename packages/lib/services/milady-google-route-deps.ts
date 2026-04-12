import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  createManagedGoogleCalendarEvent,
  disconnectManagedGoogleConnection,
  fetchManagedGoogleCalendarFeed,
  fetchManagedGoogleGmailSearch,
  fetchManagedGoogleGmailTriage,
  getManagedGoogleConnectorStatus,
  initiateManagedGoogleConnection,
  MiladyGoogleConnectorError,
  readManagedGoogleGmailMessage,
  sendManagedGoogleMessage,
  sendManagedGoogleReply,
} from "@/lib/services/milady-google-connector";

export const miladyGoogleRouteDeps = {
  requireAuthOrApiKeyWithOrg,
  getManagedGoogleConnectorStatus,
  initiateManagedGoogleConnection,
  disconnectManagedGoogleConnection,
  fetchManagedGoogleCalendarFeed,
  createManagedGoogleCalendarEvent,
  fetchManagedGoogleGmailSearch,
  fetchManagedGoogleGmailTriage,
  readManagedGoogleGmailMessage,
  sendManagedGoogleMessage,
  sendManagedGoogleReply,
  MiladyGoogleConnectorError,
};
