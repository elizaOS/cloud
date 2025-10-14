"use client";

import { useEffect } from "react";

export default function LogoutPage() {
  useEffect(() => {
    async function logout() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });

        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(
              /=.*/,
              "=;expires=" + new Date().toUTCString() + ";path=/",
            );
        });

        window.location.href = "/";
      } catch (error) {
        console.error("Logout failed:", error);

        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(
              /=.*/,
              "=;expires=" + new Date().toUTCString() + ";path=/",
            );
        });

        window.location.href = "/";
      }
    }

    logout();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div>Logging out...</div>
      <div style={{ fontSize: "14px", color: "#666" }}>
        Clearing session and cookies
      </div>
    </div>
  );
}
