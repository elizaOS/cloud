import type { IAgentRuntime, Memory, Provider, State } from '@elizaos/core';

/**
 * Current Character Provider
 * Returns clean JSON of current character fields
 */
export const currentCharacterProvider: Provider = {
  name: 'CURRENT_CHARACTER',
  description: 'Current character JSON for build mode',
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    const character = runtime.character;

    const characterFields = {
      name: character.name || '',
      bio: character.bio || '',
      system: character.system || '',
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
      },
      data: {
        characterFields,
        character,
      },
    };
  },
};
