/**
 * Hook to fetch and sync user profile data from database
 * Provides access to avatar and other profile information
 */

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  nickname: string | null;
  work_function: string | null;
  wallet_address: string | null;
  wallet_chain_type: string | null;
  role: string;
}

export function useUserProfile() {
  const { authenticated, ready } = usePrivy();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/v1/user");
        if (!response.ok) {
          throw new Error("Failed to fetch user profile");
        }

        const data = await response.json();
        if (data.success && data.data) {
          setProfile(data.data);
        } else {
          throw new Error(data.error || "Failed to load profile");
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
        setError(err instanceof Error ? err.message : "Failed to load profile");
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [authenticated, ready]);

  return { profile, isLoading, error };
}
