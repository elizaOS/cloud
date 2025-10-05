"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, CheckCircle2, XCircle, Calendar } from "lucide-react";
import type { UserWithOrganization } from "@/lib/types";

interface AccountDetailsProps {
  user: UserWithOrganization;
}

export function AccountDetails({ user }: AccountDetailsProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          Account Details
        </CardTitle>
        <CardDescription>
          View your account status and important dates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Account ID</p>
              <p className="font-mono text-xs text-muted-foreground">{user.id}</p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Email Verification</p>
              <div className="flex items-center gap-2">
                {user.email_verified ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <Badge variant="outline" className="border-green-500/50 text-green-700 dark:text-green-400">
                      Verified
                    </Badge>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-yellow-500" />
                    <Badge variant="outline" className="border-yellow-500/50 text-yellow-700 dark:text-yellow-400">
                      Not Verified
                    </Badge>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Account Status</p>
              <Badge variant={user.is_active ? "default" : "destructive"}>
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Role</p>
              <Badge variant="secondary" className="capitalize">
                {user.role}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Account Created
              </p>
              <p className="text-sm">{formatDate(user.created_at)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Last Updated
              </p>
              <p className="text-sm">{formatDate(user.updated_at)}</p>
            </div>
          </div>

          {user.workos_user_id && (
            <div className="pt-4 border-t space-y-1">
              <p className="text-sm text-muted-foreground">Authentication Provider</p>
              <p className="text-xs font-mono text-muted-foreground">WorkOS ID: {user.workos_user_id}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

