import { notFound } from "next/navigation";
import { getWorkflow } from "@/app/actions/workflows";
import { WorkflowEditor } from "@/components/workflows/workflow-editor";

interface WorkflowEditorPageProps {
  params: Promise<{
    workflowId: string;
  }>;
}

export default async function WorkflowEditorPage({
  params,
}: WorkflowEditorPageProps) {
  const { workflowId } = await params;

  const workflow = await getWorkflow(workflowId).catch(() => null);

  if (!workflow) {
    notFound();
  }

  return <WorkflowEditor workflow={workflow} />;
}
