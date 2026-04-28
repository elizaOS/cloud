import { useQuery } from "@tanstack/react-query";
import { api } from "../api-client";

export interface OrgMember {
  user_id: string;
  email: string | null;
  role: string;
  [key: string]: unknown;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

export function useOrgMembers() {
  return useQuery({
    queryKey: ["organization", "members"],
    queryFn: () =>
      api<{ members?: OrgMember[]; data?: OrgMember[] }>("/api/organizations/members").then(
        (r) => r.members ?? r.data ?? [],
      ),
  });
}

export function useOrgInvites() {
  return useQuery({
    queryKey: ["organization", "invites"],
    queryFn: () =>
      api<{ invites?: OrgInvite[]; data?: OrgInvite[] }>("/api/organizations/invites").then(
        (r) => r.invites ?? r.data ?? [],
      ),
  });
}
