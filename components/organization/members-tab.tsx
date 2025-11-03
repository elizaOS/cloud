"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, Loader2 } from "lucide-react";
import type { UserWithOrganization } from "@/lib/types";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MembersList } from "./members-list";
import { PendingInvitesList } from "./pending-invites-list";
import { toast } from "sonner";

interface MembersTabProps {
  user: UserWithOrganization;
}

export function MembersTab({ user }: MembersTabProps) {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);

  const fetchMembers = async () => {
    try {
      setIsLoadingMembers(true);
      const response = await fetch("/api/organizations/members");
      const data = await response.json();

      if (data.success) {
        setMembers(data.data);
      } else {
        toast.error("Failed to load members");
      }
    } catch (error) {
      console.error("Error fetching members:", error);
      toast.error("Failed to load members");
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const fetchInvites = async () => {
    try {
      setIsLoadingInvites(true);
      const response = await fetch("/api/organizations/invites");
      const data = await response.json();

      if (data.success) {
        setInvites(data.data);
      } else {
        toast.error("Failed to load invites");
      }
    } catch (error) {
      console.error("Error fetching invites:", error);
      toast.error("Failed to load invites");
    } finally {
      setIsLoadingInvites(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchInvites();
  }, []);

  const handleInviteSuccess = () => {
    setIsInviteDialogOpen(false);
    fetchInvites();
    toast.success("Invitation sent successfully");
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      const response = await fetch(`/api/organizations/invites/${inviteId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Invitation revoked");
        fetchInvites();
      } else {
        toast.error(data.error || "Failed to revoke invitation");
      }
    } catch (error) {
      console.error("Error revoking invite:", error);
      toast.error("Failed to revoke invitation");
    }
  };

  const handleUpdateMemberRole = async (userId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/organizations/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Member role updated");
        fetchMembers();
      } else {
        toast.error(data.error || "Failed to update member role");
      }
    } catch (error) {
      console.error("Error updating member role:", error);
      toast.error("Failed to update member role");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) {
      return;
    }

    try {
      const response = await fetch(`/api/organizations/members/${userId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Member removed");
        fetchMembers();
      } else {
        toast.error(data.error || "Failed to remove member");
      }
    } catch (error) {
      console.error("Error removing member:", error);
      toast.error("Failed to remove member");
    }
  };

  const canManageMembers = user.role === "owner" || user.role === "admin";
  const isOwner = user.role === "owner";

  return (
    <div className="space-y-6">
      {/* Header with Invite Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Team Members</h3>
          <p className="text-sm text-muted-foreground">
            Manage who has access to your organization
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setIsInviteDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Members List */}
      {isLoadingMembers ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <MembersList
          members={members}
          currentUserId={user.id}
          currentUserRole={user.role}
          isOwner={isOwner}
          onUpdateRole={handleUpdateMemberRole}
          onRemove={handleRemoveMember}
        />
      )}

      {/* Pending Invites */}
      {canManageMembers && (
        <>
          <div className="pt-6 border-t">
            <h3 className="text-lg font-semibold mb-4">Pending Invitations</h3>
            {isLoadingInvites ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PendingInvitesList
                invites={invites}
                onRevoke={handleRevokeInvite}
              />
            )}
          </div>
        </>
      )}

      {/* Invite Member Dialog */}
      <InviteMemberDialog
        isOpen={isInviteDialogOpen}
        onClose={() => setIsInviteDialogOpen(false)}
        onSuccess={handleInviteSuccess}
      />
    </div>
  );
}
