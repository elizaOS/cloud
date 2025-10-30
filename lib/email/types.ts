export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
  }>;
}

export interface WelcomeEmailData {
  email: string;
  userName: string;
  organizationName: string;
  creditBalance: number;
  dashboardUrl: string;
}

export interface LowCreditsEmailData {
  email: string;
  organizationName: string;
  currentBalance: number;
  threshold: number;
  billingUrl: string;
}
