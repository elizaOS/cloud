"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Mail, Clock, X, User, Shield, CheckCircle2, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  inviter: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  accepted_at: string | null;
}

interface PendingInvitesListProps {
  invites: Invite[];
  onRevoke: (inviteId: string) => void;
}

export function PendingInvitesList({ invites, onRevoke }: PendingInvitesListProps) {
  const pendingInvites = invites.filter((i) => i.status === "pending");
  const [now] = useState(() => Date.now());

  if (pendingInvites.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Mail className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No pending invitations</p>
      </Card>
    );
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="h-3.5 w-3.5" />;
      default:
        return <User className="h-3.5 w-3.5" />;
    }
  };

  const getStatusBadge = (invite: Invite) => {
    const now = new Date();
    const expiresAt = new Date(invite.expires_at);

    if (invite.status === "pending" && now > expiresAt) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Expired
        </Badge>
      );
    }

    switch (invite.status) {
      case "pending":
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case "accepted":
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Accepted
          </Badge>
        );
      case "revoked":
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Revoked
          </Badge>
        );
      default:
        return <Badge variant="outline">{invite.status}</Badge>;
    }
  };

  const getInviterName = (invite: Invite) => {
    if (!invite.inviter) return "Unknown";
    return invite.inviter.name || invite.inviter.email || "Unknown";
  };

  return (
    <div className="space-y-3">
      {pendingInvites.map((invite) => {
        const expiresAt = new Date(invite.expires_at);
        const isExpiringSoon = expiresAt.getTime() - now < 24 * 60 * 60 * 1000;

        return (
          <Card key={invite.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                {/* Email */}
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate">{invite.email}</span>
                </div>

                {/* Role */}
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="flex items-center gap-1">
                    {getRoleIcon(invite.role)}
                    <span className="capitalize">{invite.role}</span>
                  </Badge>
                  {getStatusBadge(invite)}
                </div>

                {/* Metadata */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-muted-foreground">
                  <span>
                    Invited by {getInviterName(invite)}
                  </span>
                  <span className="hidden sm:inline">•</span>
                  <span>
                    {formatDistanceToNow(new Date(invite.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>

                {/* Expiration Warning */}
                {isExpiringSoon && (
                  <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      Expires {formatDistanceToNow(expiresAt, { addSuffix: true })}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-9 px-3">
                      <X className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to revoke the invitation for{" "}
                        <span className="font-medium">{invite.email}</span>? They
                        will not be able to join using this invitation link.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onRevoke(invite.id)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Revoke
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Show revoked/accepted invites */}
      {invites.filter((i) => i.status !== "pending").length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Show past invitations ({invites.filter((i) => i.status !== "pending").length})
          </summary>
          <div className="space-y-3 mt-3">
            {invites
              .filter((i) => i.status !== "pending")
              .map((invite) => (
                <Card key={invite.id} className="p-4 opacity-60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium truncate">{invite.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="flex items-center gap-1">
                          {getRoleIcon(invite.role)}
                          <span className="capitalize">{invite.role}</span>
                        </Badge>
                        {getStatusBadge(invite)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {invite.status === "accepted" && invite.accepted_at && (
                          <span>
                            Accepted {formatDistanceToNow(new Date(invite.accepted_at), { addSuffix: true })}
                          </span>
                        )}
                        {invite.status === "revoked" && (
                          <span>Revoked</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
