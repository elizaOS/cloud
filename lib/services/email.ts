import sgMail from "@sendgrid/mail";
import { logger } from "@/lib/utils/logger";
import type {
  EmailOptions,
  WelcomeEmailData,
  LowCreditsEmailData,
} from "@/lib/email/types";

class EmailService {
  private initialized = false;
  private fromEmail: string | null = null;

  private initialize(): void {
    if (this.initialized) return;

    this.fromEmail =
      process.env.SENDGRID_FROM_EMAIL || "noreply@eliza.cloud";

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.warn("[EmailService] SendGrid API key not configured");
      this.initialized = false;
      return;
    }

    sgMail.setApiKey(apiKey);
    this.initialized = true;
    logger.info("[EmailService] Initialized successfully");
  }

  async send(options: EmailOptions): Promise<boolean> {
    this.initialize();

    if (!this.initialized) {
      logger.warn("[EmailService] Not initialized, skipping email send");
      return false;
    }

    try {
      const msg = {
        to: options.to,
        from: options.from || this.fromEmail!,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        attachments: options.attachments,
      };

      await sgMail.send(msg);

      logger.info("[EmailService] Email sent successfully", {
        to: options.to,
        subject: options.subject,
      });

      return true;
    } catch (error) {
      logger.error("[EmailService] Failed to send email", {
        error: error instanceof Error ? error.message : "Unknown error",
        to: options.to,
        subject: options.subject,
      });

      return false;
    }
  }

  async sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
    const { renderWelcomeTemplate } = await import(
      "@/lib/email/utils/template-renderer"
    );
    const { html, text } = renderWelcomeTemplate(data);

    return this.send({
      to: data.email,
      subject: "🎉 Welcome to Eliza Cloud - Let's Get Started!",
      html,
      text,
    });
  }

  async sendLowCreditsEmail(data: LowCreditsEmailData): Promise<boolean> {
    const { renderLowCreditsTemplate } = await import(
      "@/lib/email/utils/template-renderer"
    );
    const { html, text } = renderLowCreditsTemplate(data);

    return this.send({
      to: data.email,
      subject: "⚠️ Low Credits Alert - Action Required",
      html,
      text,
    });
  }
}

export const emailService = new EmailService();
