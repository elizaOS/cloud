/**
 * Secrets settings tab component for managing encrypted secrets.
 * Supports creating, viewing, editing, and deleting secrets with scoping support.
 * 
 * Features:
 * - Organization-level (global) secrets
 * - Project-scoped secrets (for agents, MCPs, workflows, containers, apps)
 * - Environment-scoped secrets (development, preview, production)
 * - Audit logging for compliance
 *
 * @param props - Secrets tab configuration
 * @param props.user - User data with organization information
 */

"use client";

import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { Plus, Copy, Trash2, Loader2, Eye, EyeOff, X, Lock, Shield, Edit2, RotateCw, History } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SecretsTabProps {
  user: UserWithOrganization;
}

type SecretProvider = "openai" | "anthropic" | "google" | "elevenlabs" | "fal" | "stripe" | "discord" | "telegram" | "twitter" | "github" | "slack" | "aws" | "vercel" | "custom";

interface SecretMetadata {
  id: string;
  name: string;
  description: string | null;
  scope: "organization" | "project" | "environment";
  projectId: string | null;
  projectType: string | null;
  environment: "development" | "preview" | "production" | null;
  provider: SecretProvider | null;
  version: number;
  expiresAt: string | null;
  lastRotatedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ModalState {
  showCreateModal: boolean;
  showEditModal: boolean;
  showValueModal: boolean;
  showBulkImportModal: boolean;
  showRotateModal: boolean;
  showAuditModal: boolean;
  selectedSecret: SecretMetadata | null;
  revealedValue: string | null;
  auditLogs: AuditLogEntry[];
}

interface AuditLogEntry {
  id: string;
  action: string;
  actorType: string;
  actorId: string;
  actorEmail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface OperationState {
  loading: boolean;
  creating: boolean;
  updating: boolean;
  rotating: boolean;
  deletingSecretId: string | null;
  revealingSecretId: string | null;
  loadingAudit: boolean;
}

interface FormState {
  name: string;
  value: string;
  description: string;
  scope: "organization" | "project" | "environment";
  projectType: "character" | "mcp" | "workflow" | "container" | "app" | "";
  projectId: string;
  environment: "development" | "preview" | "production" | "";
  provider: SecretProvider | "";
}

interface BulkImportState {
  envContent: string;
  importing: boolean;
}

const SCOPE_LABELS: Record<string, string> = {
  organization: "Global",
  project: "Project",
  environment: "Environment",
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
  character: "Agent",
  mcp: "MCP",
  workflow: "Workflow",
  container: "Container",
  app: "App",
};

const ENVIRONMENT_LABELS: Record<string, string> = {
  development: "Development",
  preview: "Preview",
  production: "Production",
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  elevenlabs: "ElevenLabs",
  fal: "Video",
  stripe: "Stripe",
  discord: "Discord",
  telegram: "Telegram",
  twitter: "Twitter/X",
  github: "GitHub",
  slack: "Slack",
  aws: "AWS",
  vercel: "Vercel",
  custom: "Custom",
};

export function SecretsTab({ user }: SecretsTabProps) {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  const [modalState, setModalState] = useState<ModalState>({
    showCreateModal: false,
    showEditModal: false,
    showValueModal: false,
    showBulkImportModal: false,
    showRotateModal: false,
    showAuditModal: false,
    selectedSecret: null,
    revealedValue: null,
    auditLogs: [],
  });

  const [bulkImportState, setBulkImportState] = useState<BulkImportState>({
    envContent: "",
    importing: false,
  });

  const [operationState, setOperationState] = useState<OperationState>({
    loading: true,
    creating: false,
    updating: false,
    rotating: false,
    deletingSecretId: null,
    revealingSecretId: null,
    loadingAudit: false,
  });

  const [formState, setFormState] = useState<FormState>({
    name: "",
    value: "",
    description: "",
    scope: "organization",
    projectType: "",
    projectId: "",
    environment: "",
    provider: "",
  });

  const updateModal = (updates: Partial<ModalState>) => {
    setModalState((prev) => ({ ...prev, ...updates }));
  };

  const updateOperation = (updates: Partial<OperationState>) => {
    setOperationState((prev) => ({ ...prev, ...updates }));
  };

  const updateForm = (updates: Partial<FormState>) => {
    setFormState((prev) => ({ ...prev, ...updates }));
  };

  const resetForm = () => {
    setFormState({
      name: "",
      value: "",
      description: "",
      scope: "organization",
      projectType: "",
      projectId: "",
      environment: "",
      provider: "",
    });
  };

  const fetchSecrets = useCallback(async () => {
    updateOperation({ loading: true });
    const response = await fetch("/api/v1/secrets");

    if (!response.ok) {
      throw new Error("Failed to fetch secrets");
    }

    const data = await response.json();
    setSecrets(data.secrets || []);
    updateOperation({ loading: false });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchSecrets();
    });
  }, [fetchSecrets]);

  const handleCreateNew = () => {
    resetForm();
    updateModal({ showCreateModal: true });
  };

  const handleEditSecret = (secret: SecretMetadata) => {
    setFormState({
      name: secret.name,
      value: "",
      description: secret.description || "",
      scope: secret.scope,
      projectType: (secret.projectType as FormState["projectType"]) || "",
      projectId: secret.projectId || "",
      environment: (secret.environment as FormState["environment"]) || "",
      provider: secret.provider || "",
    });
    updateModal({ showEditModal: true, selectedSecret: secret });
  };

  const handleBulkImport = () => {
    setBulkImportState({ envContent: "", importing: false });
    updateModal({ showBulkImportModal: true });
  };

  const handleBulkImportSubmit = async () => {
    const lines = bulkImportState.envContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    const secretsToCreate: Array<{ name: string; value: string }> = [];
    for (const line of lines) {
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) continue;
      const name = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (name && value) {
        secretsToCreate.push({ name: name.toUpperCase().replace(/[^A-Z0-9_]/g, "_"), value });
      }
    }

    if (secretsToCreate.length === 0) {
      toast.error("No valid secrets found in the input");
      return;
    }

    setBulkImportState((prev) => ({ ...prev, importing: true }));

    const response = await fetch("/api/v1/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secrets: secretsToCreate }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to import secrets");
      setBulkImportState((prev) => ({ ...prev, importing: false }));
      return;
    }

    const result = await response.json();
    updateModal({ showBulkImportModal: false });
    await fetchSecrets();
    
    const createdCount = result.created?.length || 0;
    const errorCount = result.errors?.length || 0;
    
    if (errorCount > 0) {
      toast.warning(`Imported ${createdCount} secrets, ${errorCount} failed`);
    } else {
      toast.success(`Imported ${createdCount} secrets successfully`);
    }
    
    setBulkImportState({ envContent: "", importing: false });
  };

  const handleCreateSubmit = async () => {
    if (!formState.name.trim()) {
      toast.error("Secret name is required");
      return;
    }
    if (!formState.value.trim()) {
      toast.error("Secret value is required");
      return;
    }

    updateOperation({ creating: true });
    const response = await fetch("/api/v1/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formState.name.trim().toUpperCase().replace(/-/g, "_"),
        value: formState.value,
        description: formState.description.trim() || undefined,
        scope: formState.scope,
        projectType: formState.projectType || undefined,
        projectId: formState.projectId || undefined,
        environment: formState.environment || undefined,
        provider: formState.provider || undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to create secret");
      updateOperation({ creating: false });
      return;
    }

    updateModal({ showCreateModal: false });
    await fetchSecrets();
    toast.success("Secret created successfully");
    updateOperation({ creating: false });
    resetForm();
  };

  const handleUpdateSubmit = async () => {
    if (!modalState.selectedSecret) return;

    updateOperation({ updating: true });
    const response = await fetch(`/api/v1/secrets/${modalState.selectedSecret.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        value: formState.value || undefined,
        description: formState.description.trim() || undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to update secret");
      updateOperation({ updating: false });
      return;
    }

    updateModal({ showEditModal: false, selectedSecret: null });
    await fetchSecrets();
    toast.success("Secret updated successfully");
    updateOperation({ updating: false });
    resetForm();
  };

  const handleRevealValue = async (secret: SecretMetadata) => {
    updateOperation({ revealingSecretId: secret.id });
    
    const response = await fetch(`/api/v1/secrets/${secret.id}`);
    
    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to reveal secret");
      updateOperation({ revealingSecretId: null });
      return;
    }

    const data = await response.json();
    updateModal({ showValueModal: true, selectedSecret: secret, revealedValue: data.value });
    updateOperation({ revealingSecretId: null });
  };

  const handleCopyValue = async () => {
    if (!modalState.revealedValue) return;
    await navigator.clipboard.writeText(modalState.revealedValue);
    toast.success("Secret value copied to clipboard");
  };

  const handleDeleteSecret = async (secretId: string, secretName: string) => {
    if (!window.confirm(`Are you sure you want to delete the secret "${secretName}"? This action cannot be undone.`)) {
      return;
    }

    updateOperation({ deletingSecretId: secretId });

    const response = await fetch(`/api/v1/secrets/${secretId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to delete secret");
      updateOperation({ deletingSecretId: null });
      return;
    }

    setSecrets(secrets.filter((s) => s.id !== secretId));
    toast.success("Secret deleted successfully");
    updateOperation({ deletingSecretId: null });
  };

  const handleRotateSecret = (secret: SecretMetadata) => {
    setFormState({
      ...formState,
      name: secret.name,
      value: "",
    });
    updateModal({ showRotateModal: true, selectedSecret: secret });
  };

  const handleRotateSubmit = async () => {
    if (!modalState.selectedSecret || !formState.value.trim()) {
      toast.error("New secret value is required");
      return;
    }

    updateOperation({ rotating: true });
    const response = await fetch(`/api/v1/secrets/${modalState.selectedSecret.id}/rotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newValue: formState.value }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to rotate secret");
      updateOperation({ rotating: false });
      return;
    }

    updateModal({ showRotateModal: false, selectedSecret: null });
    await fetchSecrets();
    toast.success("Secret rotated successfully - new version created");
    updateOperation({ rotating: false });
    resetForm();
  };

  const handleViewAudit = async (secret: SecretMetadata) => {
    updateOperation({ loadingAudit: true });
    updateModal({ showAuditModal: true, selectedSecret: secret, auditLogs: [] });

    const response = await fetch(`/api/v1/secrets/audit?secretId=${secret.id}`);

    if (!response.ok) {
      toast.error("Failed to load audit log");
      updateOperation({ loadingAudit: false });
      return;
    }

    const data = await response.json();
    updateModal({ auditLogs: data.logs || [] });
    updateOperation({ loadingAudit: false });
  };

  const toggleSecretVisibility = (secretId: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(secretId)) {
        next.delete(secretId);
      } else {
        next.add(secretId);
      }
      return next;
    });
  };

  const formatScopeLabel = (secret: SecretMetadata): string => {
    if (secret.scope === "organization") {
      return "Global";
    }
    if (secret.scope === "project" && secret.projectType) {
      return `${PROJECT_TYPE_LABELS[secret.projectType] || secret.projectType}`;
    }
    if (secret.scope === "environment" && secret.environment) {
      return `${ENVIRONMENT_LABELS[secret.environment] || secret.environment}`;
    }
    return SCOPE_LABELS[secret.scope] || secret.scope;
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 pb-6 md:pb-8">
      {/* Secrets Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row items-start lg:justify-between gap-4 w-full">
            <div className="flex flex-col gap-2 max-w-[850px]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                  Encrypted Secrets
                </h3>
              </div>
              <div className="text-xs md:text-sm font-mono text-[#858585] tracking-tight space-y-2">
                <p>
                  Manage encrypted secrets for your organization. Secrets are encrypted at rest
                  using AES-256-GCM with envelope encryption and are automatically available to
                  your agents, MCPs, workflows, and deployments.
                </p>
                <p className="hidden sm:block">
                  <strong>Global secrets</strong> are available everywhere.{" "}
                  <strong>Project-scoped secrets</strong> are only available to specific agents, MCPs,
                  workflows, containers, or apps.
                </p>
              </div>
            </div>

            {/* Buttons - side by side on tablet+, stacked on phone */}
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <button
                type="button"
                onClick={handleBulkImport}
                className="h-11 px-4 border border-[#303030] text-white hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <span className="font-mono text-sm whitespace-nowrap">Import .env</span>
              </button>
              <button
                type="button"
                onClick={handleCreateNew}
                className="relative h-11 bg-[#e1e1e1] px-4 overflow-hidden hover:bg-white active:bg-gray-200 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto lg:flex-shrink-0"
              >
                <div
                  className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                  style={{
                    backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                    backgroundSize: "2.915576934814453px 2.915576934814453px",
                  }}
                />
                <Plus className="relative z-10 h-[18px] w-[18px] text-black flex-shrink-0" />
                <span className="relative z-10 text-black font-mono font-medium text-sm whitespace-nowrap">
                  Add secret
                </span>
              </button>
            </div>
          </div>

          {/* Secrets List */}
          <div className="w-full">
            {operationState.loading ? (
              <div className="flex items-center justify-center p-8 border border-brand-surface">
                <Loader2 className="h-6 w-6 animate-spin text-[#FF5800]" />
              </div>
            ) : secrets.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 border border-brand-surface gap-2">
                <Shield className="h-8 w-8 text-white/20" />
                <p className="text-sm text-white/60 font-mono">
                  No secrets yet. Create one to get started.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile & Tablet Card Layout (up to 1024px) */}
                <div className="lg:hidden space-y-3 md:space-y-4">
                  {secrets.map((secret) => (
                    <div
                      key={secret.id}
                      className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface p-4 md:p-5 space-y-3"
                    >
                      {/* Name and Scope Badge */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Lock className="h-4 w-4 text-[#FF5800] flex-shrink-0" />
                            <h4 className="text-sm md:text-base font-mono font-semibold text-white truncate">
                              {secret.name}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="px-2 py-0.5 bg-[rgba(255,88,0,0.25)] border border-[#FF5800]/40 text-[#FF5800] text-[10px] md:text-xs font-mono uppercase">
                              {formatScopeLabel(secret)}
                            </span>
                            <span className="hidden md:inline text-xs font-mono text-white/40">v{secret.version}</span>
                          </div>
                        </div>
                        {secret.description && (
                          <p className="text-xs font-mono text-white/40 line-clamp-2 md:line-clamp-1">
                            {secret.description}
                          </p>
                        )}
                      </div>

                      {/* Info Grid - 2 cols on phone, 4 cols on tablet */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-white/10">
                        <div className="space-y-1">
                          <p className="text-[10px] md:text-xs font-mono text-white/40 uppercase">Version</p>
                          <p className="text-xs font-mono text-white/80">v{secret.version}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] md:text-xs font-mono text-white/40 uppercase">Accessed</p>
                          <p className="text-xs font-mono text-white/80">{secret.accessCount}x</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] md:text-xs font-mono text-white/40 uppercase">Created</p>
                          <p className="text-xs font-mono text-white/80">
                            {new Date(secret.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] md:text-xs font-mono text-white/40 uppercase">Last Used</p>
                          <p className="text-xs font-mono text-white/80">
                            {secret.lastAccessedAt
                              ? new Date(secret.lastAccessedAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "Never"}
                          </p>
                        </div>
                      </div>

                      {/* Actions - Responsive grid layout */}
                      <div className="pt-3 border-t border-white/10">
                        {/* On phones: 2 rows. On tablets (md): single row with 5 items */}
                        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                          <button
                            type="button"
                            onClick={() => handleRevealValue(secret)}
                            disabled={operationState.revealingSecretId === secret.id}
                            className="h-11 px-2 md:px-3 border border-white/20 hover:bg-white/5 active:bg-white/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1 md:gap-1.5"
                          >
                            {operationState.revealingSecretId === secret.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                            ) : (
                              <Eye className="h-4 w-4 text-white/60" />
                            )}
                            <span className="text-[10px] md:text-xs font-mono text-white/60">Reveal</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRotateSecret(secret)}
                            className="h-11 px-2 md:px-3 border border-white/20 hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center gap-1 md:gap-1.5"
                          >
                            <RotateCw className="h-4 w-4 text-white/60" />
                            <span className="text-[10px] md:text-xs font-mono text-white/60">Rotate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleViewAudit(secret)}
                            className="h-11 px-2 md:px-3 border border-white/20 hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center gap-1 md:gap-1.5"
                          >
                            <History className="h-4 w-4 text-white/60" />
                            <span className="text-[10px] md:text-xs font-mono text-white/60">Audit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSecret(secret)}
                            className="h-11 px-2 md:px-3 border border-white/20 hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center gap-1 md:gap-1.5"
                          >
                            <Edit2 className="h-4 w-4 text-white/60" />
                            <span className="text-[10px] md:text-xs font-mono text-white/60">Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSecret(secret.id, secret.name)}
                            disabled={operationState.deletingSecretId === secret.id}
                            className="h-11 px-2 md:px-3 border border-[#EB4335]/40 bg-[#EB4335]/10 hover:bg-[#EB4335]/20 active:bg-[#EB4335]/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1 md:gap-1.5 col-span-3 md:col-span-1"
                          >
                            {operationState.deletingSecretId === secret.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[#EB4335]" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-[#EB4335]" />
                            )}
                            <span className="text-[10px] md:text-xs font-mono text-[#EB4335]">Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table Layout (1024px+) */}
                <div className="hidden lg:block w-full space-y-3">
                  {secrets.map((secret) => (
                    <div
                      key={secret.id}
                      className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface hover:bg-[rgba(10,10,10,0.85)] transition-colors"
                    >
                      <div className="p-4 flex items-start justify-between gap-6">
                        {/* Left: Name and Info */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-3">
                            <Lock className="h-4 w-4 text-[#FF5800] flex-shrink-0" />
                            <h4 className="text-base font-mono font-semibold text-white">
                              {secret.name}
                            </h4>
                            <span className="px-2 py-0.5 bg-[rgba(255,88,0,0.25)] border border-[#FF5800]/40 text-[#FF5800] text-xs font-mono uppercase">
                              {formatScopeLabel(secret)}
                            </span>
                            <span className="text-xs font-mono text-white/40">v{secret.version}</span>
                          </div>
                          {secret.description && (
                            <p className="text-xs font-mono text-white/40 ml-7">
                              {secret.description}
                            </p>
                          )}
                        </div>

                        {/* Right: Metadata and Actions */}
                        <div className="flex items-center gap-6">
                          <div className="flex gap-6">
                            <div className="space-y-1 text-right">
                              <p className="text-xs font-mono text-white/40 uppercase">Created</p>
                              <p className="text-xs font-mono text-white/80">
                                {new Date(secret.createdAt).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                            <div className="space-y-1 text-right">
                              <p className="text-xs font-mono text-white/40 uppercase">Accessed</p>
                              <p className="text-xs font-mono text-white/80">
                                {secret.accessCount}x
                              </p>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRevealValue(secret)}
                              disabled={operationState.revealingSecretId === secret.id}
                              className="px-3 py-2 border border-white/20 hover:bg-white/5 transition-colors disabled:opacity-50"
                              title="Reveal value"
                            >
                              {operationState.revealingSecretId === secret.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                              ) : (
                                <Eye className="h-4 w-4 text-white/60" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRotateSecret(secret)}
                              className="px-3 py-2 border border-white/20 hover:bg-white/5 transition-colors"
                              title="Rotate secret"
                            >
                              <RotateCw className="h-4 w-4 text-white/60" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewAudit(secret)}
                              className="px-3 py-2 border border-white/20 hover:bg-white/5 transition-colors"
                              title="View audit log"
                            >
                              <History className="h-4 w-4 text-white/60" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditSecret(secret)}
                              className="px-3 py-2 border border-white/20 hover:bg-white/5 transition-colors"
                              title="Edit secret"
                            >
                              <Edit2 className="h-4 w-4 text-white/60" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSecret(secret.id, secret.name)}
                              disabled={operationState.deletingSecretId === secret.id}
                              className="px-3 py-2 border border-[#EB4335]/40 bg-[#EB4335]/10 hover:bg-[#EB4335]/20 transition-colors disabled:opacity-50"
                              title="Delete secret"
                            >
                              {operationState.deletingSecretId === secret.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-[#EB4335]" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-[#EB4335]" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </BrandCard>

      {/* Create Secret Modal */}
      {modalState.showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 md:p-6 overflow-y-auto">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 md:p-6 w-full max-w-lg my-auto max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between sticky top-0 bg-[#0a0a0a] pb-2 -mt-1 pt-1 z-10">
                <h3 className="text-base md:text-lg font-mono text-white uppercase">
                  Create Secret
                </h3>
                <button
                  type="button"
                  onClick={() => updateModal({ showCreateModal: false })}
                  className="text-white/60 hover:text-white transition-colors p-2 -m-2"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white font-mono text-xs md:text-sm">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formState.name}
                    onChange={(e) => updateForm({ name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                    placeholder="MY_API_KEY"
                    className="bg-transparent border-[#303030] text-white font-mono h-11"
                  />
                  <p className="text-[10px] md:text-xs text-white/40 font-mono">
                    Uppercase with underscores (e.g., OPENAI_API_KEY)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-xs md:text-sm">
                    Value <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    value={formState.value}
                    onChange={(e) => updateForm({ value: e.target.value })}
                    placeholder="sk-..."
                    className="bg-transparent border-[#303030] text-white font-mono min-h-[80px] md:min-h-[100px] resize-none text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-xs md:text-sm">
                    Description (optional)
                  </Label>
                  <Input
                    value={formState.description}
                    onChange={(e) => updateForm({ description: e.target.value })}
                    placeholder="OpenAI API key for production"
                    className="bg-transparent border-[#303030] text-white h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-xs md:text-sm">Provider (optional)</Label>
                  <select
                    value={formState.provider}
                    onChange={(e) => updateForm({ provider: e.target.value as FormState["provider"] })}
                    className="w-full bg-transparent border border-[#303030] text-white h-11 px-3 font-mono text-sm appearance-none"
                  >
                    <option value="" className="bg-[#0a0a0a]">Auto-detect / Custom</option>
                    {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                      <option key={key} value={key} className="bg-[#0a0a0a]">{label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-xs md:text-sm">Scope</Label>
                  <select
                    value={formState.scope}
                    onChange={(e) => updateForm({ scope: e.target.value as FormState["scope"] })}
                    className="w-full bg-transparent border border-[#303030] text-white h-11 px-3 font-mono text-sm appearance-none"
                  >
                    <option value="organization" className="bg-[#0a0a0a]">Global (all projects)</option>
                    <option value="project" className="bg-[#0a0a0a]">Project-scoped</option>
                    <option value="environment" className="bg-[#0a0a0a]">Environment-scoped</option>
                  </select>
                </div>

                {formState.scope === "project" && (
                  <div className="space-y-2">
                    <Label className="text-white font-mono text-xs md:text-sm">Project Type</Label>
                    <select
                      value={formState.projectType}
                      onChange={(e) => updateForm({ projectType: e.target.value as FormState["projectType"] })}
                      className="w-full bg-transparent border border-[#303030] text-white h-11 px-3 font-mono text-sm appearance-none"
                    >
                      <option value="" className="bg-[#0a0a0a]">Select type...</option>
                      <option value="character" className="bg-[#0a0a0a]">Agent</option>
                      <option value="mcp" className="bg-[#0a0a0a]">MCP</option>
                      <option value="workflow" className="bg-[#0a0a0a]">Workflow</option>
                      <option value="container" className="bg-[#0a0a0a]">Container</option>
                      <option value="app" className="bg-[#0a0a0a]">App</option>
                    </select>
                  </div>
                )}

                {formState.scope === "project" && formState.projectType && (
                  <div className="space-y-2">
                    <Label className="text-white font-mono text-xs md:text-sm">Project ID</Label>
                    <Input
                      value={formState.projectId}
                      onChange={(e) => updateForm({ projectId: e.target.value })}
                      placeholder="Enter UUID..."
                      className="bg-transparent border-[#303030] text-white font-mono h-11"
                    />
                    <p className="text-[10px] md:text-xs text-white/40 font-mono">
                      {formState.projectType === "character" && "Find agent IDs in My Agents → select agent → URL contains the ID"}
                      {formState.projectType === "mcp" && "Find MCP IDs in your MCP settings"}
                      {formState.projectType === "workflow" && "Find workflow IDs in your n8n workflows list"}
                      {formState.projectType === "container" && "Find container IDs in your Containers dashboard"}
                      {formState.projectType === "app" && "Find app IDs in your Miniapps dashboard"}
                    </p>
                  </div>
                )}

                {formState.scope === "environment" && (
                  <div className="space-y-2">
                    <Label className="text-white font-mono text-xs md:text-sm">Environment</Label>
                    <select
                      value={formState.environment}
                      onChange={(e) => updateForm({ environment: e.target.value as FormState["environment"] })}
                      className="w-full bg-transparent border border-[#303030] text-white h-11 px-3 font-mono text-sm appearance-none"
                    >
                      <option value="" className="bg-[#0a0a0a]">Select environment...</option>
                      <option value="development" className="bg-[#0a0a0a]">Development</option>
                      <option value="preview" className="bg-[#0a0a0a]">Preview</option>
                      <option value="production" className="bg-[#0a0a0a]">Production</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => updateModal({ showCreateModal: false })}
                  className="h-11 px-4 border border-[#303030] text-white hover:bg-white/5 active:bg-white/10 transition-colors order-2 sm:order-1 w-full sm:w-auto"
                  disabled={operationState.creating}
                >
                  <span className="font-mono text-sm whitespace-nowrap">Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={operationState.creating || !formState.name.trim() || !formState.value.trim()}
                  className="relative h-11 bg-[#e1e1e1] px-6 overflow-hidden hover:bg-white active:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2 w-full sm:w-auto"
                >
                  <div
                    className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                    style={{
                      backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                      backgroundSize: "2.915576934814453px 2.915576934814453px",
                    }}
                  />
                  <span className="relative z-10 text-black font-mono font-medium text-sm flex items-center justify-center gap-2 whitespace-nowrap">
                    {operationState.creating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                        Creating...
                      </>
                    ) : (
                      "Create Secret"
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Secret Modal */}
      {modalState.showEditModal && modalState.selectedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-lg my-auto">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-mono text-white uppercase">
                  Edit Secret
                </h3>
                <button
                  type="button"
                  onClick={() => updateModal({ showEditModal: false, selectedSecret: null })}
                  className="text-white/60 hover:text-white transition-colors p-1 -m-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">Name</Label>
                  <Input
                    value={formState.name}
                    disabled
                    className="bg-transparent border-[#303030] text-white/60 font-mono cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">
                    New Value (leave empty to keep current)
                  </Label>
                  <Textarea
                    value={formState.value}
                    onChange={(e) => updateForm({ value: e.target.value })}
                    placeholder="Enter new value..."
                    className="bg-transparent border-[#303030] text-white font-mono min-h-[80px] resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">Description</Label>
                  <Input
                    value={formState.description}
                    onChange={(e) => updateForm({ description: e.target.value })}
                    placeholder="Update description..."
                    className="bg-transparent border-[#303030] text-white"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => updateModal({ showEditModal: false, selectedSecret: null })}
                  className="h-11 px-4 border border-[#303030] text-white hover:bg-white/5 active:bg-white/10 transition-colors order-2 sm:order-1 w-full sm:w-auto"
                  disabled={operationState.updating}
                >
                  <span className="font-mono text-sm whitespace-nowrap">Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleUpdateSubmit}
                  disabled={operationState.updating}
                  className="relative h-11 bg-[#e1e1e1] px-6 overflow-hidden hover:bg-white active:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2 w-full sm:w-auto"
                >
                  <div
                    className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                    style={{
                      backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                      backgroundSize: "2.915576934814453px 2.915576934814453px",
                    }}
                  />
                  <span className="relative z-10 text-black font-mono font-medium text-sm flex items-center justify-center gap-2 whitespace-nowrap">
                    {operationState.updating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                        Updating...
                      </>
                    ) : (
                      "Update Secret"
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reveal Value Modal */}
      {modalState.showValueModal && modalState.selectedSecret && modalState.revealedValue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-2xl my-auto max-h-[90vh] overflow-y-auto">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base sm:text-lg font-mono text-white uppercase truncate flex-1 min-w-0">
                  {modalState.selectedSecret.name}
                </h3>
                <button
                  type="button"
                  onClick={() => updateModal({ showValueModal: false, selectedSecret: null, revealedValue: null })}
                  className="text-white/60 hover:text-white transition-colors p-1 -m-1 flex-shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-[rgba(255,88,0,0.1)] border border-[#FF5800] p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-[#FF5800] font-mono">
                    ⚠️ This secret is now visible. Don&apos;t share it or expose it in client-side code.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">Secret Value</Label>
                  <div className="flex flex-col gap-2">
                    <div className="bg-[rgba(10,10,10,0.75)] border border-brand-surface p-3 max-h-[200px] overflow-y-auto">
                      <p className="text-xs sm:text-sm text-white/80 font-mono break-all whitespace-pre-wrap">
                        {modalState.revealedValue}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyValue}
                      className="h-11 px-4 bg-[#e1e1e1] hover:bg-white active:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                      title="Copy to clipboard"
                    >
                      <Copy className="h-5 w-5 text-black" />
                      <span className="text-black font-mono text-sm">Copy to Clipboard</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => updateModal({ showValueModal: false, selectedSecret: null, revealedValue: null })}
                  className="relative bg-[#e1e1e1] px-6 py-3 overflow-hidden hover:bg-white transition-colors w-full sm:w-auto"
                >
                  <div
                    className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                    style={{
                      backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                      backgroundSize: "2.915576934814453px 2.915576934814453px",
                    }}
                  />
                  <span className="relative z-10 text-black font-mono font-medium text-sm sm:text-base whitespace-nowrap">
                    Done
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {modalState.showBulkImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-lg my-auto max-h-[90vh] overflow-y-auto">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-mono text-white uppercase">
                  Import .env
                </h3>
                <button
                  type="button"
                  onClick={() => updateModal({ showBulkImportModal: false })}
                  className="text-white/60 hover:text-white transition-colors p-1 -m-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-white/60 font-mono">
                  Paste your .env file contents below. Each line should be in the format KEY=value.
                  Lines starting with # are ignored.
                </p>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">
                    .env Contents <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    value={bulkImportState.envContent}
                    onChange={(e) => setBulkImportState((prev) => ({ ...prev, envContent: e.target.value }))}
                    placeholder={`# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DISCORD_BOT_TOKEN=...`}
                    className="bg-transparent border-[#303030] text-white font-mono min-h-[200px] resize-none"
                  />
                </div>

                <div className="bg-[rgba(255,88,0,0.1)] border border-[#FF5800]/40 p-3">
                  <p className="text-xs text-[#FF5800] font-mono">
                    ⚠️ Existing secrets with the same name will NOT be overwritten.
                    Any duplicates will be reported as errors.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => updateModal({ showBulkImportModal: false })}
                  className="h-11 px-4 border border-[#303030] text-white hover:bg-white/5 active:bg-white/10 transition-colors order-2 sm:order-1 w-full sm:w-auto"
                  disabled={bulkImportState.importing}
                >
                  <span className="font-mono text-sm whitespace-nowrap">Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleBulkImportSubmit}
                  disabled={bulkImportState.importing || !bulkImportState.envContent.trim()}
                  className="relative h-11 bg-[#e1e1e1] px-6 overflow-hidden hover:bg-white active:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2 w-full sm:w-auto"
                >
                  <div
                    className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                    style={{
                      backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                      backgroundSize: "2.915576934814453px 2.915576934814453px",
                    }}
                  />
                  <span className="relative z-10 text-black font-mono font-medium text-sm flex items-center justify-center gap-2 whitespace-nowrap">
                    {bulkImportState.importing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                        Importing...
                      </>
                    ) : (
                      "Import Secrets"
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rotate Secret Modal */}
      {modalState.showRotateModal && modalState.selectedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-lg my-auto">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-mono text-white uppercase">
                  Rotate Secret
                </h3>
                <button
                  type="button"
                  onClick={() => updateModal({ showRotateModal: false, selectedSecret: null })}
                  className="text-white/60 hover:text-white transition-colors p-1 -m-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-[rgba(255,88,0,0.1)] border border-[#FF5800]/40 p-3">
                  <p className="text-xs text-[#FF5800] font-mono">
                    ⚠️ Rotating a secret will create a new version. The old value will be
                    replaced immediately. Make sure your applications are ready for the new value.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">Secret Name</Label>
                  <Input
                    value={modalState.selectedSecret.name}
                    disabled
                    className="bg-transparent border-[#303030] text-white/60 font-mono cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">
                    New Value <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    value={formState.value}
                    onChange={(e) => updateForm({ value: e.target.value })}
                    placeholder="Enter new secret value..."
                    className="bg-transparent border-[#303030] text-white font-mono min-h-[80px] resize-none"
                  />
                </div>

                <div className="text-xs font-mono text-white/40">
                  Current version: v{modalState.selectedSecret.version}
                  {modalState.selectedSecret.lastRotatedAt && (
                    <> • Last rotated: {new Date(modalState.selectedSecret.lastRotatedAt).toLocaleDateString()}</>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => updateModal({ showRotateModal: false, selectedSecret: null })}
                  className="h-11 px-4 border border-[#303030] text-white hover:bg-white/5 active:bg-white/10 transition-colors order-2 sm:order-1 w-full sm:w-auto"
                  disabled={operationState.rotating}
                >
                  <span className="font-mono text-sm whitespace-nowrap">Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleRotateSubmit}
                  disabled={operationState.rotating || !formState.value.trim()}
                  className="relative h-11 bg-[#FF5800] px-6 overflow-hidden hover:bg-[#FF5800]/90 active:bg-[#FF5800]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2 w-full sm:w-auto"
                >
                  <span className="relative z-10 text-white font-mono font-medium text-sm flex items-center justify-center gap-2 whitespace-nowrap">
                    {operationState.rotating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                        Rotating...
                      </>
                    ) : (
                      <>
                        <RotateCw className="h-4 w-4" />
                        Rotate Secret
                      </>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {modalState.showAuditModal && modalState.selectedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-2xl max-h-[85vh] flex flex-col my-auto">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 flex flex-col h-full min-h-0">
              <div className="flex items-start justify-between gap-3 mb-4 flex-shrink-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-white/40 uppercase mb-1">Audit Log</p>
                  <h3 className="text-base sm:text-lg font-mono text-white truncate">
                    {modalState.selectedSecret.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => updateModal({ showAuditModal: false, selectedSecret: null, auditLogs: [] })}
                  className="text-white/60 hover:text-white transition-colors p-1 -m-1 flex-shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {operationState.loadingAudit ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[#FF5800]" />
                  </div>
                ) : modalState.auditLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-white/40">
                    <History className="h-8 w-8 mb-2" />
                    <p className="font-mono text-sm">No audit logs found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {modalState.auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 bg-[rgba(10,10,10,0.5)] border border-brand-surface"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                          <span className={`px-2 py-0.5 text-[10px] sm:text-xs font-mono uppercase w-fit ${
                            log.action === "created" ? "bg-green-500/20 text-green-400" :
                            log.action === "deleted" ? "bg-red-500/20 text-red-400" :
                            log.action === "rotated" ? "bg-[#FF5800]/20 text-[#FF5800]" :
                            "bg-white/10 text-white/60"
                          }`}>
                            {log.action}
                          </span>
                          <span className="text-[10px] sm:text-xs font-mono text-white/40">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[10px] sm:text-xs font-mono text-white/60 break-all">
                          <span className="text-white/40">By:</span>{" "}
                          <span className="break-all">{log.actorEmail || log.actorId}</span>
                          {log.actorType !== "user" && (
                            <span className="text-white/30"> ({log.actorType})</span>
                          )}
                          {log.ipAddress && (
                            <>
                              <br className="sm:hidden" />
                              <span className="text-white/30 sm:before:content-['_']">from {log.ipAddress}</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 mt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => updateModal({ showAuditModal: false, selectedSecret: null, auditLogs: [] })}
                  className="relative bg-[#e1e1e1] px-6 py-2.5 overflow-hidden hover:bg-white transition-colors"
                >
                  <span className="relative z-10 text-black font-mono font-medium text-sm">
                    Close
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

