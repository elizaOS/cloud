/**
 * PostHog Analytics - Shared Types and Client-Side Tracking
 *
 * Event naming convention: snake_case with verb_noun format
 * e.g., agent_created, dashboard_viewed, signup_completed
 */

import posthog from "posthog-js";

export type PostHogEvent =
  // Authentication & Signup
  | "signup_completed"
  | "login_completed"
  | "logout_completed"
  // Navigation
  | "dashboard_viewed"
  | "page_viewed"
  // Agent Creation
  | "agent_create_started"
  | "agent_create_completed"
  | "agent_create_failed"
  | "agent_builder_opened"
  | "agent_builder_saved"
  // Agent Editing
  | "agent_edit_started"
  // Agent Engagement
  | "agent_chat_started"
  | "agent_chat_message_sent"
  | "agent_made_public"
  | "agent_deleted"
  // Container Deployment
  | "container_deploy_started"
  | "container_deploy_completed"
  | "container_deploy_failed"
  // Billing & Credits
  | "credits_purchased"
  | "credits_purchase_started"
  | "billing_page_viewed"
  // Feature Usage
  | "api_key_created"
  | "knowledge_uploaded"
  | "app_created";

export type AuthMethod = "email" | "google" | "discord" | "github" | "wallet";
export type AgentSource = "quick_create" | "builder" | "dashboard";

export interface PrivyUserAuthInfo {
  google?: { email?: string; name?: string } | null;
  discord?: { email?: string; username?: string } | null;
  github?: { username?: string } | null;
  wallet?: { address?: string } | null;
  email?: { address?: string } | null;
}

export function getSignupMethod(user: PrivyUserAuthInfo): AuthMethod {
  if (user.google) return "google";
  if (user.discord) return "discord";
  if (user.github) return "github";
  if (user.wallet && !user.email) return "wallet";
  return "email";
}

export interface SignupCompletedProps {
  method: AuthMethod;
  has_referral?: boolean;
  initial_credits?: number;
}

export interface AgentCreateStartedProps {
  source: AgentSource;
}

export interface AgentCreateCompletedProps {
  agent_id: string;
  agent_name: string;
  source: "quick_create" | "builder";
  has_custom_bio?: boolean;
  creation_time_ms?: number;
  agent_count?: number;
  is_first_agent?: boolean;
}

export interface AgentEditStartedProps {
  agent_id: string;
  agent_name?: string;
  source: "builder" | "chat" | "dashboard";
}

export interface AgentChatStartedProps {
  agent_id: string;
  agent_name?: string;
  is_first_chat: boolean;
}

export interface ContainerDeployProps {
  container_id?: string;
  container_name?: string;
  agent_id?: string;
  status?: "started" | "completed" | "failed";
  error_message?: string;
  deployment_time_ms?: number;
  is_update?: boolean;
  cpu?: number;
  memory?: number;
  container_url?: string;
}

export interface PageViewedProps {
  page_name: string;
  page_path: string;
  referrer?: string;
}

export interface BillingPageViewedProps {
  current_credits: number;
  available_packs: number;
}

export interface CreditsPurchaseStartedProps {
  pack_id: string;
  amount: number;
}

export interface CreditsPurchasedProps {
  amount: number;
  currency: string;
  purchase_type: string;
  organization_id: string;
}

export interface AgentChatMessageSentProps {
  agent_id: string;
  room_id: string;
  agent_name?: string;
  message_length: number;
}

export interface AgentCreateFailedProps {
  source: AgentSource;
  error_type: string;
  error_message?: string;
}

export interface LoginCompletedProps {
  method: AuthMethod;
}

export type EventProperties =
  | SignupCompletedProps
  | LoginCompletedProps
  | AgentCreateStartedProps
  | AgentCreateCompletedProps
  | AgentCreateFailedProps
  | AgentEditStartedProps
  | AgentChatStartedProps
  | AgentChatMessageSentProps
  | ContainerDeployProps
  | PageViewedProps
  | BillingPageViewedProps
  | CreditsPurchaseStartedProps
  | CreditsPurchasedProps;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function initPostHog(): void {
  // Only initialize in production
  if (!isProduction()) return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!apiKey) {
    console.warn("[PostHog] NEXT_PUBLIC_POSTHOG_KEY not set, analytics disabled");
    return;
  }

  if (!isBrowser()) return;

  posthog.init(apiKey, {
    api_host: apiHost,
    capture_pageview: false, // Disabled - using custom PageViewTracker component instead
    capture_pageleave: true,
    enable_recording_console_log: false,
    respect_dnt: true,
    persistence: "localStorage+cookie",
    mask_all_text: false,
    mask_all_element_attributes: false,
  });
}

export function trackEvent(event: PostHogEvent, properties?: EventProperties): void {
  if (!isBrowser()) return;
  posthog.capture(event, properties);
}

export interface UserProperties {
  email?: string;
  name?: string;
  organization_id?: string;
  organization_name?: string;
  wallet_address?: string;
  signup_method?: string;
  created_at?: string;
}

export function identifyUser(userId: string, properties?: UserProperties): void {
  if (!isBrowser()) return;
  posthog.identify(userId, properties);
}

export function resetUser(): void {
  if (!isBrowser()) return;
  posthog.reset();
}

export function setUserProperties(properties: Record<string, unknown>): void {
  if (!isBrowser()) return;
  posthog.people.set(properties);
}

export function trackPageView(pageName?: string): void {
  if (!isBrowser()) return;
  posthog.capture("$pageview", {
    page_name: pageName,
    page_path: window.location.pathname,
  });
}

export function getPostHog(): typeof posthog | null {
  if (!isBrowser()) return null;
  return posthog;
}

export function isPostHogReady(): boolean {
  if (!isBrowser()) return false;
  return posthog.__loaded ?? false;
}
