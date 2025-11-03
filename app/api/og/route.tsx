import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const DEFAULT_GRADIENT = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
const ELIZA_GRADIENT = "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type") || "default";
    const title = searchParams.get("title") || "elizaOS Platform";
    const description = searchParams.get("description") || "AI Agent Development Platform";
    const name = searchParams.get("name");
    const characterName = searchParams.get("characterName");

    switch (type) {
      case "character":
        return new ImageResponse(
          (
            <div
              style={{
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: ELIZA_GRADIENT,
                fontFamily: "system-ui, sans-serif",
                padding: "40px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255, 255, 255, 0.95)",
                  borderRadius: "32px",
                  padding: "60px 80px",
                  maxWidth: "1000px",
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: 72,
                    fontWeight: "bold",
                    color: "#1a1a1a",
                    marginBottom: 24,
                    textAlign: "center",
                    lineHeight: 1.2,
                  }}
                >
                  {name || title}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    color: "#666",
                    textAlign: "center",
                    marginBottom: 32,
                    lineHeight: 1.4,
                    maxWidth: "800px",
                  }}
                >
                  {description.slice(0, 120)}
                  {description.length > 120 ? "..." : ""}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 28,
                    color: "#8b5cf6",
                    fontWeight: 600,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      background: ELIZA_GRADIENT,
                      borderRadius: "50%",
                    }}
                  />
                  elizaOS AI Character
                </div>
              </div>
            </div>
          ),
          {
            width: 1200,
            height: 630,
          },
        );

      case "chat":
        return new ImageResponse(
          (
            <div
              style={{
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: ELIZA_GRADIENT,
                fontFamily: "system-ui, sans-serif",
                padding: "40px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  background: "rgba(255, 255, 255, 0.95)",
                  borderRadius: "32px",
                  padding: "60px 80px",
                  maxWidth: "1000px",
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 600,
                    color: "#8b5cf6",
                    marginBottom: 24,
                  }}
                >
                  💬 Chat Conversation
                </div>
                <div
                  style={{
                    fontSize: 64,
                    fontWeight: "bold",
                    color: "#1a1a1a",
                    marginBottom: 24,
                    lineHeight: 1.2,
                  }}
                >
                  {characterName || name || "AI Agent"}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    color: "#666",
                    marginBottom: 32,
                  }}
                >
                  Join the conversation on elizaOS Platform
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 24,
                    color: "#999",
                  }}
                >
                  Powered by elizaOS
                </div>
              </div>
            </div>
          ),
          {
            width: 1200,
            height: 630,
          },
        );

      case "container":
        return new ImageResponse(
          (
            <div
              style={{
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: DEFAULT_GRADIENT,
                fontFamily: "system-ui, sans-serif",
                padding: "40px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  background: "rgba(255, 255, 255, 0.95)",
                  borderRadius: "32px",
                  padding: "60px 80px",
                  maxWidth: "1000px",
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 600,
                    color: "#667eea",
                    marginBottom: 24,
                  }}
                >
                  🐳 Container Deployment
                </div>
                <div
                  style={{
                    fontSize: 64,
                    fontWeight: "bold",
                    color: "#1a1a1a",
                    marginBottom: 24,
                    lineHeight: 1.2,
                  }}
                >
                  {name || title}
                </div>
                {characterName && (
                  <div
                    style={{
                      fontSize: 36,
                      color: "#666",
                      marginBottom: 32,
                    }}
                  >
                    Running: {characterName}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 24,
                    color: "#999",
                  }}
                >
                  Deployed on elizaOS Platform
                </div>
              </div>
            </div>
          ),
          {
            width: 1200,
            height: 630,
          },
        );

      case "marketplace":
        return new ImageResponse(
          (
            <div
              style={{
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: ELIZA_GRADIENT,
                fontFamily: "system-ui, sans-serif",
                padding: "40px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255, 255, 255, 0.95)",
                  borderRadius: "32px",
                  padding: "60px 80px",
                  maxWidth: "1000px",
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: 96,
                    marginBottom: 24,
                  }}
                >
                  🤖
                </div>
                <div
                  style={{
                    fontSize: 72,
                    fontWeight: "bold",
                    color: "#1a1a1a",
                    marginBottom: 24,
                    textAlign: "center",
                  }}
                >
                  AI Agent Marketplace
                </div>
                <div
                  style={{
                    fontSize: 36,
                    color: "#666",
                    textAlign: "center",
                    maxWidth: "800px",
                  }}
                >
                  Discover intelligent AI characters and agents
                </div>
              </div>
            </div>
          ),
          {
            width: 1200,
            height: 630,
          },
        );

      default:
        return new ImageResponse(
          (
            <div
              style={{
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: ELIZA_GRADIENT,
                fontFamily: "system-ui, sans-serif",
                padding: "40px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255, 255, 255, 0.95)",
                  borderRadius: "32px",
                  padding: "60px 80px",
                  maxWidth: "1000px",
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: 84,
                    fontWeight: "bold",
                    background: ELIZA_GRADIENT,
                    backgroundClip: "text",
                    color: "transparent",
                    marginBottom: 32,
                    textAlign: "center",
                    lineHeight: 1.1,
                  }}
                >
                  elizaOS
                </div>
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 600,
                    color: "#1a1a1a",
                    marginBottom: 24,
                    textAlign: "center",
                    lineHeight: 1.2,
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    color: "#666",
                    textAlign: "center",
                    maxWidth: "800px",
                    lineHeight: 1.4,
                  }}
                >
                  {description.slice(0, 100)}
                  {description.length > 100 ? "..." : ""}
                </div>
              </div>
            </div>
          ),
          {
            width: 1200,
            height: 630,
          },
        );
    }
  } catch (error) {
    console.error("Error generating OG image:", error);

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: ELIZA_GRADIENT,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: "bold",
              color: "white",
            }}
          >
            elizaOS Platform
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  }
}
