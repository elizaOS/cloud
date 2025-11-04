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

export interface InviteEmailData {
  email: string;
  inviterName: string;
  organizationName: string;
  role: string;
  inviteToken: string;
  expiresAt: string;
}

export interface AutoTopUpSuccessEmailData {
  email: string;
  organizationName: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  paymentMethod: string;
  billingUrl: string;
}

export interface AutoTopUpDisabledEmailData {
  email: string;
  organizationName: string;
  reason: string;
  currentBalance: number;
  settingsUrl: string;
}
