/**
 * Agent Secrets Panel Component
 *
 * Manages encrypted secrets scoped to a specific agent/character.
 * These secrets are automatically available when the agent runs.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Copy, Trash2, Loader2, Eye, X, Lock, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BrandCard, CornerBrackets } from "@/components/brand";

interface AgentSecretsPanelProps {
  characterId: string;
  characterName: string;
}

interface SecretMetadata {
  id: string;
  name: string;
  description: string | null;
  environment: "development" | "preview" | "production" | null;
  version: number;
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
  environment: "development" | "preview" | "production" | "";
}

const ENVIRONMENT_LABELS: Record<string, string> = {
  development: "Development",
  preview: "Preview",
  production: "Production",
};

export function AgentSecretsPanel({
  characterId,
  characterName,
}: AgentSecretsPanelProps) {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);

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
      environment: "",
    });
  };

  const fetchSecrets = useCallback(async () => {
    updateOperation({ loading: true });
    const response = await fetch(
      `/api/my-agents/characters/${characterId}/secrets`,
    );

    if (!response.ok) {
      updateOperation({ loading: false });
      return;
    }

    const data = await response.json();
    setSecrets(data.secrets || []);
    updateOperation({ loading: false });
  }, [characterId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount is valid
    fetchSecrets();
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
    const response = await fetch(
      `/api/my-agents/characters/${characterId}/secrets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formState.name.trim().toUpperCase().replace(/-/g, "_"),
          value: formState.value,
          description: formState.description.trim() || undefined,
          environment: formState.environment || undefined,
        }),
      },
    );

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
    const response = await fetch(
      `/api/my-agents/characters/${characterId}/secrets/${modalState.selectedSecret.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: formState.value || undefined,
          description: formState.description.trim() || undefined,
        }),
      },
    );

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

    const response = await fetch(
      `/api/my-agents/characters/${characterId}/secrets/${secret.id}`,
    );

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to reveal secret");
      updateOperation({ revealingSecretId: null });
      return;
    }

    const data = await response.json();
    updateModal({
      showValueModal: true,
      selectedSecret: secret,
      revealedValue: data.value,
    });
    updateOperation({ revealingSecretId: null });
  };

  const handleCopyValue = async () => {
    if (!modalState.revealedValue) return;
    await navigator.clipboard.writeText(modalState.revealedValue);
    toast.success("Secret value copied to clipboard");
  };

  const handleDeleteSecret = async (secretId: string, secretName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the secret "${secretName}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    updateOperation({ deletingSecretId: secretId });

    const response = await fetch(
      `/api/my-agents/characters/${characterId}/secrets/${secretId}`,
      { method: "DELETE" },
    );

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

  const formatEnvironmentLabel = (env: string | null): string => {
    if (!env) return "All";
    return ENVIRONMENT_LABELS[env] || env;
  };

  return (
    <div className="flex flex-col gap-4">
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#FF5800]" />
                <h3 className="text-sm font-mono text-[#e1e1e1] uppercase">
                  Agent Secrets
                </h3>
              </div>
              <p className="text-xs font-mono text-[#858585]">
                Secrets are encrypted and automatically available when{" "}
                {characterName} runs.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCreateNew}
              className="relative bg-[#e1e1e1] h-10 px-4 overflow-hidden hover:bg-white active:bg-gray-200 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              <Plus className="h-4 w-4 text-black" />
              <span className="text-black font-mono text-xs">Add Secret</span>
            </button>
          </div>

          {/* Secrets List */}
          {operationState.loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-[#FF5800]" />
            </div>
          ) : secrets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 border border-brand-surface gap-2">
              <Lock className="h-6 w-6 text-white/20" />
              <p className="text-xs text-white/60 font-mono">
                No secrets configured for this agent.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {secrets.map((secret) => (
                <div
                  key={secret.id}
                  className="p-3 bg-[rgba(10,10,10,0.5)] border border-brand-surface space-y-3"
                >
                  {/* Secret info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <Lock className="h-3 w-3 text-[#FF5800] flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono text-white truncate">
                          {secret.name}
                        </p>
                        {secret.description && (
                          <p className="text-xs font-mono text-white/40 line-clamp-1">
                            {secret.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {secret.environment && (
                      <span className="px-1.5 py-0.5 bg-[rgba(255,88,0,0.2)] border border-[#FF5800]/40 text-[#FF5800] text-[10px] font-mono uppercase flex-shrink-0">
                        {formatEnvironmentLabel(secret.environment)}
                      </span>
                    )}
                  </div>

                  {/* Actions - larger touch targets */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRevealValue(secret)}
                      disabled={operationState.revealingSecretId === secret.id}
                      className="flex-1 h-9 px-2 border border-white/20 hover:bg-white/5 active:bg-white/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      title="Reveal value"
                    >
                      {operationState.revealingSecretId === secret.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-white/60" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-white/60" />
                      )}
                      <span className="text-xs font-mono text-white/60">
                        Reveal
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditSecret(secret)}
                      className="flex-1 h-9 px-2 border border-white/20 hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
                      title="Edit secret"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-white/60" />
                      <span className="text-xs font-mono text-white/60">
                        Edit
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSecret(secret.id, secret.name)}
                      disabled={operationState.deletingSecretId === secret.id}
                      className="h-9 px-3 border border-[#EB4335]/40 bg-[#EB4335]/10 hover:bg-[#EB4335]/20 active:bg-[#EB4335]/30 transition-colors disabled:opacity-50 flex items-center justify-center"
                      title="Delete secret"
                    >
                      {operationState.deletingSecretId === secret.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#EB4335]" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-[#EB4335]" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BrandCard>

      {/* Create Modal */}
      {modalState.showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 w-full max-w-md my-auto">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-mono text-white uppercase">
                  Add Secret
                </h3>
                <button
                  type="button"
                  onClick={() => updateModal({ showCreateModal: false })}
                  className="text-white/60 hover:text-white transition-colors p-1 -m-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-white font-mono text-xs">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={formState.name}
                    onChange={(e) =>
                      updateForm({
                        name: e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9_]/g, "_"),
                      })
                    }
                    placeholder="MY_API_KEY"
                    className="bg-transparent border-[#303030] text-white font-mono text-sm h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-white font-mono text-xs">
                    Value <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    value={formState.value}
                    onChange={(e) => updateForm({ value: e.target.value })}
                    placeholder="sk-..."
                    className="bg-transparent border-[#303030] text-white font-mono text-sm min-h-[60px] resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-white font-mono text-xs">
                    Description
                  </Label>
                  <Input
                    value={formState.description}
                    onChange={(e) =>
                      updateForm({ description: e.target.value })
                    }
                    placeholder="API key for..."
                    className="bg-transparent border-[#303030] text-white text-sm h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-white font-mono text-xs">
                    Environment
                  </Label>
                  <select
                    value={formState.environment}
                    onChange={(e) =>
                      updateForm({
                        environment: e.target.value as FormState["environment"],
                      })
                    }
                    className="w-full bg-transparent border border-[#303030] text-white p-2 font-mono text-sm h-9"
                  >
                    <option value="" className="bg-[#0a0a0a]">
                      All environments
                    </option>
                    <option value="development" className="bg-[#0a0a0a]">
                      Development
                    </option>
                    <option value="preview" className="bg-[#0a0a0a]">
                      Preview
                    </option>
                    <option value="production" className="bg-[#0a0a0a]">
                      Production
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => updateModal({ showCreateModal: false })}
                  className="px-3 py-2 border border-[#303030] text-white hover:bg-white/5 transition-colors text-sm font-mono"
                  disabled={operationState.creating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={
                    operationState.creating ||
                    !formState.name.trim() ||
                    !formState.value.trim()
                  }
                  className="px-3 py-2 bg-[#e1e1e1] hover:bg-white transition-colors disabled:opacity-50 text-black font-mono text-sm flex items-center gap-2"
                >
                  {operationState.creating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {modalState.showEditModal && modalState.selectedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 w-full max-w-md my-auto">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-mono text-white uppercase">
                  Edit Secret
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    updateModal({ showEditModal: false, selectedSecret: null })
                  }
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-white font-mono text-xs">Name</Label>
                  <Input
                    value={formState.name}
                    disabled
                    className="bg-transparent border-[#303030] text-white/60 font-mono text-sm h-9 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-white font-mono text-xs">
                    New Value (optional)
                  </Label>
                  <Textarea
                    value={formState.value}
                    onChange={(e) => updateForm({ value: e.target.value })}
                    placeholder="Leave empty to keep current value"
                    className="bg-transparent border-[#303030] text-white font-mono text-sm min-h-[60px] resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-white font-mono text-xs">
                    Description
                  </Label>
                  <Input
                    value={formState.description}
                    onChange={(e) =>
                      updateForm({ description: e.target.value })
                    }
                    placeholder="Update description..."
                    className="bg-transparent border-[#303030] text-white text-sm h-9"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() =>
                    updateModal({ showEditModal: false, selectedSecret: null })
                  }
                  className="px-3 py-2 border border-[#303030] text-white hover:bg-white/5 transition-colors text-sm font-mono"
                  disabled={operationState.updating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpdateSubmit}
                  disabled={operationState.updating}
                  className="px-3 py-2 bg-[#e1e1e1] hover:bg-white transition-colors disabled:opacity-50 text-black font-mono text-sm flex items-center gap-2"
                >
                  {operationState.updating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reveal Value Modal */}
      {modalState.showValueModal &&
        modalState.selectedSecret &&
        modalState.revealedValue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 w-full max-w-lg my-auto max-h-[90vh] overflow-y-auto">
              <CornerBrackets size="sm" className="opacity-50" />

              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-mono text-white uppercase">
                    {modalState.selectedSecret.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      updateModal({
                        showValueModal: false,
                        selectedSecret: null,
                        revealedValue: null,
                      })
                    }
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="bg-[rgba(255,88,0,0.1)] border border-[#FF5800] p-3">
                  <p className="text-xs text-[#FF5800] font-mono">
                    ⚠️ This secret is now visible. Don&apos;t share it.
                  </p>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 bg-[rgba(10,10,10,0.75)] border border-brand-surface p-3">
                    <p className="text-xs text-white/80 font-mono break-all">
                      {modalState.revealedValue}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyValue}
                    className="px-3 py-2 bg-[#e1e1e1] hover:bg-white transition-colors"
                    title="Copy"
                  >
                    <Copy className="h-4 w-4 text-black" />
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      updateModal({
                        showValueModal: false,
                        selectedSecret: null,
                        revealedValue: null,
                      })
                    }
                    className="px-4 py-2 bg-[#e1e1e1] hover:bg-white transition-colors text-black font-mono text-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
