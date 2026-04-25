import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  getPlaidItemInfo,
  isPlaidConfigured,
  MiladyPlaidConnectorError,
  syncPlaidTransactions,
} from "@/lib/services/milady-plaid-connector";

export const miladyPlaidRouteDeps = {
  requireAuthOrApiKeyWithOrg,
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  getPlaidItemInfo,
  isPlaidConfigured,
  syncPlaidTransactions,
  MiladyPlaidConnectorError,
};
