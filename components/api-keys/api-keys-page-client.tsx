'use client';

import { useMemo, useState } from "react";
import { KeyRound, Plus } from "lucide-react";

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
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [rateLimitPreset, setRateLimitPreset] = useState<(typeof rateLimitPresets)[number]["value"]>("standard");

    const hasKeys = keys.length > 0;

    const permissionsPreview = useMemo(() => {
        return permissionGroups.flatMap((group) =>
            group.permissions.slice(0, 2).map((permission) => permission.label)
        );
    }, []);

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
                                                {group.permissions.map((permission) => (
                                                    <Button
                                                        key={permission.id}
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-full border-dashed text-xs"
                                                    >
                                                        {permission.label}
                                                    </Button>
                                                ))}
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
                                            min={100}
                                            step={100}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button disabled>Create key</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </header>

            <ApiKeysSummary summary={summary} />

            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                <div className="space-y-6">
                    {hasKeys ? (
                        <ApiKeysTable keys={keys} />
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
