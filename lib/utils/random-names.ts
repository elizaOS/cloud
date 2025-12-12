/**
 * Random Name Generator for Apps, Services, Workflows, and Projects
 * 
 * Generates friendly, memorable names using adjective + animal combinations.
 */

const ADJECTIVES = [
  "swift", "cosmic", "bright", "nimble", "stellar", "vibrant", "elegant",
  "radiant", "dynamic", "agile", "clever", "mystic", "vivid", "bold",
  "sleek", "electric", "golden", "silver", "crystal", "azure", "coral",
  "lunar", "solar", "arctic", "tropical", "alpine", "velvet", "amber",
  "crimson", "sapphire", "emerald", "jade", "onyx", "ruby", "diamond",
  "quantum", "cyber", "hyper", "mega", "ultra", "turbo", "super", "prime",
  "blazing", "glowing", "shining", "sparkling", "floating", "flying",
  "dancing", "spinning", "bouncing", "zooming", "racing", "soaring",
] as const;

const ANIMALS = [
  "falcon", "phoenix", "dragon", "tiger", "panther", "wolf", "hawk",
  "eagle", "owl", "fox", "bear", "lynx", "jaguar", "lion", "leopard",
  "raven", "crow", "swan", "crane", "heron", "dolphin", "orca", "shark",
  "whale", "octopus", "squid", "mantis", "spider", "scorpion", "beetle",
  "butterfly", "dragonfly", "firefly", "hummingbird", "penguin", "seal",
  "otter", "beaver", "rabbit", "deer", "elk", "moose", "gazelle", "cheetah",
  "puma", "cobra", "viper", "python", "gecko", "chameleon", "iguana",
] as const;

const NOUNS = [
  "spark", "wave", "pulse", "beam", "flux", "core", "node", "link",
  "stream", "flow", "bridge", "gate", "port", "hub", "nexus", "vertex",
  "point", "edge", "loop", "mesh", "grid", "cloud", "storm", "blaze",
  "frost", "glow", "drift", "surge", "rush", "burst", "flash", "bolt",
] as const;

/**
 * Generate a random adjective + animal name (e.g., "cosmic-falcon")
 */
export function generateRandomName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adjective}-${animal}`;
}

/**
 * Generate a random name with a suffix number for uniqueness
 */
export function generateRandomNameWithSuffix(): string {
  const base = generateRandomName();
  const suffix = Math.floor(Math.random() * 1000);
  return `${base}-${suffix}`;
}

/**
 * Generate a display-friendly name (Title Case, no hyphens)
 */
export function generateDisplayName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${capitalize(adjective)} ${capitalize(animal)}`;
}

/**
 * Generate a workflow-style name (e.g., "cosmic-flux")
 */
export function generateWorkflowName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective}-${noun}`;
}

/**
 * Generate a service-style name (e.g., "stellar-api")
 */
export function generateServiceName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const suffixes = ["api", "service", "hub", "connect", "sync", "flow", "bridge"];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${adjective}-${suffix}`;
}

export type EntityType = "app" | "agent" | "workflow" | "service" | "miniapp";

/**
 * Generate an appropriate name for the given entity type
 */
export function generateNameForType(type: EntityType): string {
  switch (type) {
    case "app":
    case "miniapp":
      return generateDisplayName();
    case "agent":
      return generateDisplayName();
    case "workflow":
      return generateWorkflowName();
    case "service":
      return generateServiceName();
    default:
      return generateRandomName();
  }
}
