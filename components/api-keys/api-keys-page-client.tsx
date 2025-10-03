'use client';

import { useMemo, useState } from "react";
import { KeyRound, Plus, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ApiKeyEmptyState } from "./api-key-empty-state";
import { ApiKeysSummary } from "./api-keys-summary";
import { ApiKeysTable } from "./api-keys-table";
import type { ApiKeyDisplay, ApiKeysSummaryData } from "./types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ApiKeysPageClientProps {
    keys: ApiKeyDisplay[];
    summary: ApiKeysSummaryData;
}

const rateLimitPresets = [
    { value: "standard", label: "Standard - 1,000 req/min" },
    { value: "high", label: "High throughput - 5,000 req/min" },
    { value: "custom", label: "Custom" },
] as const;

const permissionGroups = [
    {
        title: "Core",
        permissions: [
            { id: "read", label: "Read data" },
            { id: "write", label: "Write data" },
            { id: "usage", label: "View usage" },
        ],
    },
    {
        title: "Generations",
        permissions: [
            { id: "text", label: "Text generation" },
            { id: "image", label: "Image generation" },
            { id: "video", label: "Video generation" },
        ],
    },
    {
        title: "Management",
        permissions: [
            { id: "billing", label: "Billing" },
            { id: "team", label: "Team management" },
            { id: "keys", label: "Manage API keys" },
        ],
    },
] as const;

export function ApiKeysPageClient({ keys, summary }: ApiKeysPageClientProps) {
    const router = useRouter();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [rateLimitPreset, setRateLimitPreset] = useState<(typeof rateLimitPresets)[number]["value"]>("standard");
    const [isCreating, setIsCreating] = useState(false);
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        rate_limit: 1000,
    });
    const [createdKey, setCreatedKey] = useState<{ plainKey: string; name: string } | null>(null);

    const hasKeys = keys.length > 0;

    const permissionsPreview = useMemo(() => {
        return permissionGroups.flatMap((group) =>
            group.permissions.slice(0, 2).map((permission) => permission.label)
        );
    }, []);

    const handleCreateKey = async () => {
        setIsCreating(true);
        try {
            const rateLimit = rateLimitPreset === "standard" ? 1000 : rateLimitPreset === "high" ? 5000 : formData.rate_limit;

            const response = await fetch("/api/v1/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description,
                    permissions: selectedPermissions,
                    rate_limit: rateLimit,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to create API key");
            }

            setCreatedKey({ plainKey: data.plainKey, name: data.apiKey.name });
            setFormData({ name: "", description: "", rate_limit: 1000 });
            setSelectedPermissions([]);
            setRateLimitPreset("standard");
            toast.success("API key created successfully", {
                description: `${data.apiKey.name} has been created and is ready to use.`,
            });
            router.refresh();
        } catch (error) {
            console.error("Error creating API key:", error);
            toast.error("Failed to create API key", {
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
            });
        } finally {
            setIsCreating(false);
        }
    };

    const handleCopyKey = (plainKey: string) => {
        navigator.clipboard.writeText(plainKey);
        toast.success("Copied to clipboard", {
            description: "API key prefix has been copied to your clipboard.",
        });
    };

    const handleDisableKey = async (id: string) => {
        const key = keys.find((k) => k.id === id);
        const isCurrentlyActive = key?.status === "active";
        const action = isCurrentlyActive ? "disable" : "enable";

        if (!confirm(`Are you sure you want to ${action} this API key?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/v1/api-keys/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    is_active: !isCurrentlyActive,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || `Failed to ${action} API key`);
            }

            toast.success(`API key ${action}d`, {
                description: `The API key has been ${action}d successfully.`,
            });
            router.refresh();
        } catch (error) {
            console.error(`Error ${action}ing API key:`, error);
            toast.error(`Failed to ${action} API key`, {
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
            });
        }
    };

    const handleDeleteKey = async (id: string) => {
        if (!confirm("Are you sure you want to delete this API key? This action cannot be undone.")) {
            return;
        }

        try {
            const response = await fetch(`/api/v1/api-keys/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to delete API key");
            }

            toast.success("API key deleted", {
                description: "The API key has been permanently deleted.",
            });
            router.refresh();
        } catch (error) {
            console.error("Error deleting API key:", error);
            toast.error("Failed to delete API key", {
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
            });
        }
    };

    const handleRegenerateKey = async (id: string) => {
        if (!confirm("Are you sure you want to regenerate this API key? The old key will stop working immediately.")) {
            return;
        }

        try {
            const response = await fetch(`/api/v1/api-keys/${id}/regenerate`, {
                method: "POST",
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to regenerate API key");
            }

            setCreatedKey({ plainKey: data.plainKey, name: data.apiKey.name });
            toast.success("API key regenerated", {
                description: `${data.apiKey.name} has been regenerated. The old key is no longer valid.`,
            });
            router.refresh();
        } catch (error) {
            console.error("Error regenerating API key:", error);
            toast.error("Failed to regenerate API key", {
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
            });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <KeyRound className="h-5 w-5" />
                        </span>
                        <div>
                            <h1 className="text-3xl font-bold">API Keys</h1>
                            <p className="text-sm text-muted-foreground">
                                Securely manage programmatic access to the Eliza Cloud platform.
                            </p>
                        </div>
                    </div>
                </div>

                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button
                            size="lg"
                            className="gap-2 self-start rounded-full px-6 shadow-sm shadow-primary/20"
                        >
                            <Plus className="h-4 w-4" />
                            Create API Key
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Create API key</DialogTitle>
                            <DialogDescription>
                                Generate a scoped API key with clear permissions and rate limits.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="api-key-name">Name</Label>
                                <Input
                                    id="api-key-name"
                                    placeholder="Production integration"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    autoFocus
                                />
                                <p className="text-xs text-muted-foreground">
                                    Choose a descriptive name for this key so your team can recognize
                                    its purpose.
                                </p>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="api-key-description">Description</Label>
                                <Textarea
                                    id="api-key-description"
                                    placeholder="Used by our backend services for customer facing features"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label>Permissions</Label>
                                <div className="grid gap-3 rounded-lg border p-4">
                                    {permissionGroups.map((group) => (
                                        <div key={group.title} className="space-y-2">
                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                {group.title}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {group.permissions.map((permission) => {
                                                    const isSelected = selectedPermissions.includes(permission.id);
                                                    return (
                                                        <Button
                                                            key={permission.id}
                                                            type="button"
                                                            variant={isSelected ? "default" : "outline"}
                                                            size="sm"
                                                            className="rounded-full text-xs"
                                                            onClick={() => {
                                                                setSelectedPermissions((prev) =>
                                                                    isSelected
                                                                        ? prev.filter((p) => p !== permission.id)
                                                                        : [...prev, permission.id]
                                                                );
                                                            }}
                                                        >
                                                            {permission.label}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label>Rate limit</Label>
                                <Select
                                    value={rateLimitPreset}
                                    onValueChange={(value) =>
                                        setRateLimitPreset(value as (typeof rateLimitPresets)[number]["value"])
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a limit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {rateLimitPresets.map((preset) => (
                                            <SelectItem key={preset.value} value={preset.value}>
                                                {preset.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {rateLimitPreset === "custom" && (
                                    <div className="grid gap-2 rounded-lg border border-dashed p-4">
                                        <Label htmlFor="api-key-rate-custom">Custom requests / minute</Label>
                                        <Input
                                            id="api-key-rate-custom"
                                            type="number"
                                            placeholder="Enter custom rate limit"
                                            value={rateLimitPreset === "custom" ? formData.rate_limit : ""}
                                            onChange={(e) => setFormData({ ...formData, rate_limit: parseInt(e.target.value) || 100 })}
                                            min={100}
                                            step={100}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={isCreating}>
                                Cancel
                            </Button>
                            <Button onClick={handleCreateKey} disabled={isCreating || !formData.name.trim()}>
                                {isCreating ? "Creating..." : "Create key"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </header>

            <ApiKeysSummary summary={summary} />

            {createdKey && (
                <Dialog open={!!createdKey} onOpenChange={() => setCreatedKey(null)}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>API key created successfully</DialogTitle>
                            <DialogDescription>
                                Make sure to copy your API key now. You won&apos;t be able to see it again!
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <Label>Key name</Label>
                                <div className="font-mono text-sm font-semibold">{createdKey.name}</div>
                            </div>
                            <div className="grid gap-2">
                                <Label>API Key</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={createdKey.plainKey}
                                        readOnly
                                        className="font-mono text-sm"
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() => handleCopyKey(createdKey.plainKey)}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => { setCreatedKey(null); setCreateDialogOpen(false); }}>Done</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                <div className="space-y-6">
                    {hasKeys ? (
                        <ApiKeysTable
                            keys={keys}
                            onCopyKey={(id) => {
                                const key = keys.find((k) => k.id === id);
                                if (key) handleCopyKey(key.keyPrefix);
                            }}
                            onDisableKey={handleDisableKey}
                            onDeleteKey={handleDeleteKey}
                            onRegenerateKey={handleRegenerateKey}
                        />
                    ) : (
                        <ApiKeyEmptyState onCreateKey={() => setCreateDialogOpen(true)} />
                    )}
                </div>

                <aside className="space-y-6">
                    <Card className="border-muted-foreground/10 bg-muted/40">
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">Best practices</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-muted-foreground">
                            <div>
                                <p className="font-medium text-foreground">Rotate regularly</p>
                                <p>Re-issue keys every 60-90 days to reduce exposure risk.</p>
                            </div>
                            <div>
                                <p className="font-medium text-foreground">Keep secrets secure</p>
                                <p>Store key values in your secret manager, not in source control.</p>
                            </div>
                            <div>
                                <p className="font-medium text-foreground">Scope intentionally</p>
                                <p>
                                    Use permission presets to limit access to only what each integration
                                    needs.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-muted-foreground/10">
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">Quick reference</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p>
                                API keys are prefixed for safe sharing. The full secret is visible only
                                once after creation.
                            </p>
                            <p>
                                Need to collaborate? Invite teammates from the organization settings to
                                share access.
                            </p>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Example scopes
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {permissionsPreview.map((scope) => (
                                    <span
                                        key={scope}
                                        className="rounded-full border border-dashed border-muted-foreground/40 px-3 py-1 text-xs font-medium text-muted-foreground"
                                    >
                                        {scope}
                                    </span>
                                ))}
                                <span className="rounded-full border border-dashed border-muted-foreground/40 px-3 py-1 text-xs font-medium text-muted-foreground/70">
                                    + more
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
