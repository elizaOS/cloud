/**
 * Structured Logging for ElizaOS Cloud
 * Provides consistent logging across the application with context and metadata
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  userId?: string;
  organizationId?: string;
  requestId?: string;
  containerId?: string;
  artifactId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

class Logger {
  private context: LogContext = {};

  /**
   * Set default context for all logs
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Create log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: "code" in error ? String(error.code) : undefined,
      };
    }

    return entry;
  }

  /**
   * Format log entry for console output
   */
  private formatForConsole(entry: LogEntry): string {
    const levelEmoji = {
      debug: "🔍",
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
    };

    const emoji = levelEmoji[entry.level];
    const contextStr = entry.context
      ? Object.keys(entry.context).length > 0
        ? ` ${JSON.stringify(entry.context)}`
        : ""
      : "";

    return `${emoji} [${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${contextStr}`;
  }

  /**
   * Write log entry
   */
  private write(entry: LogEntry): void {
    const formatted = this.formatForConsole(entry);

    switch (entry.level) {
      case "debug":
        if (process.env.NODE_ENV !== "production") {
          console.debug(formatted);
        }
        break;
      case "info":
        console.log(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        if (entry.error?.stack) {
          console.error(entry.error.stack);
        }
        break;
    }

    // In production, also send to external logging service
    if (process.env.NODE_ENV === "production") {
      this.sendToExternalService(entry);
    }
  }

  /**
   * Send log to external service (e.g., Sentry, Datadog)
   * TODO: Implement based on chosen logging service
   */
  private sendToExternalService(entry: LogEntry): void {
    // For now, this is a no-op stub
    // In production, integrate with your logging service of choice
    void entry; // Explicitly mark as unused
  }

  /**
   * Debug log
   */
  debug(message: string, context?: LogContext): void {
    this.write(this.createLogEntry("debug", message, context));
  }

  /**
   * Info log
   */
  info(message: string, context?: LogContext): void {
    this.write(this.createLogEntry("info", message, context));
  }

  /**
   * Warning log
   */
  warn(message: string, context?: LogContext): void {
    this.write(this.createLogEntry("warn", message, context));
  }

  /**
   * Error log
   */
  error(message: string, error?: Error, context?: LogContext): void {
    this.write(this.createLogEntry("error", message, context, error));
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.setContext({ ...this.context, ...context });
    return childLogger;
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Create request logger with request ID
 */
export function createRequestLogger(requestId: string): Logger {
  return logger.child({ requestId });
}

/**
 * Log deployment event
 */
export function logDeployment(
  event: "started" | "completed" | "failed",
  containerId: string,
  context?: LogContext
): void {
  const messages = {
    started: "Container deployment started",
    completed: "Container deployment completed successfully",
    failed: "Container deployment failed",
  };

  const level: LogLevel = event === "failed" ? "error" : "info";
  
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: messages[event],
    context: { containerId, event: `deployment.${event}`, ...context },
  };

  if (level === "error") {
    logger.error(entry.message, undefined, entry.context);
  } else {
    logger.info(entry.message, entry.context);
  }
}

/**
 * Log artifact event
 */
export function logArtifact(
  event: "upload_started" | "upload_completed" | "upload_failed" | "download_started" | "download_completed",
  artifactId: string,
  context?: LogContext
): void {
  const messages = {
    upload_started: "Artifact upload started",
    upload_completed: "Artifact upload completed",
    upload_failed: "Artifact upload failed",
    download_started: "Artifact download started",
    download_completed: "Artifact download completed",
  };

  const combinedContext = { artifactId, event: `artifact.${event}`, ...context };

  if (event.includes("failed")) {
    logger.error(messages[event], undefined, combinedContext);
  } else {
    logger.info(messages[event], combinedContext);
  }
}

/**
 * Log API request
 */
export function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  context?: LogContext
): void {
  const combinedContext = {
    method,
    path,
    statusCode,
    durationMs,
    ...context,
  };

  if (statusCode >= 500) {
    logger.error(`API ${method} ${path} - ${statusCode}`, undefined, combinedContext);
  } else if (statusCode >= 400) {
    logger.warn(`API ${method} ${path} - ${statusCode}`, combinedContext);
  } else {
    logger.info(`API ${method} ${path} - ${statusCode}`, combinedContext);
  }
}

