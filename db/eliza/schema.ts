import type { MessageExample } from '@elizaos/core';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { VECTOR_DIMS } from '@elizaos/core';

// ============================================================================
// VECTOR DIMENSION MAPPING
// ============================================================================

export const DIMENSION_MAP = {
  [VECTOR_DIMS.SMALL]: 'dim384',
  [VECTOR_DIMS.MEDIUM]: 'dim512',
  [VECTOR_DIMS.LARGE]: 'dim768',
  [VECTOR_DIMS.XL]: 'dim1024',
  [VECTOR_DIMS.XXL]: 'dim1536',
  [VECTOR_DIMS.XXXL]: 'dim3072',
} as const;

export type EmbeddingDimensionColumn =
  | 'dim384'
  | 'dim512'
  | 'dim768'
  | 'dim1024'
  | 'dim1536'
  | 'dim3072';

// ============================================================================
// AGENTS TABLE
// ============================================================================

/**
 * Represents a table for storing agent data.
 */
export const agentTable = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),

    // Character fields
    name: text('name').notNull(),
    username: text('username'),
    system: text('system').default(''),
    bio: jsonb('bio')
      .$type<string | string[]>()
      .default(sql`'[]'::jsonb`),
    messageExamples: jsonb('message_examples')
      .$type<MessageExample[][]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    postExamples: jsonb('post_examples')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    topics: jsonb('topics')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    adjectives: jsonb('adjectives')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    knowledge: jsonb('knowledge')
      .$type<(string | { path: string; shared?: boolean })[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    plugins: jsonb('plugins')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    settings: jsonb('settings')
      .$type<{
        secrets?: { [key: string]: string | boolean | number };
        [key: string]: unknown;
      }>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    style: jsonb('style')
      .$type<{
        all?: string[];
        chat?: string[];
        post?: string[];
      }>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => {
    return {
      nameUnique: unique('name_unique').on(table.name),
    };
  }
);

// ============================================================================
// CACHE TABLE
// ============================================================================

/**
 * Represents a PostgreSQL table for caching data.
 */
export const cacheTable = pgTable(
  'cache',
  {
    key: text('key').notNull(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agentTable.id, { onDelete: 'cascade' }),
    value: jsonb('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.key, table.agentId] }),
  })
);

// ============================================================================
// ENTITIES TABLE
// ============================================================================

/**
 * Represents an entity table in the database.
 * Includes columns for id, agentId, createdAt, names, and metadata.
 */
export const entityTable = pgTable(
  'entities',
  {
    id: uuid('id').notNull().primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agentTable.id, {
        onDelete: 'cascade',
      }),
    createdAt: timestamp('created_at')
      .default(sql`now()`)
      .notNull(),
    names: text('names')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    metadata: jsonb('metadata')
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => {
    return {
      idAgentIdUnique: unique('id_agent_id_unique').on(table.id, table.agentId),
    };
  }
);

// ============================================================================
// WORLDS TABLE
// ============================================================================

/**
 * Represents a table schema for worlds in the database.
 */
export const worldTable = pgTable('worlds', {
  id: uuid('id')
    .notNull()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  agentId: uuid('agentId')
    .notNull()
    .references(() => agentTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  metadata: jsonb('metadata'),
  serverId: text('serverId').notNull().default('local'),
  createdAt: timestamp('createdAt')
    .default(sql`now()`)
    .notNull(),
});

// ============================================================================
// ROOMS TABLE
// ============================================================================

/**
 * Defines a table schema for 'rooms' in the database.
 */
export const roomTable = pgTable('rooms', {
  id: uuid('id')
    .notNull()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  agentId: uuid('agentId').references(() => agentTable.id, {
    onDelete: 'cascade',
  }),
  source: text('source').notNull(),
  type: text('type').notNull(),
  serverId: text('serverId'),
  worldId: uuid('worldId'), // Optional reference to worldTable
  name: text('name'),
  metadata: jsonb('metadata'),
  channelId: text('channelId'),
  createdAt: timestamp('createdAt')
    .default(sql`now()`)
    .notNull(),
});

// ============================================================================
// COMPONENTS TABLE
// ============================================================================

/**
 * Represents a component table in the database.
 */
export const componentTable = pgTable('components', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .notNull(),

  // Foreign keys
  entityId: uuid('entityId')
    .references(() => entityTable.id, { onDelete: 'cascade' })
    .notNull(),
  agentId: uuid('agentId')
    .references(() => agentTable.id, { onDelete: 'cascade' })
    .notNull(),
  roomId: uuid('roomId')
    .references(() => roomTable.id, { onDelete: 'cascade' })
    .notNull(),
  worldId: uuid('worldId').references(() => worldTable.id, { onDelete: 'cascade' }),
  sourceEntityId: uuid('sourceEntityId').references(() => entityTable.id, { onDelete: 'cascade' }),

  // Data
  type: text('type').notNull(),
  data: jsonb('data').default(sql`'{}'::jsonb`),

  // Timestamps
  createdAt: timestamp('createdAt')
    .default(sql`now()`)
    .notNull(),
});

// ============================================================================
// MEMORIES TABLE
// ============================================================================

/**
 * Definition of the memory table in the database.
 */
export const memoryTable = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().notNull(),
    type: text('type').notNull(),
    createdAt: timestamp('createdAt')
      .default(sql`now()`)
      .notNull(),
    content: jsonb('content').notNull(),
    entityId: uuid('entityId').references(() => entityTable.id, {
      onDelete: 'cascade',
    }),
    agentId: uuid('agentId')
      .references(() => agentTable.id, {
        onDelete: 'cascade',
      })
      .notNull(),
    roomId: uuid('roomId').references(() => roomTable.id, {
      onDelete: 'cascade',
    }),
    worldId: uuid('worldId'),
    unique: boolean('unique').default(true).notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
  },
  (table) => [
    index('idx_memories_type_room').on(table.type, table.roomId),
    index('idx_memories_world_id').on(table.worldId),
    foreignKey({
      name: 'fk_room',
      columns: [table.roomId],
      foreignColumns: [roomTable.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_user',
      columns: [table.entityId],
      foreignColumns: [entityTable.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_agent',
      columns: [table.agentId],
      foreignColumns: [agentTable.id],
    }).onDelete('cascade'),
    index('idx_memories_metadata_type').on(sql`((metadata->>'type'))`),
    index('idx_memories_document_id').on(sql`((metadata->>'documentId'))`),
    index('idx_fragments_order').on(
      sql`((metadata->>'documentId'))`,
      sql`((metadata->>'position'))`
    ),
    check(
      'fragment_metadata_check',
      sql`
            CASE 
                WHEN metadata->>'type' = 'fragment' THEN
                    metadata ? 'documentId' AND 
                    metadata ? 'position'
                ELSE true
            END
        `
    ),
    check(
      'document_metadata_check',
      sql`
            CASE 
                WHEN metadata->>'type' = 'document' THEN
                    metadata ? 'timestamp'
                ELSE true
            END
        `
    ),
  ]
);

// ============================================================================
// EMBEDDINGS TABLE
// ============================================================================

/**
 * Definition of the embeddings table in the database.
 * Contains columns for ID, Memory ID, Creation Timestamp, and multiple vector dimensions.
 */
export const embeddingTable = pgTable(
  'embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    memoryId: uuid('memory_id').references(() => memoryTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at')
      .default(sql`now()`)
      .notNull(),
    dim384: vector('dim_384', { dimensions: VECTOR_DIMS.SMALL }),
    dim512: vector('dim_512', { dimensions: VECTOR_DIMS.MEDIUM }),
    dim768: vector('dim_768', { dimensions: VECTOR_DIMS.LARGE }),
    dim1024: vector('dim_1024', { dimensions: VECTOR_DIMS.XL }),
    dim1536: vector('dim_1536', { dimensions: VECTOR_DIMS.XXL }),
    dim3072: vector('dim_3072', { dimensions: VECTOR_DIMS.XXXL }),
  },
  (table) => [
    check('embedding_source_check', sql`"memory_id" IS NOT NULL`),
    index('idx_embedding_memory').on(table.memoryId),
    foreignKey({
      name: 'fk_embedding_memory',
      columns: [table.memoryId],
      foreignColumns: [memoryTable.id],
    }).onDelete('cascade'),
  ]
);

export const memoryRelations = relations(memoryTable, ({ one }) => ({
  embedding: one(embeddingTable),
}));

export type EmbeddingTableColumn = (typeof embeddingTable._.columns)[EmbeddingDimensionColumn];

// ============================================================================
// LOGS TABLE
// ============================================================================

/**
 * Represents a PostgreSQL table for storing logs.
 */
export const logTable = pgTable(
  'logs',
  {
    id: uuid('id').defaultRandom().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    entityId: uuid('entityId')
      .notNull()
      .references(() => entityTable.id, { onDelete: 'cascade' }),
    body: jsonb('body').notNull(),
    type: text('type').notNull(),
    roomId: uuid('roomId')
      .notNull()
      .references(() => roomTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    foreignKey({
      name: 'fk_room',
      columns: [table.roomId],
      foreignColumns: [roomTable.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_user',
      columns: [table.entityId],
      foreignColumns: [entityTable.id],
    }).onDelete('cascade'),
  ]
);

// ============================================================================
// PARTICIPANTS TABLE
// ============================================================================

/**
 * Defines the schema for the "participants" table in the database.
 */
export const participantTable = pgTable(
  'participants',
  {
    id: uuid('id')
      .notNull()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    entityId: uuid('entityId').references(() => entityTable.id, {
      onDelete: 'cascade',
    }),
    roomId: uuid('roomId').references(() => roomTable.id, {
      onDelete: 'cascade',
    }),
    agentId: uuid('agentId').references(() => agentTable.id, {
      onDelete: 'cascade',
    }),
    roomState: text('roomState'),
  },
  (table) => [
    index('idx_participants_user').on(table.entityId),
    index('idx_participants_room').on(table.roomId),
    foreignKey({
      name: 'fk_room',
      columns: [table.roomId],
      foreignColumns: [roomTable.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_user',
      columns: [table.entityId],
      foreignColumns: [entityTable.id],
    }).onDelete('cascade'),
  ]
);

// ============================================================================
// RELATIONSHIPS TABLE
// ============================================================================

/**
 * Defines the relationshipTable containing information about relationships between entities and agents.
 */
export const relationshipTable = pgTable(
  'relationships',
  {
    id: uuid('id')
      .notNull()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    sourceEntityId: uuid('sourceEntityId')
      .notNull()
      .references(() => entityTable.id, { onDelete: 'cascade' }),
    targetEntityId: uuid('targetEntityId')
      .notNull()
      .references(() => entityTable.id, { onDelete: 'cascade' }),
    agentId: uuid('agentId')
      .notNull()
      .references(() => agentTable.id, { onDelete: 'cascade' }),
    tags: text('tags').array(),
    metadata: jsonb('metadata'),
  },
  (table) => [
    index('idx_relationships_users').on(table.sourceEntityId, table.targetEntityId),
    unique('unique_relationship').on(table.sourceEntityId, table.targetEntityId, table.agentId),
    foreignKey({
      name: 'fk_user_a',
      columns: [table.sourceEntityId],
      foreignColumns: [entityTable.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_user_b',
      columns: [table.targetEntityId],
      foreignColumns: [entityTable.id],
    }).onDelete('cascade'),
  ]
);

// ============================================================================
// TASKS TABLE
// ============================================================================

/**
 * Represents a table schema for tasks in the database.
 */
export const taskTable = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  roomId: uuid('roomId'),
  worldId: uuid('worldId'),
  entityId: uuid('entityId'),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agentTable.id, { onDelete: 'cascade' }),
  tags: text('tags')
    .array()
    .default(sql`'{}'::text[]`),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// MESSAGE SERVER TABLES (Central Database)
// ============================================================================

/**
 * Message servers table for central database
 */
export const messageServerTable = pgTable('message_servers', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Server agents junction table
 */
export const serverAgentsTable = pgTable(
  'server_agents',
  {
    serverId: uuid('server_id')
      .notNull()
      .references(() => messageServerTable.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agentTable.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.serverId, table.agentId] }),
  })
);

/**
 * Channels table
 */
export const channelTable = pgTable('channels', {
  id: text('id').primaryKey(), // UUID stored as text
  messageServerId: uuid('server_id')
    .notNull()
    .references(() => messageServerTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(), // Store ChannelType enum values as text
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  topic: text('topic'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Channel participants junction table
 */
export const channelParticipantsTable = pgTable(
  'channel_participants',
  {
    channelId: text('channel_id')
      .notNull()
      .references(() => channelTable.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(), // Central UUID (can be an agentId or a dedicated central user ID)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.channelId, table.userId] }),
  })
);

/**
 * Central messages table
 */
export const messageTable = pgTable('central_messages', {
  id: text('id').primaryKey(), // UUID stored as text
  channelId: text('channel_id')
    .notNull()
    .references(() => channelTable.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(),
  content: text('content').notNull(),
  rawMessage: jsonb('raw_message'),
  inReplyToRootMessageId: text('in_reply_to_root_message_id'),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}, (table) => [
  // Self-referencing foreign key added as a constraint to avoid circular dependency
  foreignKey({
    name: 'fk_reply_to_message',
    columns: [table.inReplyToRootMessageId],
    foreignColumns: [table.id],
  }).onDelete('set null'),
]);