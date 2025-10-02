import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
    CalendarClock,
    Copy,
    Eye,
    MoreHorizontal,
    RefreshCw,
    ShieldOff,
    Trash2,
} from "lucide-react";

import type { ApiKeyDisplay } from "./types";

interface ApiKeysTableProps {
    keys: ApiKeyDisplay[];
    onCopyKey?: (id: string) => void;
    onRevealKey?: (id: string) => void;
    onDisableKey?: (id: string) => void;
    onDeleteKey?: (id: string) => void;
    onRegenerateKey?: (id: string) => void;
}

function getStatusStyles(status: ApiKeyDisplay["status"]) {
    switch (status) {
        case "active":
            return {
                badge: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
                label: "Active",
            } as const;
        case "expired":
            return {
                badge: "bg-amber-500/15 text-amber-500 border-amber-500/30",
                label: "Expired",
            } as const;
        case "inactive":
        default:
            return {
                badge: "bg-muted text-muted-foreground border-transparent",
                label: "Inactive",
            } as const;
    }
}

function formatDate(value?: string | null) {
    if (!value) return "—";
    try {
        return new Date(value).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch (error) {
        return "—";
    }
}

export function ApiKeysTable({
    keys,
    onCopyKey,
    onRevealKey,
    onDisableKey,
    onDeleteKey,
    onRegenerateKey,
}: ApiKeysTableProps) {
    if (keys.length === 0) {
        return null;
    }

    return (
        <div className="overflow-hidden rounded-lg border bg-card">
            <div className="grid grid-cols-[minmax(240px,2fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(160px,1fr)_80px] items-center bg-muted/40 p-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Key</span>
                <span>Usage</span>
                <span>Security</span>
                <span>Timeline</span>
                <span className="text-right">Actions</span>
            </div>
            <div className="h-px bg-border" />
            <div className="divide-y">
                {keys.map((key) => {
                    const status = getStatusStyles(key.status);
                    return (
                        <div
                            key={key.id}
                            className="grid grid-cols-[minmax(240px,2fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(160px,1fr)_80px] items-stretch px-4 py-5 text-sm transition hover:bg-muted/40"
                        >
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground">
                                        {key.name}
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className={cn("border", status.badge)}
                                    >
                                        {status.label}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {key.description ?? "No description provided"}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                                        {`${key.keyPrefix}•••••••`}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2"
                                        onClick={() => onCopyKey?.(key.id)}
                                    >
                                        <Copy className="mr-1 h-3.5 w-3.5" />
                                        Copy
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2"
                                        onClick={() => onRegenerateKey?.(key.id)}
                                    >
                                        <RefreshCw className="mr-1 h-3.5 w-3.5" />
                                        Regenerate
                                    </Button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <span className="font-medium">
                                    {key.usageCount.toLocaleString()} requests
                                </span>
                                <p className="text-xs text-muted-foreground">
                                    Rate limit {key.rateLimit.toLocaleString()} / min
                                </p>
                            </div>

                            <div className="flex flex-col gap-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                    Permissions
                                </span>
                                {key.permissions.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                        {key.permissions.map((permission) => (
                                            <Badge key={permission} variant="secondary">
                                                {permission}
                                            </Badge>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        No permissions configured
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <CalendarClock className="h-3.5 w-3.5" />
                                    <span>Created {formatDate(key.createdAt)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CalendarClock className="h-3.5 w-3.5" />
                                    <span>Last used {formatDate(key.lastUsedAt)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CalendarClock className="h-3.5 w-3.5" />
                                    <span>
                                        {key.expiresAt ? `Expires ${formatDate(key.expiresAt)}` : "No expiry"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-start justify-end">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-9 w-9">
                                            <MoreHorizontal className="h-4 w-4" />
                                            <span className="sr-only">Open actions</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuLabel>Manage key</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => onCopyKey?.(key.id)}>
                                            <Copy className="mr-2 h-4 w-4" />
                                            Copy prefix
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => onRegenerateKey?.(key.id)}>
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Regenerate key
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => onDisableKey?.(key.id)}>
                                            <ShieldOff className="mr-2 h-4 w-4" />
                                            Disable key
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onClick={() => onDeleteKey?.(key.id)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Delete key
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
