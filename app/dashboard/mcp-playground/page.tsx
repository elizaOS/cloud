import { Metadata } from "next";
import { MCPPlaygroundClient } from "@/components/mcp-playground/mcp-playground-client";

export const metadata: Metadata = {
  title: "MCP Playground - ElizaOS Cloud",
  description:
    "Explore and test Model Context Protocol integrations with our interactive playground",
};

export default function MCPPlaygroundPage() {
  return <MCPPlaygroundClient />;
}

