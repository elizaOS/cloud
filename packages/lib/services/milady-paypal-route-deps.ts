import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  buildPaypalAuthorizeUrl,
  describePaypalCapability,
  exchangePaypalAuthorizationCode,
  getPaypalIdentity,
  isPaypalConfigured,
  MiladyPaypalConnectorError,
  refreshPaypalAccessToken,
  searchPaypalTransactions,
} from "@/lib/services/milady-paypal-connector";

export const miladyPaypalRouteDeps = {
  requireAuthOrApiKeyWithOrg,
  buildPaypalAuthorizeUrl,
  describePaypalCapability,
  exchangePaypalAuthorizationCode,
  getPaypalIdentity,
  isPaypalConfigured,
  refreshPaypalAccessToken,
  searchPaypalTransactions,
  MiladyPaypalConnectorError,
};
