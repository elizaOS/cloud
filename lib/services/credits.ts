import {
  creditTransactionsRepository,
  creditPacksRepository,
  organizationsRepository,
  type CreditTransaction,
  type NewCreditTransaction,
  type CreditPack,
} from "@/db/repositories";

export class CreditsService {
  // Credit Transactions
  async getTransactionById(
    id: string,
  ): Promise<CreditTransaction | undefined> {
    return await creditTransactionsRepository.findById(id);
  }

  async getTransactionByStripePaymentIntent(
    paymentIntentId: string,
  ): Promise<CreditTransaction | undefined> {
    return await creditTransactionsRepository.findByStripePaymentIntent(
      paymentIntentId,
    );
  }

  async listTransactionsByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<CreditTransaction[]> {
    return await creditTransactionsRepository.listByOrganization(
      organizationId,
      limit,
    );
  }

  async listTransactionsByOrganizationAndType(
    organizationId: string,
    type: string,
  ): Promise<CreditTransaction[]> {
    return await creditTransactionsRepository.listByOrganizationAndType(
      organizationId,
      type,
    );
  }

  async createTransaction(
    data: NewCreditTransaction,
  ): Promise<CreditTransaction> {
    return await creditTransactionsRepository.create(data);
  }

  async addCredits(
    organizationId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>,
    stripePaymentIntentId?: string,
  ): Promise<{
    transaction: CreditTransaction;
    newBalance: number;
  }> {
    // Create transaction record
    const transaction = await this.createTransaction({
      organization_id: organizationId,
      amount,
      type: "credit",
      description,
      metadata: metadata || {},
      stripe_payment_intent_id: stripePaymentIntentId,
    });

    // Update organization balance
    const { newBalance } = await organizationsRepository.updateCreditBalance(
      organizationId,
      amount,
    );

    return { transaction, newBalance };
  }

  async deductCredits(
    organizationId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>,
  ): Promise<{
    success: boolean;
    newBalance: number;
    transaction: CreditTransaction;
  }> {
    if (amount <= 0) {
      throw new Error("Amount must be positive");
    }

    // Check current balance first
    const org = await organizationsRepository.findById(organizationId);

    if (!org) {
      throw new Error("Organization not found");
    }

    const newBalance = org.credit_balance - amount;

    // Return early if insufficient credits, without creating a transaction
    if (newBalance < 0) {
      return {
        success: false,
        newBalance: org.credit_balance,
        transaction: {} as CreditTransaction,
      };
    }

    // Create transaction record (negative amount)
    const transaction = await this.createTransaction({
      organization_id: organizationId,
      amount: -amount,
      type: "debit",
      description,
      metadata: metadata || {},
    });

    // Update organization balance
    await organizationsRepository.updateCreditBalance(organizationId, -amount);

    return { success: true, newBalance, transaction };
  }

  // Credit Packs
  async getCreditPackById(id: string): Promise<CreditPack | undefined> {
    return await creditPacksRepository.findById(id);
  }

  async getCreditPackByStripePriceId(
    stripePriceId: string,
  ): Promise<CreditPack | undefined> {
    return await creditPacksRepository.findByStripePriceId(stripePriceId);
  }

  async listActiveCreditPacks(): Promise<CreditPack[]> {
    return await creditPacksRepository.listActive();
  }

  async listAllCreditPacks(): Promise<CreditPack[]> {
    return await creditPacksRepository.listAll();
  }
}

// Export singleton instance
export const creditsService = new CreditsService();
