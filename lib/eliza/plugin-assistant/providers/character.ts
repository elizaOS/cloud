import type { IAgentRuntime, Memory, Provider, State } from '@elizaos/core';
import { addHeader, ChannelType } from '@elizaos/core';

/**
 * Character provider object.
 * @typedef {Object} Provider
 * @property {string} name - The name of the provider ("CHARACTER").
 * @property {string} description - Description of the character information.
 * @property {Function} get - Async function to get character information.
 */
/**
 * Provides character information.
 * @param {IAgentRuntime} runtime - The agent runtime.
 * @param {Memory} message - The message memory.
 * @param {State} state - The state of the character.
 * @returns {Object} Object containing values, data, and text sections.
 */
export const characterProvider: Provider = {
  name: 'CHARACTER',
  description: 'Character information',
  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    const character = runtime.character;

    // Character name
    const agentName = character.name;

    // Handle bio (string or random selection from array)
    const bioText = Array.isArray(character.bio)
      ? character.bio
          .sort(() => 0.5 - Math.random())
          .slice(0, 10)
          .join(' ')
      : character.bio || '';

    const bio = addHeader(`# About ${character.name}`, bioText);

    // System prompt
    const system = character.system ?? '';

    // Select random topic if available
    const topicString =
      character.topics && character.topics.length > 0
        ? character.topics[Math.floor(Math.random() * character.topics.length)]
        : null;

    const topic = topicString || '';

    // Format topics list
    const topics =
      character.topics && character.topics.length > 0
        ? `${character.name} is also interested in ${character.topics
            .filter((topic) => topic !== topicString)
            .sort(() => 0.5 - Math.random())
            .slice(0, 5)
            .map((topic, index, array) => {
              if (index === array.length - 2) {
                return `${topic} and `;
              }
              if (index === array.length - 1) {
                return topic;
              }
              return `${topic}, `;
            })
            .join('')}`
        : '';

    // Select random adjective if available
    const adjectiveString =
      character.adjectives && character.adjectives.length > 0
        ? character.adjectives[Math.floor(Math.random() * character.adjectives.length)]
        : '';

    const adjective = adjectiveString || '';

    const messageDirections =
      (character?.style?.all?.length && character?.style?.all?.length > 0) ||
      (character?.style?.chat?.length && character?.style?.chat?.length > 0)
        ? addHeader(
            `# Message Directions for ${character.name}`,
            (() => {
              const all = character?.style?.all || [];
              const chat = character?.style?.chat || [];
              return [...all, ...chat].join('\n');
            })()
          )
        : '';

    const directions = messageDirections;

    const values = {
      agentName,
      bio,
      system,
      topic,
      topics,
      adjective,
      messageDirections,
      directions,
    };

    const data = {
      bio,
      adjective,
      topic,
      topics,
      character,
      directions,
      system,
    };

    const topicSentence = topicString
      ? `${character.name} is currently interested in ${topicString}`
      : '';
    const adjectiveSentence = adjectiveString ? `${character.name} is ${adjectiveString}` : '';
    // Combine all text sections
    const text = [bio, adjectiveSentence, topicSentence, topics, directions, system]
      .filter(Boolean)
      .join('\n\n');

    return {
      values,
      data,
      text,
    };
  },
};
