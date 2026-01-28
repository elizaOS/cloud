"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X } from "lucide-react";
import type { Trigger } from "./trigger-list";

interface TriggerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  trigger?: Trigger | null;
  onSaved: () => void;
}

const TRIGGER_TYPES = [
  { value: "message_keyword", label: "Keyword Match", description: "Match exact keywords in message" },
  { value: "message_contains", label: "Contains Text", description: "Match if message contains text" },
  { value: "message_from", label: "From Sender", description: "Match messages from specific senders" },
  { value: "message_regex", label: "Regex Pattern", description: "Match using regular expression" },
  { value: "schedule", label: "Scheduled", description: "Run on a schedule (cron expression)" },
  { value: "webhook", label: "Webhook", description: "Trigger via external webhook" },
];

const PROVIDER_OPTIONS = [
  { value: "all", label: "All Providers" },
  { value: "twilio", label: "SMS (Twilio)" },
  { value: "blooio", label: "iMessage (Blooio)" },
  { value: "telegram", label: "Telegram" },
];

export function TriggerDialog({
  open,
  onOpenChange,
  workflowId,
  trigger,
  onSaved,
}: TriggerDialogProps) {
  const isEditing = !!trigger;

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("message_keyword");
  const [providerFilter, setProviderFilter] = useState("all");
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [sendResponse, setSendResponse] = useState(true);
  const [responseTemplate, setResponseTemplate] = useState("");

  // Trigger config state
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [contains, setContains] = useState("");
  const [pattern, setPattern] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [phoneInput, setPhoneInput] = useState("");
  const [schedule, setSchedule] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form when editing
  useEffect(() => {
    if (trigger) {
      setName(trigger.name);
      setDescription(trigger.description || "");
      setTriggerType(trigger.triggerType);
      setProviderFilter(trigger.providerFilter);
      setPriority(trigger.priority);
      setIsActive(trigger.isActive);
      setSendResponse(trigger.responseConfig.sendResponse ?? true);
      setResponseTemplate(trigger.responseConfig.responseTemplate || "");

      const config = trigger.triggerConfig;
      setKeywords(config.keywords || []);
      setContains(config.contains || "");
      setPattern(config.pattern || "");
      setPhoneNumbers(config.phoneNumbers || []);
      setSchedule(config.schedule || "");
      setCaseSensitive(config.caseSensitive || false);
    } else {
      // Reset form for new trigger
      setName("");
      setDescription("");
      setTriggerType("message_keyword");
      setProviderFilter("all");
      setPriority(0);
      setIsActive(true);
      setSendResponse(true);
      setResponseTemplate("");
      setKeywords([]);
      setContains("");
      setPattern("");
      setPhoneNumbers([]);
      setSchedule("");
      setCaseSensitive(false);
    }
  }, [trigger, open]);

  const addKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const addPhoneNumber = () => {
    if (phoneInput.trim() && !phoneNumbers.includes(phoneInput.trim())) {
      setPhoneNumbers([...phoneNumbers, phoneInput.trim()]);
      setPhoneInput("");
    }
  };

  const removePhoneNumber = (phone: string) => {
    setPhoneNumbers(phoneNumbers.filter((p) => p !== phone));
  };

  const buildTriggerConfig = () => {
    const config: Record<string, unknown> = {};

    switch (triggerType) {
      case "message_keyword":
        config.keywords = keywords;
        config.caseSensitive = caseSensitive;
        break;
      case "message_contains":
        config.contains = contains;
        config.caseSensitive = caseSensitive;
        break;
      case "message_from":
        config.phoneNumbers = phoneNumbers;
        break;
      case "message_regex":
        config.pattern = pattern;
        config.caseSensitive = caseSensitive;
        break;
      case "schedule":
        config.schedule = schedule;
        break;
      case "webhook":
        // No special config needed
        break;
    }

    return config;
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        triggerConfig: buildTriggerConfig(),
        responseConfig: {
          sendResponse,
          responseTemplate: responseTemplate.trim() || undefined,
        },
        providerFilter,
        priority,
        isActive,
      };

      const url = isEditing
        ? `/api/v1/workflows/${workflowId}/triggers/${trigger.id}`
        : `/api/v1/workflows/${workflowId}/triggers`;

      const response = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save trigger");
      }

      toast.success(isEditing ? "Trigger updated" : "Trigger created");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save trigger");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Trigger" : "Create Trigger"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the trigger configuration"
              : "Configure when this workflow should automatically run"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name || ""}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Schedule Request Trigger"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description || ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          {/* Trigger Type */}
          <div className="space-y-2">
            <Label htmlFor="triggerType">Trigger Type *</Label>
            <Select value={triggerType} onValueChange={setTriggerType} disabled={isEditing}>
              <SelectTrigger id="triggerType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div>
                      <div>{type.label}</div>
                      <div className="text-xs text-muted-foreground">{type.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type-specific config */}
          {triggerType === "message_keyword" && (
            <div className="space-y-2">
              <Label>Keywords *</Label>
              <div className="flex gap-2">
                <Input
                  value={keywordInput || ""}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="Type a keyword"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                />
                <Button type="button" size="sm" onClick={addKeyword}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="gap-1">
                      {keyword}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeKeyword(keyword)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Trigger when message contains any of these keywords (word boundary match)
              </p>
            </div>
          )}

          {triggerType === "message_contains" && (
            <div className="space-y-2">
              <Label htmlFor="contains">Text to Match *</Label>
              <Input
                id="contains"
                value={contains || ""}
                onChange={(e) => setContains(e.target.value)}
                placeholder="e.g., appointment"
              />
              <p className="text-xs text-muted-foreground">
                Trigger when message contains this text anywhere
              </p>
            </div>
          )}

          {triggerType === "message_regex" && (
            <div className="space-y-2">
              <Label htmlFor="pattern">Regex Pattern *</Label>
              <Input
                id="pattern"
                value={pattern || ""}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="e.g., (schedule|book|appointment)"
              />
              <p className="text-xs text-muted-foreground">
                JavaScript regular expression pattern
              </p>
            </div>
          )}

          {triggerType === "message_from" && (
            <div className="space-y-2">
              <Label>Phone Numbers *</Label>
              <div className="flex gap-2">
                <Input
                  value={phoneInput || ""}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+15551234567"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhoneNumber())}
                />
                <Button type="button" size="sm" onClick={addPhoneNumber}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {phoneNumbers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {phoneNumbers.map((phone) => (
                    <Badge key={phone} variant="secondary" className="gap-1">
                      {phone}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removePhoneNumber(phone)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Trigger when message is from any of these phone numbers
              </p>
            </div>
          )}

          {triggerType === "schedule" && (
            <div className="space-y-2">
              <Label htmlFor="schedule">Cron Expression *</Label>
              <Input
                id="schedule"
                value={schedule || ""}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="0 9 * * *"
              />
              <p className="text-xs text-muted-foreground">
                Standard cron format: minute hour day month weekday
              </p>
            </div>
          )}

          {/* Case Sensitive */}
          {["message_keyword", "message_contains", "message_regex"].includes(triggerType) && (
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="caseSensitive">Case Sensitive</Label>
                <p className="text-xs text-muted-foreground">Match exact case</p>
              </div>
              <Switch
                id="caseSensitive"
                checked={caseSensitive}
                onCheckedChange={setCaseSensitive}
              />
            </div>
          )}

          {/* Provider Filter */}
          <div className="space-y-2">
            <Label htmlFor="providerFilter">Provider</Label>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger id="providerFilter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
              min={0}
            />
            <p className="text-xs text-muted-foreground">
              Higher priority triggers are checked first
            </p>
          </div>

          {/* Response Config */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="sendResponse">Send Response</Label>
                <p className="text-xs text-muted-foreground">
                  Reply with workflow output
                </p>
              </div>
              <Switch
                id="sendResponse"
                checked={sendResponse}
                onCheckedChange={setSendResponse}
              />
            </div>

            {sendResponse && (
              <div className="space-y-2">
                <Label htmlFor="responseTemplate">Response Template</Label>
                <Textarea
                  id="responseTemplate"
                  value={responseTemplate || ""}
                  onChange={(e) => setResponseTemplate(e.target.value)}
                  placeholder="Your calendar summary: {{message}}"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Use &#123;&#123;fieldName&#125;&#125; for workflow output placeholders
                </p>
              </div>
            )}
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="isActive">Active</Label>
              <p className="text-xs text-muted-foreground">
                Enable this trigger
              </p>
            </div>
            <Switch
              id="isActive"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
