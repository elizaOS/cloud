import { db } from "@/db/client";
import { invoices, type Invoice, type NewInvoice } from "@/db/schemas";
import { eq, desc } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

class InvoicesService {
  async create(data: NewInvoice): Promise<Invoice> {
    try {
      const [invoice] = await db
        .insert(invoices)
        .values({
          ...data,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning();

      logger.info("invoices-service", "Invoice created", {
        invoiceId: invoice.id,
        organizationId: data.organization_id,
        stripeInvoiceId: data.stripe_invoice_id,
      });

      return invoice;
    } catch (error) {
      logger.error("invoices-service", "Failed to create invoice", {
        error: error instanceof Error ? error.message : "Unknown error",
        organizationId: data.organization_id,
      });
      throw error;
    }
  }

  async getByStripeInvoiceId(
    stripeInvoiceId: string,
  ): Promise<Invoice | undefined> {
    try {
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.stripe_invoice_id, stripeInvoiceId))
        .limit(1);

      return invoice;
    } catch (error) {
      logger.error("invoices-service", "Failed to get invoice by Stripe ID", {
        error: error instanceof Error ? error.message : "Unknown error",
        stripeInvoiceId,
      });
      throw error;
    }
  }

  async listByOrganization(organizationId: string): Promise<Invoice[]> {
    try {
      const orgInvoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.organization_id, organizationId))
        .orderBy(desc(invoices.created_at));

      logger.info("invoices-service", "Listed invoices", {
        organizationId,
        count: orgInvoices.length,
      });

      return orgInvoices;
    } catch (error) {
      logger.error("invoices-service", "Failed to list invoices", {
        error: error instanceof Error ? error.message : "Unknown error",
        organizationId,
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<NewInvoice>): Promise<void> {
    try {
      await db
        .update(invoices)
        .set({
          ...data,
          updated_at: new Date(),
        })
        .where(eq(invoices.id, id));

      logger.info("invoices-service", "Invoice updated", {
        invoiceId: id,
      });
    } catch (error) {
      logger.error("invoices-service", "Failed to update invoice", {
        error: error instanceof Error ? error.message : "Unknown error",
        invoiceId: id,
      });
      throw error;
    }
  }

  async getById(id: string): Promise<Invoice | undefined> {
    try {
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);

      return invoice;
    } catch (error) {
      logger.error("invoices-service", "Failed to get invoice by ID", {
        error: error instanceof Error ? error.message : "Unknown error",
        invoiceId: id,
      });
      throw error;
    }
  }
}

export const invoicesService = new InvoicesService();
