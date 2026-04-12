import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  createManagedGoogleCalendarEvent,
  deleteManagedGoogleCalendarEvent,
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
  updateManagedGoogleCalendarEvent,
} from "@/lib/services/milady-google-connector";

export const miladyGoogleRouteDeps = {
  requireAuthOrApiKeyWithOrg,
  getManagedGoogleConnectorStatus,
  initiateManagedGoogleConnection,
  disconnectManagedGoogleConnection,
  fetchManagedGoogleCalendarFeed,
  createManagedGoogleCalendarEvent,
  updateManagedGoogleCalendarEvent,
  deleteManagedGoogleCalendarEvent,
  fetchManagedGoogleGmailSearch,
  fetchManagedGoogleGmailTriage,
  readManagedGoogleGmailMessage,
  sendManagedGoogleMessage,
  sendManagedGoogleReply,
  MiladyGoogleConnectorError,
};
