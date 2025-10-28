import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { apiKeys } from "./api-keys";
import { userCharacters } from "./user-characters";

export const containers = pgTable(
  "containers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    project_name: text("project_name").notNull(), // Project identifier for multi-project support
    description: text("description"),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    api_key_id: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    character_id: uuid("character_id").references(() => userCharacters.id, {
      onDelete: "set null",
    }),
    // AWS ECS/ECR specific fields
    cloudformation_stack_name: text("cloudformation_stack_name"), // Track exact stack name
    ecr_repository_uri: text("ecr_repository_uri"),
    ecr_image_tag: text("ecr_image_tag"),
    ecs_cluster_arn: text("ecs_cluster_arn"),
    ecs_service_arn: text("ecs_service_arn"),
    ecs_task_definition_arn: text("ecs_task_definition_arn"),
    ecs_task_arn: text("ecs_task_arn"),
    load_balancer_url: text("load_balancer_url"),
    is_update: text("is_update").default("false").notNull(), // Track if deployment was an update
    status: text("status").default("pending").notNull(),
    image_tag: text("image_tag"),
    dockerfile_path: text("dockerfile_path"),
    environment_vars: jsonb("environment_vars")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    desired_count: integer("desired_count").default(1).notNull(),
    cpu: integer("cpu").default(1792).notNull(), // CPU units (1792 = 1.75 vCPU, 87.5% of t4g.micro's 2 vCPUs)
    memory: integer("memory").default(896).notNull(), // Memory in MB (896 MB = 87.5% of t4g.micro's 1 GiB)
    port: integer("port").default(3000).notNull(),
    health_check_path: text("health_check_path").default("/health"),
    architecture: text("architecture").default("arm64").notNull(), // CPU architecture: arm64 (t4g) or x86_64 (t3)
    last_deployed_at: timestamp("last_deployed_at"),
    last_health_check: timestamp("last_health_check"),
    deployment_log: text("deployment_log"),
    error_message: text("error_message"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    organization_idx: index("containers_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("containers_user_idx").on(table.user_id),
    status_idx: index("containers_status_idx").on(table.status),
    character_idx: index("containers_character_idx").on(table.character_id),
    ecs_service_idx: index("containers_ecs_service_idx").on(
      table.ecs_service_arn,
    ),
    ecr_repository_idx: index("containers_ecr_repository_idx").on(
      table.ecr_repository_uri,
    ),
    project_name_idx: index("containers_project_name_idx").on(table.project_name),
    user_project_idx: index("containers_user_project_idx").on(table.user_id, table.project_name),
  }),
);
