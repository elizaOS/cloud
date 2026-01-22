"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ArrowLeft, Save, Loader2, Play, Pause, Plus, Terminal, ChevronUp, ChevronDown, Square, Clock, Sparkles, Send, X, MessageSquare } from "lucide-react";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/db/schemas";
import { updateWorkflow, runWorkflow, generateWorkflowWithAI } from "@/app/actions/workflows";
import type { ExecutionResult } from "@/lib/services/workflow-executor";
import { NodeConfigPanel } from "./node-config-panel";
import { ExecutionResultsPanel } from "./execution-results-panel";
import { CanvasContextMenu } from "./canvas-context-menu";
import { NodeContextMenu } from "./node-context-menu";
import { AddModuleDialog } from "./add-module-dialog";
import { TriggerNode } from "./nodes/trigger-node";
import { AgentNode } from "./nodes/agent-node";
import { ImageNode } from "./nodes/image-node";
import { OutputNode } from "./nodes/output-node";
import { DelayNode } from "./nodes/delay-node";
import { HttpNode } from "./nodes/http-node";
import { ConditionNode } from "./nodes/condition-node";
import { TtsNode } from "./nodes/tts-node";
import { DiscordNode } from "./nodes/discord-node";
import { McpNode } from "./nodes/mcp-node";
import { TwitterNode } from "./nodes/twitter-node";
import { TelegramNode } from "./nodes/telegram-node";
import { EmailNode } from "./nodes/email-node";
import { AppQueryNode } from "./nodes/app-query-node";
import { AddButtonNode } from "./nodes/add-button-node";
import type { WorkflowNodeType } from "@/db/schemas";

const ADD_BUTTON_NODE_ID = "__add-button__";

interface WorkflowEditorProps {
  workflow: Workflow;
}

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  image: ImageNode,
  output: OutputNode,
  delay: DelayNode,
  http: HttpNode,
  condition: ConditionNode,
  tts: TtsNode,
  discord: DiscordNode,
  mcp: McpNode,
  twitter: TwitterNode,
  telegram: TelegramNode,
  email: EmailNode,
  "app-query": AppQueryNode,
  addButton: AddButtonNode,
};

function toReactFlowNodes(nodes: WorkflowNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  }));
}

function toReactFlowEdges(edges: WorkflowEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: true,
  }));
}

function toDbNodes(nodes: Node[]): WorkflowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type as WorkflowNode["type"],
    position: node.position,
    data: node.data as Record<string, unknown>,
  }));
}

function toDbEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }));
}

function WorkflowCanvas({
  workflow,
  onSaveAndRun,
  isSaving,
  isRunning,
  onToggleActive,
  isTogglingActive,
  executionResult,
  onClearResult,
  hasUnsavedChanges,
  setHasUnsavedChanges,
}: {
  workflow: Workflow;
  onSaveAndRun: (name: string, nodes: Node[], edges: Edge[], runAfterSave: boolean) => void;
  isSaving: boolean;
  isRunning: boolean;
  onToggleActive: () => void;
  isTogglingActive: boolean;
  executionResult: ExecutionResult | null;
  onClearResult: () => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
}) {
  const router = useRouter();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addPosition, setAddPosition] = useState({ x: 100, y: 100 });
  const [showLogs, setShowLogs] = useState(false);
  const [showAiSidebar, setShowAiSidebar] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoApply, setAutoApply] = useState(true);
  const [aiMessages, setAiMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    workflow?: { nodes: Node[]; edges: Edge[] };
    description?: string;
    missingCredentials?: string[];
  }>>([]);
  const aiChatRef = useRef<HTMLDivElement>(null);

  // Handle AI workflow generation
  const handleGenerateWorkflow = async (prompt: string) => {
    if (!prompt.trim() || isGenerating) return;

    // Add user message
    setAiMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setAiPrompt("");
    setIsGenerating(true);

    // Scroll to bottom
    setTimeout(() => aiChatRef.current?.scrollTo({ top: aiChatRef.current.scrollHeight, behavior: "smooth" }), 100);

    try {
      // Get current nodes to provide context for modifications
      const currentNodes = nodes
        .filter((n) => n.id !== ADD_BUTTON_NODE_ID)
        .map((n) => ({ type: n.type ?? "unknown", data: (n.data ?? {}) as Record<string, unknown> }));
      
      const result = await generateWorkflowWithAI(prompt, currentNodes.length > 0 ? currentNodes : undefined);
      
      // Convert to Node[] with animated: true for edges
      const flowNodes: Node[] = result.workflow.nodes.map((n) => ({
        ...n,
        position: n.position,
      }));
      const flowEdges: Edge[] = result.workflow.edges.map((e) => ({
        ...e,
        animated: true,
      }));

      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.description,
          workflow: { nodes: flowNodes, edges: flowEdges },
          description: result.description,
          missingCredentials: result.missingCredentials,
        },
      ]);

      // Auto-apply the workflow if enabled
      if (autoApply) {
        setNodes(flowNodes);
        setEdges(flowEdges);
      }
    } catch (error) {
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
        },
      ]);
    } finally {
      setIsGenerating(false);
      setTimeout(() => aiChatRef.current?.scrollTo({ top: aiChatRef.current.scrollHeight, behavior: "smooth" }), 100);
    }
  };

  // Apply generated workflow to canvas
  const handleApplyWorkflow = (workflow: { nodes: Node[]; edges: Edge[] }) => {
    setNodes(workflow.nodes);
    setEdges(workflow.edges);
    setShowAiSidebar(false);
  };
  
  // Create the add button click handler
  const handleAddButtonClick = useCallback(() => {
    setAddPosition({ x: 400, y: 200 });
    setShowAddDialog(true);
  }, []);

  // Initialize nodes - always include a trigger node
  const getInitialNodes = useCallback((): Node[] => {
    const workflowNodes = toReactFlowNodes(workflow.nodes);
    
    // Check if there's already a trigger node
    const hasTrigger = workflowNodes.some((n) => n.type === "trigger");
    
    if (workflowNodes.length === 0) {
      // Empty workflow: show trigger node + add button
      return [
        {
          id: "trigger-default",
          type: "trigger",
          position: { x: 400, y: 100 },
          data: { label: "Trigger", triggerType: "manual" },
        },
        {
          id: ADD_BUTTON_NODE_ID,
          type: "addButton",
          position: { x: 400, y: 250 },
          data: { onClick: handleAddButtonClick },
          draggable: false,
          selectable: false,
        },
      ];
    }
    
    // If workflow has nodes but no trigger, prepend one
    if (!hasTrigger) {
      return [
        {
          id: "trigger-default",
          type: "trigger",
          position: { x: 400, y: 50 },
          data: { label: "Trigger", triggerType: "manual" },
        },
        ...workflowNodes,
      ];
    }
    
    return workflowNodes;
  }, [workflow.nodes, handleAddButtonClick]);

  const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toReactFlowEdges(workflow.edges),
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [deletingEdgeId, setDeletingEdgeId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState(workflow.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [selectedNodePosition, setSelectedNodePosition] = useState<{ x: number; y: number } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Update add button callback when showAddDialog changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === ADD_BUTTON_NODE_ID
          ? { ...node, data: { onClick: handleAddButtonClick } }
          : node
      )
    );
  }, [handleAddButtonClick, setNodes]);

  useEffect(() => {
    // Filter out add button node when checking for changes
    const realNodes = nodes.filter((n) => n.id !== ADD_BUTTON_NODE_ID);
    const hasChanges =
      workflowName !== workflow.name ||
      JSON.stringify(toDbNodes(realNodes)) !== JSON.stringify(workflow.nodes) ||
      JSON.stringify(toDbEdges(edges)) !== JSON.stringify(workflow.edges);
    setHasUnsavedChanges(hasChanges);
  }, [nodes, edges, workflowName, workflow, setHasUnsavedChanges]);

  // Show logs automatically when there's a result
  useEffect(() => {
    if (executionResult) {
      setShowLogs(true);
    }
  }, [executionResult]);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
      // Calculate screen position for floating config panel
      const nodeElement = (event.target as HTMLElement).closest('.react-flow__node');
      if (nodeElement) {
        const rect = nodeElement.getBoundingClientRect();
        setSelectedNodePosition({
          x: rect.right + 12,
          y: rect.top,
        });
      }
    },
    [],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedNodePosition(null);
    setSelectedEdgeId(null);
  }, []);

  // Handle edge click - delete edge with fade animation
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setDeletingEdgeId(edge.id);
      setSelectedEdgeId(null);
      // Wait for fade animation to complete before removing
      setTimeout(() => {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        setDeletingEdgeId(null);
      }, 150);
    },
    [setEdges],
  );

  // Handle keyboard events for deleting selected edge
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedEdgeId) {
        setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
        setSelectedEdgeId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEdgeId, setEdges]);

  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node,
        ),
      );
    },
    [setNodes],
  );

  const handleSave = () => {
    onSaveAndRun(workflowName, nodes, edges, false);
  };

  const handleRun = () => {
    onSaveAndRun(workflowName, nodes, edges, true);
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to leave?",
      );
      if (!confirmed) return;
    }
    router.push("/dashboard/workflows");
  };

  const handleNameClick = () => {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (!workflowName.trim()) {
      setWorkflowName("New scenario");
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setIsEditingName(false);
      if (!workflowName.trim()) {
        setWorkflowName("New scenario");
      }
    }
    if (e.key === "Escape") {
      setIsEditingName(false);
      setWorkflowName(workflow.name);
    }
  };

  const realNodesCount = nodes.filter((n) => n.id !== ADD_BUTTON_NODE_ID).length;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Full screen canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges.map((edge) => ({
          ...edge,
          style: deletingEdgeId === edge.id
            ? { stroke: "#FF5800", strokeWidth: 3, opacity: 0, transition: "opacity 150ms ease-out" }
            : selectedEdgeId === edge.id
              ? { stroke: "#FF5800", strokeWidth: 3 }
              : { transition: "opacity 150ms ease-out" },
        }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        deleteKeyCode={["Backspace", "Delete"]}
        onPaneClick={(e) => {
          handlePaneClick();
          setContextMenu(null);
          setNodeContextMenu(null);
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          setNodeContextMenu(null);
          const reactFlowBounds = (e.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect();
          if (reactFlowBounds) {
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              flowX: e.clientX - reactFlowBounds.left,
              flowY: e.clientY - reactFlowBounds.top,
            });
          }
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          setContextMenu(null);
          setNodeContextMenu({
            x: e.clientX,
            y: e.clientY,
            nodeId: node.id,
          });
        }}
        nodeTypes={nodeTypes}
        fitView
        className="bg-[#0A0A0A]"
        proOptions={{ hideAttribution: true }}
      >
        <Controls className="!bg-white/10 !border-white/20 [&>button]:!bg-white/10 [&>button]:!border-white/20 [&>button]:!text-white [&>button:hover]:!bg-white/20" />
        <MiniMap
          className="!bg-white/5 !border-white/10"
          nodeColor="#FF5800"
          maskColor="rgba(0, 0, 0, 0.8)"
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255, 255, 255, 0.1)"
        />
      </ReactFlow>

      {/* Top left - Back button and name */}
      <div className="absolute top-4 left-4 flex items-center gap-3 z-50">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleBack();
          }}
          className="flex items-center justify-center w-10 h-10 bg-neutral-900/90 backdrop-blur-sm border border-white/10 hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-neutral-400" />
        </button>

        <div className="flex items-center gap-2 bg-neutral-900/90 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-2">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              className="text-sm font-medium text-white bg-transparent border-none outline-none w-40"
            />
          ) : (
            <button
              onClick={handleNameClick}
              className="text-sm font-medium text-white hover:text-neutral-300 transition-colors"
            >
              {workflowName}
            </button>
          )}
          {hasUnsavedChanges && (
            <span className="w-2 h-2 rounded-full bg-[#FF5800]" title="Unsaved changes" />
          )}
        </div>

      </div>

      {/* Bottom floating toolbar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-2 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-2xl px-3 py-2 shadow-2xl">
          {/* Add button */}
          <button
            onClick={() => {
              setAddPosition({ x: 400, y: 200 });
              setShowAddDialog(true);
            }}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#FF5800] hover:bg-[#FF5800]/90 transition-colors"
            title="Add module"
          >
            <Plus className="w-5 h-5 text-black" strokeWidth={2.5} />
          </button>

          <div className="w-px h-8 bg-white/10" />

          {/* STOP button for scheduled workflows - prominent red button */}
          {workflow.trigger_config.type === "schedule" && workflow.status === "active" && (
            <>
              <button
                onClick={onToggleActive}
                disabled={isTogglingActive}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
                title="Stop scheduled workflow"
              >
                {isTogglingActive ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Square className="w-5 h-5 text-white" fill="white" />
                )}
                <span className="text-sm font-medium text-white">Stop</span>
              </button>
              <div className="w-px h-8 bg-white/10" />
            </>
          )}

          {/* Resume button for paused scheduled workflows */}
          {workflow.trigger_config.type === "schedule" && workflow.status !== "active" && (
            <>
              <button
                onClick={() => {
                  onToggleActive();
                  setShowLogs(true);
                }}
                disabled={isTogglingActive}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 transition-colors"
                title="Resume scheduled workflow"
              >
                {isTogglingActive ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Play className="w-5 h-5 text-white" fill="white" />
                )}
                <span className="text-sm font-medium text-white">Resume</span>
              </button>
              <div className="w-px h-8 bg-white/10" />
            </>
          )}

          {/* Play button (for manual run) */}
          <button
            onClick={handleRun}
            disabled={isRunning || isSaving || realNodesCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Run workflow once"
          >
            {isRunning ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Play className="w-5 h-5 text-white" fill="white" />
            )}
            <span className="text-sm font-medium text-white">{isRunning ? "Running..." : "Run Once"}</span>
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Save workflow"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Save className="w-5 h-5 text-white" />
            )}
            <span className="text-sm font-medium text-white">{isSaving ? "Saving..." : "Save"}</span>
          </button>

          <div className="w-px h-8 bg-white/10" />

          {/* Logs toggle button */}
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${
              showLogs ? "bg-white/20 text-white" : "bg-white/5 hover:bg-white/10 text-white/60"
            }`}
            title={showLogs ? "Hide logs" : "Show logs"}
          >
            <Terminal className="w-5 h-5" />
            {showLogs ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>

          {/* AI Builder toggle button */}
          <button
            onClick={() => setShowAiSidebar(!showAiSidebar)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${
              showAiSidebar ? "bg-[#FF5800]/20 text-[#FF5800]" : "bg-white/5 hover:bg-white/10 text-white/60"
            }`}
            title={showAiSidebar ? "Hide AI builder" : "AI workflow builder"}
          >
            <Sparkles className="w-5 h-5" />
          </button>
        </div>

        {/* Schedule info bar - shows when workflow has a schedule */}
        {workflow.trigger_config.type === "schedule" && workflow.trigger_config.schedule && (
          <div className="mt-2 flex items-center justify-center gap-3 text-xs text-white/50">
            <div className="flex items-center gap-1.5 bg-neutral-900/80 backdrop-blur-sm border border-white/5 rounded-lg px-3 py-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Schedule: {workflow.trigger_config.schedule}</span>
            </div>
            <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${
              workflow.status === "active" 
                ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
            }`}>
              {workflow.status === "active" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span>Running on schedule</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Paused</span>
                </>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Canvas Context Menu */}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAddModule={() => {
            setAddPosition({ x: contextMenu.flowX, y: contextMenu.flowY });
            setShowAddDialog(true);
          }}
        />
      )}

      {/* Node Context Menu */}
      {nodeContextMenu && (
        <NodeContextMenu
          x={nodeContextMenu.x}
          y={nodeContextMenu.y}
          nodeId={nodeContextMenu.nodeId}
          onClose={() => setNodeContextMenu(null)}
          onSettings={() => {
            const node = nodes.find((n) => n.id === nodeContextMenu.nodeId);
            if (node) {
              setSelectedNode(node);
              // Calculate position for the floating panel based on context menu position
              setSelectedNodePosition({
                x: nodeContextMenu.x + 12,
                y: nodeContextMenu.y,
              });
            }
          }}
          onDelete={() => {
            setNodes((nds) => nds.filter((n) => n.id !== nodeContextMenu.nodeId));
            setEdges((eds) => eds.filter(
              (e) => e.source !== nodeContextMenu.nodeId && e.target !== nodeContextMenu.nodeId
            ));
            if (selectedNode?.id === nodeContextMenu.nodeId) {
              setSelectedNode(null);
            }
          }}
        />
      )}

      {/* Add Module Dialog */}
      <AddModuleDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddNode={(type: WorkflowNodeType, initialData?: Record<string, unknown>) => {
          const label = initialData?.label ?? type.charAt(0).toUpperCase() + type.slice(1);
          const newNode: Node = {
            id: `${type}-${Date.now()}`,
            type,
            position: addPosition,
            data: { ...initialData, label },
          };
          // Remove add button and add the new node
          setNodes((nds) => [...nds.filter((n) => n.id !== ADD_BUTTON_NODE_ID), newNode]);
        }}
      />

      <NodeConfigPanel
        node={selectedNode}
        onUpdate={handleUpdateNodeData}
        onClose={() => {
          setSelectedNode(null);
          setSelectedNodePosition(null);
        }}
        workflowId={workflow.id}
        position={selectedNodePosition}
      />

      {/* Logs panel - slides up from bottom */}
      {showLogs && (
        <ExecutionResultsPanel
          result={executionResult}
          isRunning={isRunning}
          onClose={() => {
            setShowLogs(false);
            onClearResult();
          }}
          workflowId={workflow.id}
          isScheduleActive={workflow.trigger_config.type === "schedule" && workflow.status === "active"}
        />
      )}

      {/* AI Builder Sidebar - slides in from right */}
      <div
        className={`absolute top-0 right-0 h-full w-[400px] bg-neutral-900/95 backdrop-blur-xl border-l border-white/10 z-50 transform transition-transform duration-300 ease-out ${
          showAiSidebar ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#FF5800]/10">
                <Sparkles className="w-4 h-4 text-[#FF5800]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">AI Workflow Builder</h3>
                <p className="text-xs text-white/50">Describe what you want to automate</p>
              </div>
            </div>
            <button
              onClick={() => setShowAiSidebar(false)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>

          {/* Chat Messages Area */}
          <div ref={aiChatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Welcome message - only show if no messages */}
            {aiMessages.length === 0 && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#FF5800]/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-[#FF5800]" />
                </div>
                <div className="flex-1 bg-white/5 rounded-2xl rounded-tl-md px-4 py-3">
                  <p className="text-sm text-white/80">
                    Hi! I can help you build workflows. Describe what you want to automate and I&apos;ll create it for you.
                  </p>
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-white/40">Try something like:</p>
                    <div className="space-y-1.5">
                      <button 
                        onClick={() => handleGenerateWorkflow("Every morning at 9am, get BTC price and post it to Telegram")}
                        className="w-full text-left text-xs text-white/60 hover:text-white/80 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition-colors"
                      >
                        &quot;Every morning, get BTC price and post it to Telegram&quot;
                      </button>
                      <button 
                        onClick={() => handleGenerateWorkflow("When triggered, generate an image of a cosmic landscape and save it to gallery")}
                        className="w-full text-left text-xs text-white/60 hover:text-white/80 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition-colors"
                      >
                        &quot;When triggered, generate an image and save to gallery&quot;
                      </button>
                      <button 
                        onClick={() => handleGenerateWorkflow("Have my agent analyze the current weather in New York and send the analysis to Discord")}
                        className="w-full text-left text-xs text-white/60 hover:text-white/80 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition-colors"
                      >
                        &quot;Have my agent analyze the weather and send to Discord&quot;
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chat messages */}
            {aiMessages.map((message, index) => (
              <div key={index} className="flex gap-3">
                {message.role === "user" ? (
                  <>
                    <div className="flex-1" />
                    <div className="max-w-[85%] bg-[#FF5800]/20 text-white rounded-2xl rounded-tr-md px-4 py-3">
                      <p className="text-sm">{message.content}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#FF5800]/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[#FF5800]" />
                    </div>
                    <div className="flex-1 bg-white/5 rounded-2xl rounded-tl-md px-4 py-3">
                      <p className="text-sm text-white/80">{message.content}</p>
                      
                      {/* Show workflow info */}
                      {message.workflow && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-2 text-xs text-green-400">
                            <span className="w-2 h-2 rounded-full bg-green-400" />
                            <span>✓ Applied {message.workflow.nodes.length} nodes to canvas</span>
                          </div>
                          
                          {/* Missing credentials warning */}
                          {message.missingCredentials && message.missingCredentials.length > 0 && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                              <p className="text-xs text-yellow-400">
                                ⚠️ You&apos;ll need to configure: {message.missingCredentials.join(", ")}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isGenerating && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#FF5800]/10 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-[#FF5800] animate-spin" />
                </div>
                <div className="flex-1 bg-white/5 rounded-2xl rounded-tl-md px-4 py-3">
                  <p className="text-sm text-white/50">Building your workflow...</p>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-white/10">
            <div className="relative">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerateWorkflow(aiPrompt);
                  }
                }}
                placeholder="Describe your workflow..."
                rows={3}
                disabled={isGenerating}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 pr-12 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FF5800]/50 focus:ring-1 focus:ring-[#FF5800]/20 transition-all resize-none disabled:opacity-50"
              />
              <button
                onClick={() => handleGenerateWorkflow(aiPrompt)}
                disabled={!aiPrompt.trim() || isGenerating}
                className="absolute right-3 bottom-3 flex items-center justify-center w-8 h-8 rounded-xl bg-[#FF5800] hover:bg-[#FF5800]/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 text-black animate-spin" />
                ) : (
                  <Send className="w-4 h-4 text-black" />
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-white/30 text-center">
              Press Enter to send • Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowEditor({ workflow: initialWorkflow }: WorkflowEditorProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  
  // Track workflow status locally for optimistic UI updates
  const [workflowStatus, setWorkflowStatus] = useState(initialWorkflow.status);
  
  // Update local status when prop changes (e.g., after navigation)
  useEffect(() => {
    setWorkflowStatus(initialWorkflow.status);
  }, [initialWorkflow.status]);

  // Create a merged workflow object with local status
  const workflow = { ...initialWorkflow, status: workflowStatus };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleToggleActive = async () => {
    // Prevent double-clicks
    if (isTogglingActive) return;
    
    const newStatus = workflowStatus === "active" ? "paused" : "active";
    
    // Optimistic update - update UI immediately
    setWorkflowStatus(newStatus);
    setIsTogglingActive(true);
    
    // Update database (fire and forget for speed, errors will show on next load)
    updateWorkflow(initialWorkflow.id, { status: newStatus })
      .catch(console.error)
      .finally(() => setIsTogglingActive(false));
  };

  // Combined save and run handler - always saves before running
  const handleSaveAndRun = async (name: string, nodes: Node[], edges: Edge[], runAfterSave: boolean) => {
    setIsSaving(true);
    if (runAfterSave) {
      setIsRunning(true);
      setExecutionResult(null);
    }

    // Filter out add button node before saving
    const realNodes = nodes.filter((n) => n.id !== ADD_BUTTON_NODE_ID);

    // Extract trigger config from trigger node
    const triggerNode = realNodes.find((n) => n.type === "trigger");
    const triggerData = triggerNode?.data as Record<string, unknown> | undefined;
    const triggerType = (triggerData?.triggerType as "manual" | "webhook" | "schedule") ?? "manual";
    const schedule = triggerData?.schedule as string | undefined;
    const webhookSecret = triggerData?.webhookSecret as string | undefined;

    const triggerConfig = {
      type: triggerType,
      schedule,
      webhookSecret,
    };

    // Determine workflow status
    const hasNodes = realNodes.length > 0;
    let newStatus = workflowStatus;
    if (!hasNodes) {
      newStatus = "draft";
    } else if (workflowStatus === "draft") {
      newStatus = "active";
    }
    setWorkflowStatus(newStatus);

    // Save with timeout to prevent infinite spinner
    const savePromise = updateWorkflow(initialWorkflow.id, {
      name,
      nodes: toDbNodes(realNodes),
      edges: toDbEdges(edges),
      trigger_config: triggerConfig,
      status: newStatus,
    });

    // 10 second timeout for save operation
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Save timed out")), 10000)
    );

    try {
      await Promise.race([savePromise, timeoutPromise]);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Save error:", error);
      // Still mark as saved locally even if DB save failed - user can try again
    } finally {
      setIsSaving(false);
    }

    // Run the workflow after saving if requested
    if (runAfterSave) {
      try {
        const result = await runWorkflow(workflow.id);
        setExecutionResult(result);
      } catch (error) {
        console.error("Run error:", error);
        setExecutionResult({
          success: false,
          workflowId: workflow.id,
          outputs: {},
          logs: [],
          totalDurationMs: 0,
          creditsCharged: 0,
          error: error instanceof Error ? error.message : "Failed to run workflow",
        });
      } finally {
        setIsRunning(false);
      }
    }
  };

  return (
    <ReactFlowProvider>
      <WorkflowCanvas
        workflow={workflow}
        onSaveAndRun={handleSaveAndRun}
        isSaving={isSaving}
        isRunning={isRunning}
        onToggleActive={handleToggleActive}
        isTogglingActive={isTogglingActive}
        executionResult={executionResult}
        onClearResult={() => setExecutionResult(null)}
        hasUnsavedChanges={hasUnsavedChanges}
        setHasUnsavedChanges={setHasUnsavedChanges}
      />
    </ReactFlowProvider>
  );
}
