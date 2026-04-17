import { describe, expect, test } from "bun:test";

import { sidebarSections } from "../../ui/src/components/layout/sidebar-data";

describe("sidebarSections", () => {
  test("places Infrastructure directly under Dashboard with Instances first", () => {
    expect(sidebarSections.length).toBeGreaterThan(1);

    const [dashboardSection, infrastructureSection] = sidebarSections;

    expect(dashboardSection?.title).toBeUndefined();
    expect(dashboardSection?.items.map((item) => item.label)).toEqual([
      "Dashboard",
    ]);

    expect(infrastructureSection?.title).toBe("Infrastructure");
    expect(infrastructureSection?.items.map((item) => item.label)).toEqual([
      "Instances",
      "MCPs",
    ]);
    expect(infrastructureSection?.items[0]?.href).toBe("/dashboard/milady");
  });

  test("does not expose Containers as a sidebar item", () => {
    const labels = sidebarSections.flatMap((section) =>
      section.items.map((item) => item.label),
    );
    expect(labels).not.toContain("Containers");
  });
});
