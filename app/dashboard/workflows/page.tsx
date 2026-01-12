import { listWorkflows } from "@/app/actions/workflows";
import { WorkflowsList } from "@/components/workflows/workflows-list";

export default async function WorkflowsPage() {
  const workflows = await listWorkflows();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflows</h1>
          <p className="text-white/60 text-sm mt-1">
            Build automated pipelines connecting agents, images, and more
          </p>
        </div>
      </div>
      <div className="flex-1 p-6">
        <WorkflowsList workflows={workflows} />
      </div>
    </div>
  );
}
