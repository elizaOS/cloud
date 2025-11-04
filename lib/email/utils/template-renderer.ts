import fs from "fs";
import path from "path";
import type {
  WelcomeEmailData,
  LowCreditsEmailData,
  InviteEmailData,
  AutoTopUpSuccessEmailData,
  AutoTopUpDisabledEmailData,
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

export function renderInviteTemplate(data: InviteEmailData): {
  html: string;
  text: string;
} {
  const htmlTemplate = loadTemplate("invite.html");
  const textTemplate = loadTemplate("invite.txt");

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/accept?token=${data.inviteToken}`;

  const templateData = {
    inviterName: data.inviterName,
    organizationName: data.organizationName,
    role: data.role,
    acceptUrl,
    currentYear: new Date().getFullYear(),
  };

  return {
    html: interpolate(htmlTemplate, templateData),
    text: interpolate(textTemplate, templateData),
  };
}

export function renderAutoTopUpSuccessTemplate(data: AutoTopUpSuccessEmailData): {
  html: string;
  text: string;
} {
  const templateData = {
    organizationName: data.organizationName,
    amount: data.amount.toFixed(2),
    previousBalance: data.previousBalance.toFixed(2),
    newBalance: data.newBalance.toFixed(2),
    paymentMethod: data.paymentMethod,
    billingUrl: data.billingUrl,
    currentYear: new Date().getFullYear(),
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Auto Top-Up Successful</title>
</head>
<body style="font-family: monospace; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #FF5800;">✓ Auto Top-Up Successful</h2>
  <p>Hi ${templateData.organizationName} team,</p>
  <p>Your account has been automatically topped up with <strong>$${templateData.amount}</strong>.</p>
  <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 10px 0;"><strong>Previous Balance:</strong></td>
      <td style="text-align: right;">$${templateData.previousBalance}</td>
    </tr>
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 10px 0;"><strong>Amount Added:</strong></td>
      <td style="text-align: right; color: #FF5800;">+$${templateData.amount}</td>
    </tr>
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 10px 0;"><strong>New Balance:</strong></td>
      <td style="text-align: right;"><strong>$${templateData.newBalance}</strong></td>
    </tr>
    <tr>
      <td style="padding: 10px 0;"><strong>Payment Method:</strong></td>
      <td style="text-align: right;">${templateData.paymentMethod}</td>
    </tr>
  </table>
  <p><a href="${templateData.billingUrl}" style="color: #FF5800;">View Billing Details →</a></p>
  <p style="color: #666; font-size: 12px; margin-top: 40px;">© ${templateData.currentYear} Eliza Cloud. All rights reserved.</p>
</body>
</html>`;

  const text = `
✓ Auto Top-Up Successful

Hi ${templateData.organizationName} team,

Your account has been automatically topped up with $${templateData.amount}.

Previous Balance: $${templateData.previousBalance}
Amount Added: +$${templateData.amount}
New Balance: $${templateData.newBalance}
Payment Method: ${templateData.paymentMethod}

View Billing Details: ${templateData.billingUrl}

© ${templateData.currentYear} Eliza Cloud. All rights reserved.`;

  return { html, text };
}

export function renderAutoTopUpDisabledTemplate(data: AutoTopUpDisabledEmailData): {
  html: string;
  text: string;
} {
  const templateData = {
    organizationName: data.organizationName,
    reason: data.reason,
    currentBalance: data.currentBalance.toFixed(2),
    settingsUrl: data.settingsUrl,
    currentYear: new Date().getFullYear(),
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Auto Top-Up Disabled</title>
</head>
<body style="font-family: monospace; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc2626;">⚠ Auto Top-Up Disabled</h2>
  <p>Hi ${templateData.organizationName} team,</p>
  <p>Your auto top-up feature has been automatically disabled.</p>
  <p><strong>Reason:</strong> ${templateData.reason}</p>
  <p><strong>Current Balance:</strong> $${templateData.currentBalance}</p>
  <h3>What should you do?</h3>
  <ol>
    <li>Review your payment method settings</li>
    <li>Update your payment information if needed</li>
    <li>Re-enable auto top-up in your settings</li>
  </ol>
  <p><a href="${templateData.settingsUrl}" style="display: inline-block; background: #FF5800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Update Settings →</a></p>
  <p style="color: #666; font-size: 12px; margin-top: 40px;">© ${templateData.currentYear} Eliza Cloud. All rights reserved.</p>
</body>
</html>`;

  const text = `
⚠ Auto Top-Up Disabled

Hi ${templateData.organizationName} team,

Your auto top-up feature has been automatically disabled.

Reason: ${templateData.reason}
Current Balance: $${templateData.currentBalance}

What should you do?
1. Review your payment method settings
2. Update your payment information if needed
3. Re-enable auto top-up in your settings

Update Settings: ${templateData.settingsUrl}

© ${templateData.currentYear} Eliza Cloud. All rights reserved.`;

  return { html, text };
}
