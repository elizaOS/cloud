"use client";

import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { Plus, Copy, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ApisTabProps {
  user: UserWithOrganization;
}

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  key_prefix: string;
  organization_id: string;
  user_id: string;
  permissions: string[];
  rate_limit: number;
  is_active: boolean;
  usage_count: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export function ApisTab({ user }: ApisTabProps) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyDescription, setNewKeyDescription] = useState("");

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/v1/api-keys");

      if (!response.ok) {
        throw new Error("Failed to fetch API keys");
      }

      const data = await response.json();
      setApiKeys(data.keys || []);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      toast.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const handleCreateNewKey = () => {
    setNewKeyName("");
    setNewKeyDescription("");
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async () => {
    if (!newKeyName.trim()) {
      toast.error("API key name is required");
      return;
    }

    try {
      setCreating(true);
      const response = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          description: newKeyDescription.trim() || undefined,
          permissions: [],
          rate_limit: 1000,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create API key");
      }

      const data = await response.json();

      setNewlyCreatedKey(data.plainKey);
      setShowCreateModal(false);
      setShowKeyModal(true);

      await fetchApiKeys();

      toast.success("API key created successfully");
    } catch (error) {
      console.error("Error creating API key:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create API key",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCopyKey = async (keyPrefix: string) => {
    try {
      await navigator.clipboard.writeText(keyPrefix);
      toast.success("API key prefix copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy API key");
    }
  };

  const handleCopyFullKey = async () => {
    if (!newlyCreatedKey) return;

    try {
      await navigator.clipboard.writeText(newlyCreatedKey);
      toast.success("Full API key copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy API key");
    }
  };

  const handleDeleteKey = async (keyId: string, keyName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the API key "${keyName}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      setDeletingKeyId(keyId);

      const response = await fetch(`/api/v1/api-keys/${keyId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete API key");
      }

      setApiKeys(apiKeys.filter((key) => key.id !== keyId));

      toast.success("API key deleted successfully");
    } catch (error) {
      console.error("Error deleting API key:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete API key",
      );
    } finally {
      setDeletingKeyId(null);
    }
  };

  // Get user full name
  const getUserFullName = () => {
    if (user.name) return user.name;
    if (user.nickname) return user.nickname;
    return user.email?.split("@")[0] || "Unknown User";
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 pb-6 md:pb-8">
      {/* API Keys Card */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />

        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:justify-between gap-4 w-full">
            <div className="flex flex-col gap-2 max-w-[850px]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                  API keys
                </h3>
              </div>
              <div className="text-xs md:text-sm font-mono text-[#858585] tracking-tight space-y-2">
                <p>
                  You have permission to view and manage all API Keys in this
                  project.
                </p>
                <p>
                  Do not share your API Key with others or expose it in the
                  browser or other client-side code. To protect your
                  account&apos;s security, Eliza may automatically disable any
                  API Key that has leaked publicly.
                </p>
                <p>
                  View usage per Key on the{" "}
                  <span className="underline cursor-pointer hover:text-white transition-colors">
                    Usage page
                  </span>
                  .
                </p>
              </div>
            </div>

            {/* Create New Key Button */}
            <button
              type="button"
              onClick={handleCreateNewKey}
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
                Create new secret key
              </span>
            </button>
          </div>

          {/* API Keys Table */}
          <div className="w-full flex flex-col">
            {loading ? (
              <div className="flex items-center justify-center p-8 border border-brand-surface">
                <Loader2 className="h-6 w-6 animate-spin text-[#FF5800]" />
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 border border-brand-surface gap-2">
                <p className="text-sm text-white/60 font-mono">
                  No API keys yet. Create one to get started.
                </p>
              </div>
            ) : (
              <>
                {apiKeys.map((apiKey) => (
                  <div key={apiKey.id} className="flex items-end w-full">
                    {/* NAME */}
                    <div className="w-[260px] shrink-0">
                      <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-[#252527] h-full">
                        <div className="p-4 flex flex-col gap-1">
                          <p
                            className="text-[14px] leading-[24px] text-white uppercase"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            NAME
                          </p>
                          <p
                            className="text-[14px] leading-[20px] text-[rgba(255,255,255,0.6)]"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            {apiKey.name}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* SECRET KEY */}
                    <div className="flex-1">
                      <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-[#252527] border-l-0 h-full">
                        <div className="p-4 flex flex-col gap-1">
                          <p
                            className="text-[14px] leading-[24px] text-white uppercase"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            SECRET KEY
                          </p>
                          <p
                            className="text-[14px] leading-[20px] text-[rgba(255,255,255,0.6)]"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            {apiKey.key_prefix}...
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* CREATED */}
                    <div className="flex-1">
                      <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-[#252527] border-l-0 h-full">
                        <div className="p-4 flex flex-col gap-1">
                          <p
                            className="text-[14px] leading-[24px] text-white uppercase"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            CREATED
                          </p>
                          <p
                            className="text-[14px] leading-[20px] text-[rgba(255,255,255,0.6)]"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            {new Date(apiKey.created_at).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* LAST USED */}
                    <div className="flex-1">
                      <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-[#252527] border-l-0 h-full">
                        <div className="p-4 flex flex-col gap-1">
                          <p
                            className="text-[14px] leading-[24px] text-white uppercase"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            LAST USED
                          </p>
                          <p
                            className="text-[14px] leading-[20px] text-[rgba(255,255,255,0.6)]"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            {apiKey.last_used_at
                              ? new Date(apiKey.last_used_at).toLocaleDateString(
                                "en-US",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                },
                              )
                              : "Never"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* CREATED BY */}
                    <div className="flex-1">
                      <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-[#252527] border-l-0 h-full">
                        <div className="p-4 flex flex-col gap-1">
                          <p
                            className="text-[14px] leading-[24px] text-white uppercase"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            CREATED BY
                          </p>
                          <p
                            className="text-[14px] leading-[20px] text-[rgba(255,255,255,0.6)]"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            {getUserFullName()}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* PERMISSIONS */}
                    <div className="flex-1">
                      <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-[#252527] border-l-0 h-full">
                        <div className="p-4 flex flex-col gap-1">
                          <p
                            className="text-[14px] leading-[24px] text-white uppercase"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            PERMISSIONS
                          </p>
                          <p
                            className="text-[14px] leading-[20px] text-[rgba(255,255,255,0.6)]"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            {apiKey.permissions.length > 0
                              ? apiKey.permissions.join(", ")
                              : "All"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="w-[92px] shrink-0 h-[82px]">
                      <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-[#252527] border-l-0 h-full flex items-end">
                        <div className="p-4 flex items-center justify-center gap-4 w-full h-full">
                          <button
                            type="button"
                            onClick={() => handleCopyKey(apiKey.key_prefix)}
                            className="hover:opacity-80 transition-opacity"
                            title="Copy API key"
                          >
                            <Copy className="h-4 w-4 text-[#A2A2A2]" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteKey(apiKey.id, apiKey.name)
                            }
                            disabled={deletingKeyId === apiKey.id}
                            className="hover:opacity-80 transition-opacity disabled:opacity-50"
                            title="Delete API key"
                          >
                            {deletingKeyId === apiKey.id ? (
                              <Loader2 className="h-4 w-4 text-[#EB4335] animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-[#EB4335]" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </BrandCard>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-md">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-mono text-white uppercase">
                  Create API Key
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="My API Key"
                    className="bg-transparent border-[#303030] text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">
                    Description (optional)
                  </Label>
                  <Textarea
                    value={newKeyDescription}
                    onChange={(e) => setNewKeyDescription(e.target.value)}
                    placeholder="Used for production deployment"
                    className="bg-transparent border-[#303030] text-white min-h-[80px] resize-none"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 border border-[#303030] text-white hover:bg-white/5 transition-colors order-2 sm:order-1 w-full sm:w-auto"
                  disabled={creating}
                >
                  <span className="font-mono text-sm whitespace-nowrap">
                    Cancel
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={creating || !newKeyName.trim()}
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
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                        Creating...
                      </>
                    ) : (
                      "Create Key"
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show Full Key Modal */}
      {showKeyModal && newlyCreatedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-2xl">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-mono text-white uppercase">
                  Save Your API Key
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowKeyModal(false);
                    setNewlyCreatedKey(null);
                  }}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-[rgba(255,88,0,0.1)] border border-[#FF5800] p-4">
                  <p className="text-sm text-[#FF5800] font-mono">
                    ⚠️ This is the only time you will see this key. Save it
                    securely.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white font-mono text-sm">
                    API Key
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 bg-[rgba(10,10,10,0.75)] border border-brand-surface p-3">
                      <p className="text-xs sm:text-sm text-white/80 font-mono break-all">
                        {newlyCreatedKey}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyFullKey}
                      className="px-4 py-2 bg-[#e1e1e1] hover:bg-white transition-colors flex items-center justify-center gap-2"
                      title="Copy to clipboard"
                    >
                      <Copy className="h-5 w-5 text-black" />
                      <span className="text-black font-mono text-sm sm:hidden">
                        Copy
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowKeyModal(false);
                    setNewlyCreatedKey(null);
                  }}
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
