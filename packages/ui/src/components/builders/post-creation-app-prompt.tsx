"use client";

export type EntityType = "agent" | "workflow" | "service";

interface PostCreationAppPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  onSkip?: () => void;
}

export function PostCreationAppPrompt(_props: PostCreationAppPromptProps) {
  return null;

  /* App creation disabled - original component body commented out below:
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const config = ENTITY_CONFIG[entityType];
  const Icon = config.icon;

  const handleCreateApp = () => {
    setIsNavigating(true);
    const params = new URLSearchParams({
      source: entityType,
      sourceId: entityId,
      sourceName: entityName,
    });
    router.push(`/dashboard/apps/create?${params.toString()}`);
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSkip?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border border-white/10 max-w-md">
        <button
          onClick={handleSkip}
          className="absolute right-4 top-4 p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X className="h-4 w-4 text-white/60" />
        </button>

        <DialogHeader className="space-y-4">
          <div className="flex justify-center">
            <div
              className="p-4 rounded-lg border"
              style={{
                backgroundColor: `${config.color}15`,
                borderColor: `${config.color}40`,
              }}
            >
              <Icon className="h-8 w-8" style={{ color: config.color }} />
            </div>
          </div>

          <DialogTitle
            className="text-xl font-normal text-center text-white"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            {config.label} Created Successfully!
          </DialogTitle>

          <DialogDescription className="text-center text-white/60">
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-lg">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded border"
              style={{
                backgroundColor: `${config.color}15`,
                borderColor: `${config.color}30`,
              }}
            >
              <Icon className="h-4 w-4" style={{ color: config.color }} />
            </div>
            <div>
              <p
                className="text-sm font-medium text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                {entityName}
              </p>
              <p className="text-xs text-white/50">{config.label}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <Grid3x3 className="h-5 w-5 text-cyan-400 mt-0.5 flex-shrink-0" />
            <div>
              <p
                className="text-sm font-medium text-cyan-300"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                Create an App
              </p>
              <p className="text-xs text-white/60 mt-1">
                {config.appSuggestion}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <BrandButton
            variant="primary"
            className="w-full justify-center"
            onClick={handleCreateApp}
            disabled={isNavigating}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Create App with {entityName}
            <ArrowRight className="h-4 w-4 ml-2" />
          </BrandButton>

          <button
            onClick={handleSkip}
            className="text-sm text-white/50 hover:text-white/70 transition-colors py-2"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            Skip for now
          </button>
        </div>

        <p className="text-xs text-white/40 text-center mt-4">
          You can always create an app later from the Apps section
        </p>
      </DialogContent>
    </Dialog>
  );
  */
}
