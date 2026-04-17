import Tweet from "@elizaos/cloud-ui/components/landing/Tweet";
import { useMDXComponents as getDocsMDXComponents } from "nextra-theme-docs";

const docsComponents = getDocsMDXComponents();

export function useMDXComponents(
  components?: Record<string, React.ComponentType>,
) {
  return {
    ...docsComponents,
    Tweet,
    ...components,
  };
}
