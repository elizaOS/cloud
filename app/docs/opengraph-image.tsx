import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "elizaOS Cloud Documentation";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
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
          background: "#0A0A0A",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Corner Brackets */}
        <div
          style={{
            position: "absolute",
            left: 40,
            top: 40,
            width: 48,
            height: 48,
            borderTop: "3px solid #E1E1E1",
            borderLeft: "3px solid #E1E1E1",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 40,
            top: 40,
            width: 48,
            height: 48,
            borderTop: "3px solid #E1E1E1",
            borderRight: "3px solid #E1E1E1",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 40,
            bottom: 40,
            width: 48,
            height: 48,
            borderBottom: "3px solid #E1E1E1",
            borderLeft: "3px solid #E1E1E1",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 40,
            bottom: 40,
            width: 48,
            height: 48,
            borderBottom: "3px solid #E1E1E1",
            borderRight: "3px solid #E1E1E1",
          }}
        />

        {/* Gradient Accents */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 88, 0, 0.15) 0%, transparent 50%)",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 80px",
          }}
        >
          {/* Logo / Brand */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 32,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: "linear-gradient(135deg, #FF5800 0%, #FF7A33 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "white",
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            elizaOS{" "}
            <span style={{ color: "#FF5800" }}>Documentation</span>
          </h1>

          {/* Description */}
          <p
            style={{
              fontSize: 28,
              color: "rgba(255, 255, 255, 0.6)",
              margin: "24px 0 0 0",
              maxWidth: 800,
              lineHeight: 1.4,
            }}
          >
            Complete guides, API reference, and tutorials for building AI agents
          </p>

          {/* Badge */}
          <div
            style={{
              display: "flex",
              marginTop: 40,
              padding: "12px 24px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 8,
            }}
          >
            <span
              style={{
                fontSize: 18,
                color: "rgba(255, 255, 255, 0.5)",
                fontFamily: "monospace",
              }}
            >
              cloud.eliza.ai/docs
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
