import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/api/models",
      "/api/fal/proxy",
      "/auth/error",
      "/api/v1/generate-image",
      "/api/v1/generate-video",
      "/api/v1/chat",
      "/api/v1/models/:path*", // Allow /api/v1/models and /api/v1/models/{model}
      "/api/v1/chat/completions",
      "/api/v1/embeddings",
      "/api/stripe/webhook",
    ],
  },
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
