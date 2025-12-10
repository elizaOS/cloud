"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Loader2, Workflow, Sparkles } from "lucide-react";
import { BrandButton } from "@/components/brand";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkflowGenerator,
  WorkflowList,
  WorkflowViewer,
  WorkflowTester,
} from "@/components/workflows";

type View = "list" | "view" | "test";

interface SelectedWorkflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  tags: string[];
  workflowData?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export default function WorkflowsPage() {
  const { ready, authenticated } = usePrivy();
  const [activeTab, setActiveTab] = useState("workflows");
  const [view, setView] = useState<View>("list");
  const [selectedWorkflow, setSelectedWorkflow] = useState<SelectedWorkflow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!ready) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <p className="text-white/60 mb-4">Please log in to access workflows</p>
          <BrandButton variant="primary" onClick={() => window.location.href = "/login"}>
            Log In
          </BrandButton>
        </div>
      </div>
    );
  }

  function handleWorkflowGenerated() {
    setRefreshKey((k) => k + 1);
    setActiveTab("workflows");
  }

  function handleSelectWorkflow(workflow: SelectedWorkflow) {
    setSelectedWorkflow(workflow);
    setView("view");
  }

  function handleTestWorkflow(workflow: SelectedWorkflow) {
    setSelectedWorkflow(workflow);
    setView("test");
  }

  function handleBackToList() {
    setSelectedWorkflow(null);
    setView("list");
  }

  // Show workflow viewer
  if (view === "view" && selectedWorkflow) {
    return (
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-6">
        <WorkflowViewer
          workflowId={selectedWorkflow.id}
          onBack={handleBackToList}
          onTest={handleTestWorkflow}
        />
      </div>
    );
  }

  // Show workflow tester
  if (view === "test" && selectedWorkflow) {
    return (
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-6">
        <WorkflowTester workflow={selectedWorkflow} onBack={handleBackToList} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: "#FF5800" }}
            />
            <h1
              className="text-2xl sm:text-3xl md:text-4xl font-normal tracking-tight text-white truncate"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Workflows
            </h1>
          </div>
          <p className="text-sm sm:text-base text-white/60 mt-2">
            Create, manage, and test AI-powered n8n workflows
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger
            value="generate"
            className="data-[state=active]:bg-[#FF5800] flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Generate
          </TabsTrigger>
          <TabsTrigger
            value="workflows"
            className="data-[state=active]:bg-[#FF5800] flex items-center gap-2"
          >
            <Workflow className="h-4 w-4" />
            My Workflows
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-6">
          <WorkflowGenerator onWorkflowGenerated={handleWorkflowGenerated} />
        </TabsContent>

        <TabsContent value="workflows" className="mt-6">
          <WorkflowList
            key={refreshKey}
            onSelect={handleSelectWorkflow}
            onTest={handleTestWorkflow}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

