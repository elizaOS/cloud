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

import { ArrowLeft, Save, Loader2, Play, Pause, Power, Plus, Terminal, ChevronUp, ChevronDown } from "lucide-react";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/db/schemas";
import { updateWorkflow, runWorkflow } from "@/app/actions/workflows";
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

  // Handle edge click - select or delete edge
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      // If edge is already selected, delete it; otherwise select it
      if (selectedEdgeId === edge.id) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        setSelectedEdgeId(null);
      } else {
        setSelectedEdgeId(edge.id);
      }
    },
    [selectedEdgeId, setEdges],
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
          style: selectedEdgeId === edge.id
            ? { stroke: "#FF5800", strokeWidth: 3 }
            : undefined,
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

        {/* Status indicator for scheduled/webhook workflows */}
        {(workflow.trigger_config.type === "schedule" || workflow.trigger_config.type === "webhook") && (
          <button
            onClick={onToggleActive}
            disabled={isTogglingActive}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm border transition-colors ${
              workflow.status === "active"
                ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20"
            }`}
          >
            {isTogglingActive ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : workflow.status === "active" ? (
              <Power className="w-4 h-4" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">{workflow.status === "active" ? "Active" : "Paused"}</span>
          </button>
        )}
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

          {/* Play button */}
          <button
            onClick={handleRun}
            disabled={isRunning || isSaving || realNodesCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Run workflow"
          >
            {isRunning ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Play className="w-5 h-5 text-white" fill="white" />
            )}
            <span className="text-sm font-medium text-white">{isRunning ? "Running..." : "Run"}</span>
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

          {/* Logs toggle */}
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
        </div>
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
        />
      )}
    </div>
  );
}

export function WorkflowEditor({ workflow }: WorkflowEditorProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

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
    setIsTogglingActive(true);
    const newStatus = workflow.status === "active" ? "paused" : "active";
    await updateWorkflow(workflow.id, { status: newStatus });
    setIsTogglingActive(false);
    router.refresh();
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

    // Determine workflow status:
    // - "active" if workflow has nodes (ready to run)
    // - "draft" if workflow is empty
    const hasNodes = realNodes.length > 0;
    const newStatus = hasNodes ? "active" : "draft";

    await updateWorkflow(workflow.id, {
      name,
      nodes: toDbNodes(realNodes),
      edges: toDbEdges(edges),
      trigger_config: triggerConfig,
      status: newStatus,
    });

    setIsSaving(false);
    setHasUnsavedChanges(false);

    // Run the workflow after saving if requested
    if (runAfterSave) {
      const result = await runWorkflow(workflow.id);
      setExecutionResult(result);
      setIsRunning(false);
    }

    router.refresh();
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
