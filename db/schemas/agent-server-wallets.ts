import {
    pgTable,
    text,
    timestamp,
    uuid,
    index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { userCharacters } from "./user-characters";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

/**
 * Agent Server Wallets table schema.
 *
 * Tracks secure server-side wallets provisioned via Privy for agents.
 * The private keys reside entirely within Privy KMS. 
 * The client pubkey is used to verify RPC requests from the remote agent.
 */
export const agentServerWallets = pgTable(
    "agent_server_wallets",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        organization_id: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        user_id: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        character_id: uuid("character_id")
            .references(() => userCharacters.id, { onDelete: "set null" }),

        // The ID of the wallet in Privy
        privy_wallet_id: text("privy_wallet_id").notNull(),

        // The public address of the provisioned wallet
        address: text("address").notNull(),

        // Target blockchain ecosystem (e.g. "evm", "solana")
        chain_type: text("chain_type").notNull(),

        // The EVM address of the local agent used to authenticate RPC calls.
        client_address: text("client_address").notNull(),

        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        organization_idx: index("agent_server_wallets_organization_idx").on(
            table.organization_id,
        ),
        user_idx: index("agent_server_wallets_user_idx").on(table.user_id),
        character_idx: index("agent_server_wallets_character_idx").on(
            table.character_id,
        ),
        privy_wallet_idx: index("agent_server_wallets_privy_wallet_idx").on(
            table.privy_wallet_id,
        ),
        address_idx: index("agent_server_wallets_address_idx").on(table.address),
        client_address_idx: index("agent_server_wallets_client_address_idx").on(
            table.client_address,
        ),
    }),
);

export type AgentServerWallet = InferSelectModel<typeof agentServerWallets>;
export type NewAgentServerWallet = InferInsertModel<typeof agentServerWallets>;
