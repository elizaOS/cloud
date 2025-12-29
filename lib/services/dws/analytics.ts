/**
 * DWS Analytics Service
 *
 * Drop-in replacement for @vercel/analytics that uses DWS-native analytics.
 * Provides privacy-respecting, decentralized usage tracking.
 *
 * Features:
 * - Page view tracking
 * - Custom event tracking
 * - Real-time metrics
 * - Privacy-first (no PII collection)
 */

import { getDWSConfig } from './config'
import { logger } from '@/lib/utils/logger'

// Analytics event types
export interface PageViewEvent {
  type: 'pageview'
  url: string
  referrer?: string
  userAgent?: string
  timestamp: number
  sessionId?: string
  geo?: {
    country?: string
    region?: string
    city?: string
  }
}

export interface CustomEvent {
  type: 'event'
  name: string
  properties?: Record<string, string | number | boolean>
  timestamp: number
  sessionId?: string
}

export interface WebVitalEvent {
  type: 'web-vital'
  name: 'FCP' | 'LCP' | 'CLS' | 'FID' | 'TTFB' | 'INP'
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  timestamp: number
  url: string
}

export type AnalyticsEvent = PageViewEvent | CustomEvent | WebVitalEvent

// Batch analytics for efficiency
let eventQueue: AnalyticsEvent[] = []
let flushTimeout: NodeJS.Timeout | null = null
const FLUSH_INTERVAL = 5000 // 5 seconds
const MAX_BATCH_SIZE = 50

async function flushEvents(): Promise<void> {
  if (eventQueue.length === 0) return

  const config = getDWSConfig()
  if (!config.analyticsEnabled) return

  const events = [...eventQueue]
  eventQueue = []

  try {
    const endpoint = config.analyticsEndpoint ?? `${config.apiUrl}/analytics/events`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    })

    if (!response.ok) {
      logger.warn('[DWS Analytics] Failed to send events', {
        status: response.status,
        count: events.length,
      })
      // Re-queue failed events (up to max batch size)
      eventQueue = [...events.slice(0, MAX_BATCH_SIZE - eventQueue.length), ...eventQueue]
    }
  } catch (error) {
    logger.error('[DWS Analytics] Error sending events', { error })
    // Re-queue on error
    eventQueue = [...events.slice(0, MAX_BATCH_SIZE - eventQueue.length), ...eventQueue]
  }
}

function scheduleFlush(): void {
  if (flushTimeout) return

  flushTimeout = setTimeout(() => {
    flushTimeout = null
    flushEvents()
  }, FLUSH_INTERVAL)
}

function queueEvent(event: AnalyticsEvent): void {
  const config = getDWSConfig()
  if (!config.analyticsEnabled) return

  eventQueue.push(event)

  if (eventQueue.length >= MAX_BATCH_SIZE) {
    flushEvents()
  } else {
    scheduleFlush()
  }
}

/**
 * Track a page view
 */
export function trackPageView(options: {
  url: string
  referrer?: string
  userAgent?: string
  sessionId?: string
  geo?: PageViewEvent['geo']
}): void {
  queueEvent({
    type: 'pageview',
    url: options.url,
    referrer: options.referrer,
    userAgent: options.userAgent,
    sessionId: options.sessionId,
    geo: options.geo,
    timestamp: Date.now(),
  })
}

/**
 * Track a custom event
 */
export function trackEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
  sessionId?: string,
): void {
  queueEvent({
    type: 'event',
    name,
    properties,
    sessionId,
    timestamp: Date.now(),
  })
}

/**
 * Track a web vital metric
 */
export function trackWebVital(options: {
  name: WebVitalEvent['name']
  value: number
  rating: WebVitalEvent['rating']
  url: string
}): void {
  queueEvent({
    type: 'web-vital',
    name: options.name,
    value: options.value,
    rating: options.rating,
    url: options.url,
    timestamp: Date.now(),
  })
}

/**
 * Force flush all queued events
 */
export async function flush(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout)
    flushTimeout = null
  }
  await flushEvents()
}

// Server-side analytics utilities

export interface AnalyticsQuery {
  startDate: Date
  endDate: Date
  metrics?: ('pageviews' | 'visitors' | 'events' | 'web-vitals')[]
  dimensions?: ('url' | 'country' | 'device' | 'browser')[]
  filters?: {
    url?: string
    country?: string
    eventName?: string
  }
}

export interface AnalyticsResult {
  pageviews: number
  visitors: number
  events: number
  bounceRate: number
  avgSessionDuration: number
  topPages: Array<{ url: string; views: number }>
  topCountries: Array<{ country: string; visitors: number }>
  webVitals: {
    lcp: { value: number; rating: string }
    fcp: { value: number; rating: string }
    cls: { value: number; rating: string }
    fid: { value: number; rating: string }
  }
}

/**
 * Query analytics data (server-side only)
 */
export async function queryAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult> {
  const config = getDWSConfig()
  const endpoint = config.analyticsEndpoint ?? `${config.apiUrl}/analytics/query`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })

  if (!response.ok) {
    throw new Error(`Analytics query failed: ${response.status}`)
  }

  return response.json()
}

/**
 * Get real-time analytics
 */
export async function getRealTimeAnalytics(): Promise<{
  activeVisitors: number
  recentPageviews: Array<{ url: string; timestamp: number }>
  recentEvents: Array<{ name: string; timestamp: number }>
}> {
  const config = getDWSConfig()
  const endpoint = config.analyticsEndpoint ?? `${config.apiUrl}/analytics/realtime`

  const response = await fetch(endpoint, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Real-time analytics failed: ${response.status}`)
  }

  return response.json()
}

// React component for client-side analytics
// This is a server component that injects the analytics script

/**
 * Analytics component props (for compatibility with @vercel/analytics)
 */
export interface AnalyticsProps {
  mode?: 'production' | 'development' | 'auto'
  debug?: boolean
  beforeSend?: (event: AnalyticsEvent) => AnalyticsEvent | null
}

/**
 * Generate the analytics script for client-side tracking
 */
export function generateAnalyticsScript(props: AnalyticsProps = {}): string {
  const config = getDWSConfig()
  const endpoint = config.analyticsEndpoint ?? `${config.apiUrl}/analytics/events`

  return `
(function() {
  const endpoint = '${endpoint}';
  const debug = ${props.debug ?? false};
  let queue = [];
  let sessionId = null;

  // Generate session ID
  try {
    sessionId = sessionStorage.getItem('dws_analytics_session');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('dws_analytics_session', sessionId);
    }
  } catch (e) {
    sessionId = Math.random().toString(36).slice(2);
  }

  function flush() {
    if (queue.length === 0) return;
    const events = queue.splice(0, 50);
    
    if (debug) console.log('[DWS Analytics]', events);
    
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true
    }).catch(() => {
      queue.unshift(...events);
    });
  }

  function track(event) {
    event.sessionId = sessionId;
    event.timestamp = Date.now();
    queue.push(event);
    if (queue.length >= 10) flush();
  }

  // Track page views
  function trackPageView() {
    track({
      type: 'pageview',
      url: location.href,
      referrer: document.referrer
    });
  }

  // Track web vitals
  if ('PerformanceObserver' in window) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          track({ type: 'web-vital', name: 'LCP', value: entry.startTime, url: location.href });
        }
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'first-input') {
          track({ type: 'web-vital', name: 'FID', value: entry.processingStart - entry.startTime, url: location.href });
        }
      }
    }).observe({ type: 'first-input', buffered: true });
  }

  // Track on page load
  trackPageView();

  // Track on navigation (SPA support)
  if (typeof navigation !== 'undefined') {
    navigation.addEventListener('navigate', () => {
      setTimeout(trackPageView, 0);
    });
  } else {
    const pushState = history.pushState;
    history.pushState = function() {
      pushState.apply(history, arguments);
      setTimeout(trackPageView, 0);
    };
  }

  // Flush on page unload
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  // Periodic flush
  setInterval(flush, 5000);

  // Expose tracking API
  window.dwsAnalytics = {
    track: (name, props) => track({ type: 'event', name, properties: props }),
    trackPageView
  };
})();
  `.trim()
}

/**
 * React Analytics component (Server Component)
 */
export function Analytics({ mode, debug, beforeSend }: AnalyticsProps = {}) {
  const config = getDWSConfig()

  // Skip in development unless explicitly enabled
  if (mode === 'auto' || mode === undefined) {
    if (process.env.NODE_ENV === 'development' && !debug) {
      return null
    }
  } else if (mode === 'development' && process.env.NODE_ENV !== 'development') {
    return null
  } else if (mode === 'production' && process.env.NODE_ENV !== 'production') {
    return null
  }

  if (!config.analyticsEnabled) {
    return null
  }

  const script = generateAnalyticsScript({ mode, debug, beforeSend })

  // Return script tag as React element
  // This will be rendered as a script tag in the HTML
  return {
    $$typeof: Symbol.for('react.element'),
    type: 'script',
    props: {
      dangerouslySetInnerHTML: { __html: script },
      'data-dws-analytics': 'true',
    },
    key: 'dws-analytics',
    ref: null,
  }
}

export const dwsAnalyticsService = {
  trackPageView,
  trackEvent,
  trackWebVital,
  flush,
  queryAnalytics,
  getRealTimeAnalytics,
  generateAnalyticsScript,
  Analytics,
}


