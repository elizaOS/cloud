/**
 * Fragment Sandbox Store
 * 
 * In-memory store for ephemeral sandbox fragments.
 * Fragments are stored temporarily for preview and cleaned up after TTL.
 */

import type { FragmentSchema } from "@/lib/fragments/schema";

interface SandboxEntry {
  fragment: FragmentSchema;
  userId: string;
  organizationId: string;
  createdAt: Date;
  expiresAt: Date;
}

const SANDBOX_TTL_MS = 30 * 60 * 1000; // 30 minutes

class FragmentSandboxStore {
  private store = new Map<string, SandboxEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  set(
    containerId: string,
    fragment: FragmentSchema,
    userId: string,
    organizationId: string
  ): void {
    const now = new Date();
    this.store.set(containerId, {
      fragment,
      userId,
      organizationId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SANDBOX_TTL_MS),
    });
  }

  get(containerId: string): SandboxEntry | null {
    const entry = this.store.get(containerId);
    if (!entry) return null;

    // Check expiration
    if (new Date() > entry.expiresAt) {
      this.store.delete(containerId);
      return null;
    }

    return entry;
  }

  delete(containerId: string): void {
    this.store.delete(containerId);
  }

  private cleanup(): void {
    const now = new Date();
    for (const [id, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(id);
      }
    }
  }

  // For testing
  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export const fragmentSandboxStore = new FragmentSandboxStore();


