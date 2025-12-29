"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Loader2, Workflow, Sparkles, Search, Construction } from "lucide-react";
import { BrandButton, BrandCard, CornerBrackets } from "@/components/brand";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkflowGenerator,
  WorkflowList,
  WorkflowViewer,
  WorkflowTester,
} from "@/components/workflows";
import { EndpointDiscovery } from "@/components/workflows/endpoint-discovery";
import Link from "next/link";

const COMING_SOON = true;

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
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<SelectedWorkflow | null>(null);
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
          <p className="text-white/60 mb-4">
            Please log in to access workflows
          </p>
          <BrandButton
            variant="primary"
            onClick={() => (window.location.href = "/login")}
          >
            Log In
          </BrandButton>
        </div>
      </div>
    );
  }

  if (COMING_SOON) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <BrandCard className="relative overflow-hidden">
          <CornerBrackets size="md" className="opacity-30" />
          <div className="relative z-10 flex flex-col items-center justify-center py-16 px-8 text-center space-y-6">
            <div className="p-4 rounded-full bg-[#FF5800]/20 border border-[#FF5800]/40">
              <Construction className="h-12 w-12 text-[#FF5800]" />
            </div>
            <div className="space-y-3">
              <h1
                className="text-3xl md:text-4xl font-normal text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                Workflows
              </h1>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20">
                <span
                  className="text-sm font-medium uppercase tracking-wider text-white/60"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  Coming Soon
                </span>
              </div>
            </div>
            <p className="text-white/60 max-w-md text-sm md:text-base">
              AI-powered n8n workflow generation and management is currently under
              development. Check back soon for automated workflow creation and testing.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Link href="/dashboard">
                <BrandButton variant="primary">
                  <Workflow className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </BrandButton>
              </Link>
            </div>
          </div>
        </BrandCard>
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
          <TabsTrigger
            value="discover"
            className="data-[state=active]:bg-[#FF5800] flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            Discover
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

        <TabsContent value="discover" className="mt-6">
          <EndpointDiscovery />
        </TabsContent>
      </Tabs>
    </div>
  );
}
