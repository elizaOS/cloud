export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome to the ElizaOS Platform
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="font-semibold">Quick Start</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Get started with your first AI agent
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="font-semibold">API Keys</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your API keys and credentials
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="font-semibold">Documentation</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Learn about the platform features
          </p>
        </div>
      </div>
    </div>
  );
}

