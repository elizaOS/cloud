"use client";

import React from "react";
import { BrandButton, BrandCard, CornerBrackets } from "@/components/brand";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { useRouter } from "next/navigation";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  resetError: () => void;
}

/**
 * Global Error Boundary Component
 *
 * Catches React rendering errors and displays a fallback UI
 * Prevents the entire app from crashing on component errors
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourApp />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    if (typeof window !== "undefined") {
      console.error("[ErrorBoundary] Caught error:", error);
      console.error("[ErrorBoundary] Error info:", errorInfo);
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;

      return (
        <FallbackComponent
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          resetError={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Default Error Fallback UI
 * Displays when an error is caught by the ErrorBoundary
 */
function DefaultErrorFallback({
  error,
  errorInfo,
  resetError,
}: ErrorFallbackProps) {
  const router = useRouter();

  const handleGoHome = () => {
    resetError();
    router.push("/");
  };

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <BrandCard className="relative max-w-2xl w-full p-8">
        <CornerBrackets size="md" className="opacity-50" />

        <div className="relative z-10 space-y-6 text-center">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">
              Something went wrong
            </h1>
            <p className="text-white/60">
              We encountered an unexpected error. Please try refreshing the page
              or returning home.
            </p>
          </div>

          {isDevelopment && error && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded text-left">
              <p className="text-sm font-mono text-destructive mb-2">
                {error.name}: {error.message}
              </p>
              {errorInfo && (
                <pre className="text-xs text-white/60 overflow-x-auto">
                  {errorInfo.componentStack}
                </pre>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <BrandButton onClick={handleReload} size="lg">
              <RefreshCw className="h-5 w-5 mr-2" />
              Reload Page
            </BrandButton>
            <BrandButton variant="outline" size="lg" onClick={handleGoHome}>
              <Home className="h-5 w-5 mr-2" />
              Go Home
            </BrandButton>
          </div>

          <p className="text-xs text-white/40 pt-4">
            If this problem persists, please contact support.
          </p>
        </div>
      </BrandCard>
    </div>
  );
}
