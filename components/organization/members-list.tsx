"use client";

import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { User, Mail, Wallet, Crown, Shield, UserMinus } from "lucide-react";
import { format } from "date-fns";

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  wallet_address: string | null;
  wallet_chain_type: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface MembersListProps {
  members: Member[];
  currentUserId: string;
  currentUserRole: string;
  isOwner: boolean;
  onUpdateRole: (userId: string, role: string) => void;
  onRemove: (userId: string) => void;
}

export function MembersList({
  members,
  currentUserId,
  currentUserRole,
  isOwner,
  onUpdateRole,
  onRemove,
}: MembersListProps) {
  if (members.length === 0) {
    return (
      <Card className="p-8 text-center">
        <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No members found</p>
      </Card>
    );
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-4 w-4" />;
      case "admin":
        return <Shield className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getInitials = (member: Member) => {
    if (member.name) {
      return member.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
    }
    if (member.email) {
      return member.email.substring(0, 2).toUpperCase();
    }
    if (member.wallet_address) {
      return member.wallet_address.substring(2, 4).toUpperCase();
    }
    return "??";
  };

  const getDisplayName = (member: Member) => {
    if (member.name) return member.name;
    if (member.email) return member.email;
    if (member.wallet_address) {
      return `${member.wallet_address.substring(0, 6)}...${member.wallet_address.substring(member.wallet_address.length - 4)}`;
    }
    return "Unknown";
  };

  const canUpdateRole = (member: Member) => {
    return isOwner && member.id !== currentUserId && member.role !== "owner";
  };

  const canRemove = (member: Member) => {
    if (member.id === currentUserId) return false;
    if (member.role === "owner") return false;
    if (currentUserRole === "owner") return true;
    if (currentUserRole === "admin" && member.role !== "admin") return true;
    return false;
  };

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <Card key={member.id} className="p-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-secondary/20">
                {getInitials(member)}
              </AvatarFallback>
            </Avatar>

            {/* Member Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold truncate">
                      {getDisplayName(member)}
                    </h4>
                    {member.id === currentUserId && (
                      <Badge variant="outline" className="text-xs">
                        You
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1">
                    {member.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        {member.email}
                      </p>
                    )}
                    {member.wallet_address && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5" />
                        <span className="font-mono text-xs">
                          {member.wallet_address.substring(0, 10)}...
                          {member.wallet_address.substring(
                            member.wallet_address.length - 8,
                          )}
                        </span>
                        {member.wallet_chain_type && (
                          <Badge variant="outline" className="text-xs">
                            {member.wallet_chain_type}
                          </Badge>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Member since{" "}
                      {format(new Date(member.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>

                {/* Role Badge and Actions */}
                <div className="flex items-center gap-2">
                  {canUpdateRole(member) ? (
                    <Select
                      value={member.role}
                      onValueChange={(role) => onUpdateRole(member.id, role)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>
                          <div className="flex items-center gap-1.5">
                            {getRoleIcon(member.role)}
                            <span className="capitalize">{member.role}</span>
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-1.5">
                            <Shield className="h-4 w-4" />
                            Admin
                          </div>
                        </SelectItem>
                        <SelectItem value="member">
                          <div className="flex items-center gap-1.5">
                            <User className="h-4 w-4" />
                            Member
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={getRoleBadgeVariant(member.role)}>
                      <div className="flex items-center gap-1.5">
                        {getRoleIcon(member.role)}
                        <span className="capitalize">{member.role}</span>
                      </div>
                    </Badge>
                  )}

                  {canRemove(member) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-9 px-3">
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Member</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove{" "}
                            {getDisplayName(member)} from the organization? They
                            will lose access to all resources.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onRemove(member.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
