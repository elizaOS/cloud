/**
 * Secrets Module
 *
 * Production-grade secrets management with:
 * - Envelope encryption (AES-256-GCM + KMS)
 * - Organization → Project → Environment scoping
 * - OAuth token storage
 * - Audit logging for compliance
 */

export {
  secretsService,
  getSecretsService,
  SecretsService,
  type CreateSecretParams,
  type UpdateSecretParams,
  type GetSecretsParams,
  type AuditContext,
  type SecretMetadata,
} from "./secrets";

export {
  getEncryptionService,
  createEncryptionService,
  SecretsEncryptionService,
  LocalKMSProvider,
  AWSKMSProvider,
  type KMSProvider,
  type EncryptionResult,
  type DecryptionParams,
} from "./encryption";

