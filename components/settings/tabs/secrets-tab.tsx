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
import { Plus, Copy, Trash2, Loader2, Eye, EyeOff, X, Lock, Shield, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SecretsTabProps {
  user: UserWithOrganization;
}

interface SecretMetadata {
  id: string;
  name: string;
  description: string | null;
  scope: "organization" | "project" | "environment";
  projectId: string | null;
  projectType: string | null;
  environment: "development" | "preview" | "production" | null;
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
  selectedSecret: SecretMetadata | null;
  revealedValue: string | null;
}

interface OperationState {
  loading: boolean;
  creating: boolean;
  updating: boolean;
  deletingSecretId: string | null;
  revealingSecretId: string | null;
}

interface FormState {
  name: string;
  value: string;
  description: string;
  scope: "organization" | "project" | "environment";
  projectType: "character" | "mcp" | "workflow" | "container" | "app" | "";
  projectId: string;
  environment: "development" | "preview" | "production" | "";
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

export function SecretsTab({ user }: SecretsTabProps) {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  const [modalState, setModalState] = useState<ModalState>({
    showCreateModal: false,
    showEditModal: false,
    showValueModal: false,
    selectedSecret: null,
    revealedValue: null,
  });

  const [operationState, setOperationState] = useState<OperationState>({
    loading: true,
    creating: false,
    updating: false,
    deletingSecretId: null,
    revealingSecretId: null,
  });

  const [formState, setFormState] = useState<FormState>({
    name: "",
    value: "",
    description: "",
    scope: "organization",
    projectType: "",
    projectId: "",
    environment: "",
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
    });
    updateModal({ showEditModal: true, selectedSecret: secret });
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
          <div className="flex flex-col md:flex-row items-start md:justify-between gap-4 w-full">
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
                <p>
                  <strong>Global secrets</strong> are available everywhere.{" "}
                  <strong>Project-scoped secrets</strong> are only available to specific agents, MCPs,
                  workflows, containers, or apps.
                </p>
              </div>
            </div>

            {/* Create New Secret Button */}
            <button
              type="button"
              onClick={handleCreateNew}
              className="relative bg-[#e1e1e1] px-4 py-2.5 overflow-hidden hover:bg-white transition-colors flex items-center justify-center gap-2 w-full md:w-auto md:flex-shrink-0"
            >
              <div
                className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                style={{
                  backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                  backgroundSize: "2.915576934814453px 2.915576934814453px",
                }}
              />
              <Plus className="relative z-10 h-[18px] w-[18px] text-black flex-shrink-0" />
              <span className="relative z-10 text-black font-mono font-medium text-sm md:text-base whitespace-nowrap">
                Add secret
              </span>
            </button>
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
                {/* Mobile Card Layout */}
                <div className="md:hidden space-y-4">
                  {secrets.map((secret) => (
                    <div
                      key={secret.id}
                      className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface p-4 space-y-3"
                    >
                      {/* Name and Scope Badge */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-[#FF5800]" />
                            <h4 className="text-base font-mono font-semibold text-white">
                              {secret.name}
                            </h4>
                          </div>
                          <span className="px-2 py-0.5 bg-[rgba(255,88,0,0.25)] border border-[#FF5800]/40 text-[#FF5800] text-xs font-mono uppercase flex-shrink-0">
                            {formatScopeLabel(secret)}
                          </span>
                        </div>
                        {secret.description && (
                          <p className="text-xs font-mono text-white/40">
                            {secret.description}
                          </p>
                        )}
                      </div>

                      {/* Info Grid */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                        <div className="space-y-1">
                          <p className="text-xs font-mono text-white/40 uppercase">Version</p>
                          <p className="text-xs font-mono text-white/80">v{secret.version}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-mono text-white/40 uppercase">Access Count</p>
                          <p className="text-xs font-mono text-white/80">{secret.accessCount}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-mono text-white/40 uppercase">Created</p>
                          <p className="text-xs font-mono text-white/80">
                            {new Date(secret.createdAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-mono text-white/40 uppercase">Last Accessed</p>
                          <p className="text-xs font-mono text-white/80">
                            {secret.lastAccessedAt
                              ? new Date(secret.lastAccessedAt).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : "Never"}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => handleRevealValue(secret)}
                          disabled={operationState.revealingSecretId === secret.id}
                          className="flex-1 px-4 py-2 border border-white/20 hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {operationState.revealingSecretId === secret.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                          ) : (
                            <Eye className="h-4 w-4 text-white/60" />
                          )}
                          <span className="text-xs font-mono text-white/60">Reveal</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditSecret(secret)}
                          className="flex-1 px-4 py-2 border border-white/20 hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                        >
                          <Edit2 className="h-4 w-4 text-white/60" />
                          <span className="text-xs font-mono text-white/60">Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSecret(secret.id, secret.name)}
                          disabled={operationState.deletingSecretId === secret.id}
                          className="px-3 py-2 border border-[#EB4335]/40 bg-[#EB4335]/10 hover:bg-[#EB4335]/20 transition-colors disabled:opacity-50"
                        >
                          {operationState.deletingSecretId === secret.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[#EB4335]" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-[#EB4335]" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table Layout */}
                <div className="hidden md:block w-full space-y-3">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-lg">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-mono text-white uppercase">
                  Create Secret
                </h3>
                <button
                  type="button"
                  onClick={() => updateModal({ showCreateModal: false })}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formState.name}
                    onChange={(e) => updateForm({ name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                    placeholder="MY_API_KEY"
                    className="bg-transparent border-[#303030] text-white font-mono"
                  />
                  <p className="text-xs text-white/40 font-mono">
                    Uppercase with underscores (e.g., OPENAI_API_KEY)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">
                    Value <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    value={formState.value}
                    onChange={(e) => updateForm({ value: e.target.value })}
                    placeholder="sk-..."
                    className="bg-transparent border-[#303030] text-white font-mono min-h-[80px] resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">
                    Description (optional)
                  </Label>
                  <Input
                    value={formState.description}
                    onChange={(e) => updateForm({ description: e.target.value })}
                    placeholder="OpenAI API key for production"
                    className="bg-transparent border-[#303030] text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">Scope</Label>
                  <select
                    value={formState.scope}
                    onChange={(e) => updateForm({ scope: e.target.value as FormState["scope"] })}
                    className="w-full bg-transparent border border-[#303030] text-white p-2 font-mono text-sm"
                  >
                    <option value="organization" className="bg-[#0a0a0a]">Global (all projects)</option>
                    <option value="project" className="bg-[#0a0a0a]">Project-scoped</option>
                    <option value="environment" className="bg-[#0a0a0a]">Environment-scoped</option>
                  </select>
                </div>

                {formState.scope === "project" && (
                  <div className="space-y-2">
                    <Label className="text-white font-mono text-sm">Project Type</Label>
                    <select
                      value={formState.projectType}
                      onChange={(e) => updateForm({ projectType: e.target.value as FormState["projectType"] })}
                      className="w-full bg-transparent border border-[#303030] text-white p-2 font-mono text-sm"
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
                    <Label className="text-white font-mono text-sm">Project ID</Label>
                    <Input
                      value={formState.projectId}
                      onChange={(e) => updateForm({ projectId: e.target.value })}
                      placeholder="UUID of the agent/MCP/workflow..."
                      className="bg-transparent border-[#303030] text-white font-mono"
                    />
                  </div>
                )}

                {formState.scope === "environment" && (
                  <div className="space-y-2">
                    <Label className="text-white font-mono text-sm">Environment</Label>
                    <select
                      value={formState.environment}
                      onChange={(e) => updateForm({ environment: e.target.value as FormState["environment"] })}
                      className="w-full bg-transparent border border-[#303030] text-white p-2 font-mono text-sm"
                    >
                      <option value="" className="bg-[#0a0a0a]">Select environment...</option>
                      <option value="development" className="bg-[#0a0a0a]">Development</option>
                      <option value="preview" className="bg-[#0a0a0a]">Preview</option>
                      <option value="production" className="bg-[#0a0a0a]">Production</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => updateModal({ showCreateModal: false })}
                  className="px-4 py-2.5 border border-[#303030] text-white hover:bg-white/5 transition-colors order-2 sm:order-1 w-full sm:w-auto"
                  disabled={operationState.creating}
                >
                  <span className="font-mono text-sm whitespace-nowrap">Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={operationState.creating || !formState.name.trim() || !formState.value.trim()}
                  className="relative bg-[#e1e1e1] px-4 py-2.5 overflow-hidden hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2 w-full sm:w-auto"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-lg">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-mono text-white uppercase">
                  Edit Secret
                </h3>
                <button
                  type="button"
                  onClick={() => updateModal({ showEditModal: false, selectedSecret: null })}
                  className="text-white/60 hover:text-white transition-colors"
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

              <div className="flex flex-col sm:flex-row gap-4 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => updateModal({ showEditModal: false, selectedSecret: null })}
                  className="px-4 py-2.5 border border-[#303030] text-white hover:bg-white/5 transition-colors order-2 sm:order-1 w-full sm:w-auto"
                  disabled={operationState.updating}
                >
                  <span className="font-mono text-sm whitespace-nowrap">Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleUpdateSubmit}
                  disabled={operationState.updating}
                  className="relative bg-[#e1e1e1] px-4 py-2.5 overflow-hidden hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2 w-full sm:w-auto"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-2xl">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-mono text-white uppercase">
                  {modalState.selectedSecret.name}
                </h3>
                <button
                  type="button"
                  onClick={() => updateModal({ showValueModal: false, selectedSecret: null, revealedValue: null })}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-[rgba(255,88,0,0.1)] border border-[#FF5800] p-4">
                  <p className="text-sm text-[#FF5800] font-mono">
                    ⚠️ This secret is now visible. Don&apos;t share it or expose it in client-side code.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">Secret Value</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 bg-[rgba(10,10,10,0.75)] border border-brand-surface p-3">
                      <p className="text-xs sm:text-sm text-white/80 font-mono break-all">
                        {modalState.revealedValue}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyValue}
                      className="px-4 py-2 bg-[#e1e1e1] hover:bg-white transition-colors flex items-center justify-center gap-2"
                      title="Copy to clipboard"
                    >
                      <Copy className="h-5 w-5 text-black" />
                      <span className="text-black font-mono text-sm sm:hidden">Copy</span>
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
    </div>
  );
}

