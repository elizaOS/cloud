import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { isCreatorMode } from "../../shared/utils/helpers";

/**
 * Current Character Provider
 *
 * Returns clean JSON of current character fields for build mode.
 * In creator mode (building new character with Eliza), returns a blank template.
 */

const BLANK_CHARACTER_TEMPLATE = {
  name: "",
  bio: "",
  system: "",
  adjectives: [],
  topics: [],
  style: { all: [], chat: [], post: [] },
  messageExamples: [],
};

export const currentCharacterProvider: Provider = {
  name: "CURRENT_CHARACTER",
  description: "Current character JSON for build mode",
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    // In creator mode, show blank template (user is building a new character)
    if (isCreatorMode(runtime)) {
      const blankJSON = JSON.stringify(BLANK_CHARACTER_TEMPLATE, null, 2);

      return {
        text: `# New Character Template\n${blankJSON}`,
        values: {
          currentCharacter: blankJSON,
          isNewCharacter: true,
        },
        data: {
          characterFields: BLANK_CHARACTER_TEMPLATE,
          isNewCharacter: true,
        },
      };
    }

    // In build mode, show the actual character being edited
    const character = runtime.character;

    const characterFields = {
      name: character.name || "",
      bio: character.bio || "",
      system: character.system || "",
      adjectives: character.adjectives || [],
      topics: character.topics || [],
      style: character.style || { all: [], chat: [], post: [] },
      messageExamples: character.messageExamples || [],
    };

    const characterJSON = JSON.stringify(characterFields, null, 2);

    return {
      text: characterJSON,
      values: {
        currentCharacter: characterJSON,
        isNewCharacter: false,
      },
      data: {
        characterFields,
        character,
        isNewCharacter: false,
      },
    };
  },
};
