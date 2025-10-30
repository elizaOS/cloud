import fs from "fs";
import path from "path";
import type {
  WelcomeEmailData,
  LowCreditsEmailData,
} from "@/lib/email/types";

function loadTemplate(filename: string): string {
  const templatePath = path.join(
    process.cwd(),
    "lib",
    "email",
    "templates",
    filename,
  );
  return fs.readFileSync(templatePath, "utf-8");
}

function interpolate(
  template: string,
  data: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return String(data[key] ?? match);
  });
}

export function renderWelcomeTemplate(data: WelcomeEmailData): {
  html: string;
  text: string;
} {
  const htmlTemplate = loadTemplate("welcome.html");
  const textTemplate = loadTemplate("welcome.txt");

  const templateData = {
    userName: data.userName,
    organizationName: data.organizationName,
    creditBalance: data.creditBalance.toLocaleString(),
    dashboardUrl: data.dashboardUrl,
    docsUrl: `${data.dashboardUrl.replace(/\/dashboard.*/, "")}/docs`,
    currentYear: new Date().getFullYear(),
  };

  return {
    html: interpolate(htmlTemplate, templateData),
    text: interpolate(textTemplate, templateData),
  };
}

export function renderLowCreditsTemplate(data: LowCreditsEmailData): {
  html: string;
  text: string;
} {
  const htmlTemplate = loadTemplate("low-credits.html");
  const textTemplate = loadTemplate("low-credits.txt");

  const templateData = {
    organizationName: data.organizationName,
    currentBalance: data.currentBalance.toLocaleString(),
    threshold: data.threshold.toLocaleString(),
    billingUrl: data.billingUrl,
    currentYear: new Date().getFullYear(),
  };

  return {
    html: interpolate(htmlTemplate, templateData),
    text: interpolate(textTemplate, templateData),
  };
}
