export type TaskType = "daily" | "one-off" | "aspirational";
export type TaskPriority = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  name: string;
  type: TaskType;
  priority?: TaskPriority;
  urgent?: boolean;
  completed: boolean;
  metadata: {
    description?: string;
    dueDate?: string;
    streak?: number;
    completedAt?: string;
    pointsAwarded?: number;
    createdAt?: string;
  };
}

export interface UserPoints {
  currentPoints: number;
  totalEarned: number;
  streak: number;
  lastCompletionDate?: string;
}

export interface LevelInfo {
  level: number;
  name: string;
  threshold: number;
  nextThreshold?: number;
}

export interface User {
  id: string;
  email?: string;
  name?: string;
  organization_id: string;
  created_at: string;
}

export interface AppSession {
  sessionId: string;
  loginUrl: string;
  expiresAt: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
}

export const LEVELS: LevelInfo[] = [
  { level: 1, name: "Beginner", threshold: 0, nextThreshold: 100 },
  { level: 2, name: "Apprentice", threshold: 100, nextThreshold: 300 },
  { level: 3, name: "Journeyman", threshold: 300, nextThreshold: 600 },
  { level: 4, name: "Expert", threshold: 600, nextThreshold: 1000 },
  { level: 5, name: "Master", threshold: 1000, nextThreshold: 1500 },
  { level: 6, name: "Grandmaster", threshold: 1500, nextThreshold: 2200 },
  { level: 7, name: "Legend", threshold: 2200, nextThreshold: 3000 },
  { level: 8, name: "Mythic", threshold: 3000, nextThreshold: 4000 },
  { level: 9, name: "Immortal", threshold: 4000, nextThreshold: 5500 },
  { level: 10, name: "Transcendent", threshold: 5500 },
];

export function calculateLevel(points: number): LevelInfo {
  return LEVELS.reduce(
    (current, level) => (points >= level.threshold ? level : current),
    LEVELS[0],
  );
}

export function calculateProgress(points: number): number {
  const level = calculateLevel(points);
  if (!level.nextThreshold) return 100;
  const progress =
    (points - level.threshold) / (level.nextThreshold - level.threshold);
  return Math.min(100, Math.round(progress * 100));
}
