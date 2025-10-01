import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Containers",
  description: "Deploy and manage containerized AI applications with our infrastructure platform",
  keywords: ["containers", "deployment", "docker", "kubernetes", "infrastructure"],
};

export default function ContainersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">Containers</h1>
        <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          NEW
        </span>
      </div>
      <p className="text-muted-foreground -mt-4">
        Deploy and manage your containerized applications
      </p>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Container Management</h2>
        <p className="text-muted-foreground">
          Container deployment interface coming soon...
        </p>
      </div>
    </div>
  );
}

