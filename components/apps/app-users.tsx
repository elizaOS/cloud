/**
 * App users component displaying users who have used the app.
 * Shows user statistics including request counts, credits used, and activity timestamps.
 *
 * @param props - App users configuration
 * @param props.appId - App ID to fetch users for
 */

"use client";

import { useState, useEffect } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Users as UsersIcon,
  DollarSign,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { AppUser } from "@/lib/types";

/**
 * Display version of AppUser with formatted fields for UI.
 */
interface AppUserDisplay {
  id: string;
  user_id: string;
  total_requests: number;
  total_credits_used: string;
  first_seen_at: string;
  last_seen_at: string;
}

interface AppUsersProps {
  appId: string;
}

export function AppUsers({ appId }: AppUsersProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<AppUserDisplay[]>([]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/apps/${appId}/users?limit=50`);
      const data = await response.json();

      if (data.success) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 mb-4">
            <UsersIcon className="h-8 w-8 text-white/40" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            No users yet
          </h3>
          <p className="text-white/60">
            Users will appear here once they start using your app
          </p>
        </div>
      </BrandCard>
    );
  }

  return (
    <BrandCard>
      <CornerBrackets className="opacity-20" />
      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-[#FF5800]" />
            App Users ({users.length})
          </h2>
        </div>

        <div className="space-y-3">
          {users.map((appUser) => (
            <div
              key={appUser.id}
              className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/[0.07] rounded-lg border border-white/10 hover:border-white/20 transition-all"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-gradient-to-br from-[#FF5800] to-purple-600 text-white">
                    {appUser.user_id.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate mb-1">
                      User {appUser.user_id.substring(0, 8)}
                    </p>
                  <div className="flex items-center gap-4 text-sm text-white/60">
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      {appUser.total_requests} requests
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />$
                      {parseFloat(appUser.total_credits_used).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="text-right hidden lg:block">
                  <p className="text-sm text-white/60">
                    First seen{" "}
                    {formatDistanceToNow(new Date(appUser.first_seen_at), {
                      addSuffix: true,
                    })}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    Last seen{" "}
                    {formatDistanceToNow(new Date(appUser.last_seen_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </BrandCard>
  );
}
