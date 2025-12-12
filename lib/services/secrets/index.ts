export {
  secretsService,
  getSecretsService,
  SecretsService,
  type CreateSecretParams,
  type BulkCreateSecretParams,
  type UpdateSecretParams,
  type GetSecretsParams,
  type ListSecretsParams,
  type BindSecretParams,
  type AuditContext,
  type SecretMetadata,
  type SecretBindingMetadata,
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

