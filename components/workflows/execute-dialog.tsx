"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Loader2,
  Mail,
  Phone,
  Calendar,
  MessageSquare,
  TestTube2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

interface ExecutionStep {
  step: number;
  serviceId: string;
  operation: string;
}

interface ExecuteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowName: string;
  executionPlan: ExecutionStep[];
  onExecute: (params: Record<string, unknown>, dryRun: boolean) => Promise<ExecutionResult>;
}

interface ExecutionResult {
  success: boolean;
  executionId?: string;
  result?: {
    success: boolean;
    data?: Record<string, unknown>;
    steps?: Array<{
      stepName: string;
      success: boolean;
      output?: unknown;
      error?: string;
      durationMs: number;
    }>;
    error?: string;
    message?: string;
  };
  executionTimeMs?: number;
  error?: string;
}

// Infer required parameters from execution plan
function inferRequiredParams(plan: ExecutionStep[]): string[] {
  const params: string[] = [];
  
  for (const step of plan) {
    const op = `${step.serviceId}.${step.operation}`;
    
    // Email operations
    if (op.includes("sendEmail") || op.includes("send_email") || op.includes("gmail")) {
      if (!params.includes("to")) params.push("to");
      if (!params.includes("subject")) params.push("subject");
      if (!params.includes("body")) params.push("body");
    }
    
    // SMS operations
    if (op.includes("sendSms") || op.includes("send_sms") || op.includes("twilio")) {
      if (!params.includes("to")) params.push("to");
      if (!params.includes("from")) params.push("from");
      if (!params.includes("body")) params.push("body");
    }
    
    // iMessage operations
    if (op.includes("sendIMessage") || op.includes("send_imessage") || op.includes("blooio")) {
      if (!params.includes("to")) params.push("to");
      if (!params.includes("from")) params.push("from");
      if (!params.includes("body")) params.push("body");
    }
    
    // Calendar operations
    if (op.includes("createCalendarEvent") || op.includes("create_event") || op.includes("calendar")) {
      if (!params.includes("summary")) params.push("summary");
      if (!params.includes("start")) params.push("start");
      if (!params.includes("end")) params.push("end");
    }
  }
  
  return params;
}

export function ExecuteDialog({
  open,
  onOpenChange,
  workflowName,
  executionPlan,
  onExecute,
}: ExecuteDialogProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  
  // Form state
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const requiredParams = useMemo(() => inferRequiredParams(executionPlan), [executionPlan]);
  
  const handleExecute = async () => {
    setIsExecuting(true);
    setResult(null);
    
    try {
      // Build params object from form fields
      const params: Record<string, unknown> = {};
      
      if (to) params.to = to;
      if (from) params.from = from;
      if (subject) params.subject = subject;
      if (body) params.body = body;
      if (summary) params.summary = summary;
      if (startDate) params.start = new Date(startDate).toISOString();
      if (endDate) params.end = new Date(endDate).toISOString();
      
      const executionResult = await onExecute(params, dryRun);
      setResult(executionResult);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Execution failed",
      });
    } finally {
      setIsExecuting(false);
    }
  };
  
  const handleClose = () => {
    setResult(null);
    onOpenChange(false);
  };
  
  const needsEmailFields = requiredParams.includes("to") && requiredParams.includes("subject");
  const needsSmsFields = requiredParams.includes("to") && requiredParams.includes("from") && !requiredParams.includes("subject");
  const needsCalendarFields = requiredParams.includes("summary");
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Run Workflow
          </DialogTitle>
          <DialogDescription>
            Execute &ldquo;{workflowName}&rdquo; with the parameters below.
          </DialogDescription>
        </DialogHeader>
        
        {/* Execution Plan Preview */}
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">Execution Plan:</p>
          <div className="flex flex-wrap gap-1">
            {executionPlan.map((step, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {step.step}. {step.serviceId}.{step.operation}
              </Badge>
            ))}
            {executionPlan.length === 0 && (
              <span className="text-xs text-muted-foreground">No steps defined</span>
            )}
          </div>
        </div>
        
        <Separator />
        
        {/* Result Display */}
        {result && (
          <div className={`rounded-lg p-4 ${result.success ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400" />
              )}
              <span className="font-medium">
                {result.success ? "Execution Successful" : "Execution Failed"}
              </span>
            </div>
            
            {result.result?.steps && result.result.steps.length > 0 && (
              <div className="space-y-2 mt-3">
                <p className="text-xs text-muted-foreground">Steps:</p>
                {result.result.steps.map((step, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-background/50 rounded p-2">
                    <span className="flex items-center gap-2">
                      {step.success ? (
                        <CheckCircle className="h-3 w-3 text-green-400" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-red-400" />
                      )}
                      {step.stepName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {step.durationMs}ms
                    </span>
                  </div>
                ))}
              </div>
            )}
            
            {result.error && (
              <p className="text-sm text-red-400 mt-2">{result.error}</p>
            )}
            
            {result.result?.error && (
              <p className="text-sm text-red-400 mt-2">{result.result.error}</p>
            )}
            
            {result.executionTimeMs && (
              <p className="text-xs text-muted-foreground mt-2">
                Total time: {result.executionTimeMs}ms
              </p>
            )}
          </div>
        )}
        
        {/* Input Fields */}
        {!result && (
          <div className="space-y-4">
            {/* Email Fields */}
            {needsEmailFields && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="to" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    To Email
                  </Label>
                  <Input
                    id="to"
                    type="email"
                    placeholder="recipient@example.com"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    placeholder="Email subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Message Body
                  </Label>
                  <Textarea
                    id="body"
                    placeholder="Enter your message..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}
            
            {/* SMS/iMessage Fields */}
            {needsSmsFields && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="to" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    To Phone Number
                  </Label>
                  <Input
                    id="to"
                    type="tel"
                    placeholder="+1234567890"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from">From Phone Number</Label>
                  <Input
                    id="from"
                    type="tel"
                    placeholder="+1234567890"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Message
                  </Label>
                  <Textarea
                    id="body"
                    placeholder="Enter your message..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}
            
            {/* Calendar Fields */}
            {needsCalendarFields && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="summary" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Event Title
                  </Label>
                  <Input
                    id="summary"
                    placeholder="Meeting with team"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start">Start Date/Time</Label>
                    <Input
                      id="start"
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end">End Date/Time</Label>
                    <Input
                      id="end"
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
            
            {/* No specific fields - show generic message */}
            {!needsEmailFields && !needsSmsFields && !needsCalendarFields && (
              <p className="text-sm text-muted-foreground text-center py-4">
                This workflow will execute with default parameters.
              </p>
            )}
            
            <Separator />
            
            {/* Dry Run Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TestTube2 className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="dryRun" className="cursor-pointer">
                  Dry Run (Test Mode)
                </Label>
              </div>
              <Switch
                id="dryRun"
                checked={dryRun}
                onCheckedChange={setDryRun}
              />
            </div>
            {dryRun && (
              <p className="text-xs text-muted-foreground">
                Dry run will simulate the workflow without making actual API calls.
              </p>
            )}
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button onClick={handleExecute} disabled={isExecuting}>
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  {dryRun ? "Test Run" : "Execute"}
                </>
              )}
            </Button>
          )}
          {result && !result.success && (
            <Button onClick={() => setResult(null)}>
              Try Again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
