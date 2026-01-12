"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { ArrowLeft, Save, Loader2, Play } from "lucide-react";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/db/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateWorkflow } from "@/app/actions/workflows";
import { WorkflowNodePalette } from "./workflow-node-palette";
import { TriggerNode } from "./nodes/trigger-node";
import { AgentNode } from "./nodes/agent-node";
import { ImageNode } from "./nodes/image-node";
import { OutputNode } from "./nodes/output-node";
import type { WorkflowNodeType } from "@/db/schemas";

interface WorkflowEditorProps {
  workflow: Workflow;
}

// Register custom node types
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  image: ImageNode,
  output: OutputNode,
};

// Convert DB nodes to React Flow format
function toReactFlowNodes(nodes: WorkflowNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  }));
}

// Convert DB edges to React Flow format
function toReactFlowEdges(edges: WorkflowEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: true,
  }));
}

// Convert React Flow nodes back to DB format
function toDbNodes(nodes: Node[]): WorkflowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type as WorkflowNode["type"],
    position: node.position,
    data: node.data as Record<string, unknown>,
  }));
}

// Convert React Flow edges back to DB format
function toDbEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }));
}

function WorkflowCanvas({
  workflow,
  onSave,
  isSaving,
  onRun,
  isRunning,
}: {
  workflow: Workflow;
  onSave: (nodes: Node[], edges: Edge[]) => void;
  isSaving: boolean;
  onRun: () => void;
  isRunning: boolean;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    toReactFlowNodes(workflow.nodes),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toReactFlowEdges(workflow.edges),
  );
  const [workflowName, setWorkflowName] = useState(workflow.name);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  const handleSave = () => {
    onSave(nodes, edges);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/50">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/workflows"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white/60" />
          </Link>
          <Input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-lg font-semibold bg-transparent border-none focus:ring-0 w-64"
            placeholder="Workflow name"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onRun}
            disabled={isRunning || nodes.length === 0}
            className="gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Workflow
              </>
            )}
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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

        {/* Node Palette */}
        <WorkflowNodePalette
          onAddNode={(type: WorkflowNodeType) => {
            const newNode: Node = {
              id: `${type}-${Date.now()}`,
              type,
              position: { x: 100, y: 100 + nodes.length * 100 },
              data: { label: type.charAt(0).toUpperCase() + type.slice(1) },
            };
            setNodes((nds) => [...nds, newNode]);
          }}
        />
      </div>
    </div>
  );
}

export function WorkflowEditor({ workflow }: WorkflowEditorProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const handleSave = async (nodes: Node[], edges: Edge[]) => {
    setIsSaving(true);

    await updateWorkflow(workflow.id, {
      nodes: toDbNodes(nodes),
      edges: toDbEdges(edges),
    });

    setIsSaving(false);
    router.refresh();
  };

  const handleRun = async () => {
    setIsRunning(true);
    // TODO: Implement workflow execution
    // For now, just simulate a delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsRunning(false);
    alert("Workflow execution not yet implemented!");
  };

  return (
    <ReactFlowProvider>
      <WorkflowCanvas
        workflow={workflow}
        onSave={handleSave}
        isSaving={isSaving}
        onRun={handleRun}
        isRunning={isRunning}
      />
    </ReactFlowProvider>
  );
}
