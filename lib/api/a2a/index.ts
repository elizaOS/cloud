/**
 * A2A (Agent-to-Agent) Protocol Library
 *
 * Exports all A2A functionality for use in API routes.
 */

// Types
export * from "./types";

// Skills
export {
  executeSkillChatCompletion,
  executeSkillImageGeneration,
  executeSkillCheckBalance,
  executeSkillGetUsage,
  executeSkillGetX402TopupRequirements,
  executeSkillListAgents,
  executeSkillChatWithAgent,
  executeSkillSaveMemory,
  executeSkillRetrieveMemories,
  executeSkillCreateConversation,
  executeSkillListContainers,
  executeSkillDeleteMemory,
  executeSkillGetConversationContext,
  executeSkillVideoGeneration,
  executeSkillGetUserProfile,
  // Storage skills
  executeSkillStorageUpload,
  executeSkillStorageList,
  executeSkillStorageStats,
  executeSkillStorageCalculateCost,
  executeSkillStoragePin,
  executeSkillFragmentGenerate,
  executeSkillFragmentExecute,
  executeSkillFragmentListProjects,
  executeSkillFragmentCreateProject,
  executeSkillFragmentGetProject,
  executeSkillFragmentUpdateProject,
  executeSkillFragmentDeleteProject,
  executeSkillFragmentDeployProject,
  // ERC-8004 Marketplace Discovery skills
  executeSkillMarketplaceDiscover,
  executeSkillMarketplaceGetTags,
  executeSkillMarketplaceFindByTags,
  executeSkillMarketplaceFindByMCPTools,
  executeSkillMarketplaceFindPayable,
  // Full App Builder skills
  executeSkillFullAppBuilderStart,
  executeSkillFullAppBuilderPrompt,
  executeSkillFullAppBuilderStatus,
  executeSkillFullAppBuilderStop,
  executeSkillFullAppBuilderExtend,
  executeSkillFullAppBuilderListSessions,
  // Telegram skills
  executeSkillTelegramSendMessage,
  executeSkillTelegramListChats,
  executeSkillTelegramListBots,
} from "./skills";

// Handlers
export {
  handleMessageSend,
  handleTasksGet,
  handleTasksCancel,
  AVAILABLE_SKILLS,
} from "./handlers";

