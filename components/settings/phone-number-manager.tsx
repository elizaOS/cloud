"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Phone,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  MessageSquare,
  CheckCircle,
  XCircle,
  Copy,
} from "lucide-react";

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  friendlyName: string | null;
  provider: "twilio" | "blooio";
  phoneType: string;
  agentId: string;
  webhookUrl: string;
  isActive: boolean;
  capabilities: {
    canSendSms: boolean;
    canReceiveSms: boolean;
    canSendMms: boolean;
    canReceiveMms: boolean;
    canVoice: boolean;
  };
  lastMessageAt: string | null;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  avatarUrl?: string;
}

export function PhoneNumberManager() {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formPhoneNumber, setFormPhoneNumber] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formProvider, setFormProvider] = useState<"twilio" | "blooio">(
    "twilio",
  );
  const [formFriendlyName, setFormFriendlyName] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch phone numbers and agents in parallel
      const [phoneRes, agentsRes] = await Promise.all([
        fetch("/api/v1/phone-numbers"),
        fetch("/api/my-agents/characters"),
      ]);

      if (phoneRes.ok) {
        const phoneData = await phoneRes.json();
        setPhoneNumbers(phoneData.phoneNumbers || []);
      }

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        const charactersList =
          agentsData.data?.characters || agentsData.characters || [];
        setAgents(
          charactersList.map((c: { id: string; name: string; avatarUrl?: string }) => ({
            id: c.id,
            name: c.name,
            avatarUrl: c.avatarUrl,
          })),
        );
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load phone numbers");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setFormPhoneNumber("");
    setFormAgentId("");
    setFormProvider("twilio");
    setFormFriendlyName("");
    setEditingId(null);
  };

  const openEditDialog = (pn: PhoneNumber) => {
    setFormPhoneNumber(pn.phoneNumber);
    setFormAgentId(pn.agentId);
    setFormProvider(pn.provider);
    setFormFriendlyName(pn.friendlyName || "");
    setEditingId(pn.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formPhoneNumber.trim() || !formAgentId) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        // Update existing
        const response = await fetch(`/api/v1/phone-numbers/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: formAgentId,
            friendlyName: formFriendlyName || null,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to update");
        }

        toast.success("Phone number updated successfully");
      } else {
        // Create new
        const response = await fetch("/api/v1/phone-numbers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber: formPhoneNumber,
            agentId: formAgentId,
            provider: formProvider,
            friendlyName: formFriendlyName || null,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create");
        }

        toast.success("Phone number registered successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save phone number",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to deactivate this phone number?")) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/phone-numbers/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete");
      }

      toast.success("Phone number deactivated");
      fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to deactivate phone number",
      );
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name || "Unknown Agent";
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Phone Number Routing
            </CardTitle>
            <CardDescription>
              Map phone numbers to agents for SMS and iMessage routing
            </CardDescription>
          </div>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Mapping
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit Phone Mapping" : "Add Phone Mapping"}
                </DialogTitle>
                <DialogDescription>
                  Connect a phone number to an agent to route incoming messages.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="+15551234567"
                    value={formPhoneNumber}
                    onChange={(e) => setFormPhoneNumber(e.target.value)}
                    disabled={!!editingId}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use E.164 format (e.g., +15551234567)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select
                    value={formProvider}
                    onValueChange={(v) =>
                      setFormProvider(v as "twilio" | "blooio")
                    }
                    disabled={!!editingId}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twilio">Twilio (SMS/MMS)</SelectItem>
                      <SelectItem value="blooio">Blooio (iMessage)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent">Assign to Agent</Label>
                  <Select value={formAgentId} onValueChange={setFormAgentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {agents.length === 0 && (
                    <p className="text-xs text-yellow-500">
                      No agents found. Please create an agent first.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="friendlyName">
                    Friendly Name (optional)
                  </Label>
                  <Input
                    id="friendlyName"
                    placeholder="Support Line"
                    value={formFriendlyName}
                    onChange={(e) => setFormFriendlyName(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving || !formPhoneNumber || !formAgentId}
                >
                  {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {editingId ? "Update" : "Add Mapping"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {phoneNumbers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No phone numbers configured yet.</p>
            <p className="text-sm mt-1">
              Add a mapping to route SMS/iMessage to your agents.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone Number</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Webhook</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {phoneNumbers.map((pn) => (
                <TableRow key={pn.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{pn.phoneNumber}</div>
                      {pn.friendlyName && (
                        <div className="text-xs text-muted-foreground">
                          {pn.friendlyName}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {pn.provider}
                    </Badge>
                  </TableCell>
                  <TableCell>{getAgentName(pn.agentId)}</TableCell>
                  <TableCell>
                    {pn.isActive ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(pn.webhookUrl)}
                      className="h-7 px-2"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy URL
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(pn)}
                        className="h-8 w-8"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(pn.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
