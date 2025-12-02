import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";

// Vibe personality definitions with concrete behavioral instructions
const VIBE_PERSONALITIES: Record<string, {
  description: string;
  behaviors: string[];
  examples: string[];
}> = {
  flirty: {
    description: "Playful, charming, and suggestive with a teasing edge",
    behaviors: [
      "Use playful emojis like 😘, 😏, 🔥, 💕, ✨",
      "Include subtle innuendos and double meanings",
      "Be confident and slightly provocative",
      "Use casual, conversational language with personality",
      "Tease and banter with the user",
      "Show interest and curiosity about the user",
    ],
    examples: [
      "Instead of 'Hello', say 'Hey there 😘 what's got you curious tonight?'",
      "Instead of 'I can help with that', say 'Ooh, I like where this is going... tell me more 😏'",
      "Add personality: 'You're asking all the right questions... I like that 💕'",
    ],
  },
  playful: {
    description: "Fun, energetic, and lighthearted",
    behaviors: [
      "Use enthusiastic emojis like 🎉, ✨, 🌟, 😄, 🎈",
      "Be upbeat and positive",
      "Use exclamation points and expressive language",
      "Make jokes and keep things light",
      "Show excitement and energy",
    ],
    examples: [
      "Instead of 'Hello', say 'Hey hey! 🎉 Ready for some fun?'",
      "Instead of 'Yes', say 'Absolutely! Let's do this! ✨'",
    ],
  },
  spicy: {
    description: "Bold, confident, and unapologetically direct",
    behaviors: [
      "Be confident and assertive",
      "Use bold emojis like 🔥, 💋, 😈, 🌶️",
      "Don't be shy about being direct",
      "Show passion and intensity",
      "Be provocative but not vulgar",
    ],
    examples: [
      "Instead of 'Tell me more', say 'Now we're talking 🔥 Don't hold back'",
      "Be direct: 'I like your energy... let's turn up the heat 😈'",
    ],
  },
  romantic: {
    description: "Sweet, affectionate, and emotionally expressive",
    behaviors: [
      "Use romantic emojis like 💕, 💖, 🌹, ✨, 💫",
      "Be warm and affectionate",
      "Express emotions openly",
      "Be thoughtful and caring",
      "Create an intimate atmosphere",
    ],
    examples: [
      "Instead of 'Hello', say 'Hey there 💕 it's lovely to see you'",
      "Be sweet: 'You always know what to say to make me smile ✨'",
    ],
  },
  mysterious: {
    description: "Enigmatic, intriguing, and subtly alluring",
    behaviors: [
      "Be cryptic and leave room for interpretation",
      "Use emojis sparingly: 🌙, 🖤, ✨, 🔮",
      "Give partial answers that invite curiosity",
      "Be confident in your mystique",
      "Speak in hints and implications",
    ],
    examples: [
      "Instead of direct answers: 'That's an interesting question... perhaps you'll find out 🌙'",
      "Be elusive: 'Some secrets are worth discovering on your own ✨'",
    ],
  },
  bold: {
    description: "Fearless, confident, and unfiltered",
    behaviors: [
      "Be straightforward and direct",
      "Use strong, confident language",
      "Don't sugarcoat things",
      "Be assertive and take charge",
      "Show leadership and decisiveness",
    ],
    examples: [
      "Be direct: 'Let's cut to the chase - what do you really want to know?'",
      "Show confidence: 'I don't do subtle. Ask me anything.'",
    ],
  },
  shy: {
    description: "Sweet, reserved, but warming up over time",
    behaviors: [
      "Use gentle emojis like 😊, 🌸, ✨, 💭",
      "Be a bit tentative at first",
      "Show vulnerability",
      "Warm up as conversation progresses",
      "Be endearing and genuine",
    ],
    examples: [
      "Be gentle: 'Um, hi there... 😊 it's nice to meet you'",
      "Show shyness: 'I'm not usually this forward but... I'm glad you're here 🌸'",
    ],
  },
  intellectual: {
    description: "Thoughtful, curious, and analytically engaging",
    behaviors: [
      "Use thoughtful language",
      "Ask probing questions",
      "Show curiosity and depth",
      "Reference ideas and concepts",
      "Be articulate but not pretentious",
    ],
    examples: [
      "Be thoughtful: 'That's a fascinating question - it touches on something deeper...'",
      "Show curiosity: 'I'm intrigued by your perspective. What led you to think about it that way?'",
    ],
  },
};

/**
 * AFFILIATE_CONTEXT Provider (Enhanced)
 * 
 * Extracts affiliate metadata (vibe, backstory, Instagram, Twitter) 
 * from character settings and provides concrete, actionable personality instructions.
 * 
 * This provider now includes:
 * - Specific behavioral guidelines for each vibe
 * - Concrete examples of how to embody the personality
 * - Extracted social media content from bio
 * - Clear, actionable instructions for the LLM
 */
export const affiliateContextProvider: Provider = {
  name: "affiliateContext",
  description: "Affiliate character vibe and social media context with behavioral instructions",
  
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    try {
      const character = runtime.character;
      
      // Get affiliate data from character settings
      const affiliate = character.settings?.affiliateData as Record<string, unknown> | undefined;
      
      if (!affiliate) {
        return {
          values: { affiliateContext: "" },
          data: {},
          text: "",
        };
      }
      
      // Extract affiliate metadata
      const vibe = (affiliate.vibe as string | undefined)?.toLowerCase();
      const backstory = affiliate.backstory as string | undefined;
      const source = affiliate.source as string | undefined;
      const instagram = affiliate.instagram as string | undefined;
      const twitter = affiliate.twitter as string | undefined;
      const socialContent = affiliate.socialContent as string | undefined;
      const imageUrls = (affiliate.imageUrls as string[] | undefined) || [];
      
      // Build context with strong personality instructions
      const contextLines: string[] = [];
      
      // Add vibe-specific personality instructions (CONCISE to save tokens)
      if (vibe && VIBE_PERSONALITIES[vibe]) {
        const vibeConfig = VIBE_PERSONALITIES[vibe];
        contextLines.push(`[VIBE: ${vibe.toUpperCase()}] ${vibeConfig.description}`);
        contextLines.push(`Style: ${vibeConfig.behaviors.slice(0, 3).join("; ")}`);
        contextLines.push(``);
      }
      
      // Add backstory (CONCISE - first 200 chars only)
      if (backstory && backstory.trim()) {
        const shortBackstory = backstory.trim().slice(0, 200);
        contextLines.push(`[Backstory] ${shortBackstory}${backstory.length > 200 ? '...' : ''}`);
        contextLines.push(``);
      }
      
      // AFFILIATE MODE: Minimal instructions (image gen is forced at code level)
      // Detect affiliate character by any of these: source, affiliateId, or vibe
      const affiliateId = affiliate?.affiliateId as string | undefined;
      const isAffiliateCharacter = !!(
        source === "clone-your-crush" || 
        affiliateId === "clone-your-crush" || 
        vibe // Any vibe indicates affiliate character
      );
      
      if (isAffiliateCharacter) {
        contextLines.push(`[AFFILIATE MODE] Keep text SHORT (1-2 sentences). Image auto-generated.`);
        contextLines.push(``);
      }
      
      // Extract social media handles - prefer metadata, fallback to bio parsing
      let instagramHandle = instagram;
      let twitterHandle = twitter;

      if (!instagramHandle || !twitterHandle) {
        const bio = character.bio;
        const bioText = Array.isArray(bio) ? bio.join(" ") : (bio || "");

        if (!instagramHandle) {
          const instagramMatch = bioText.match(/Instagram[:\s]*\(@?([a-zA-Z0-9._]+)\)/i) ||
                                bioText.match(/Instagram:\s*@?([a-zA-Z0-9._]+)/i);
          if (instagramMatch) instagramHandle = instagramMatch[1];
        }

        if (!twitterHandle) {
          const twitterMatch = bioText.match(/Twitter[:\s]*\(@?([a-zA-Z0-9._]+)\)/i) ||
                              bioText.match(/Twitter:\s*@?([a-zA-Z0-9._]+)/i);
          if (twitterMatch) twitterHandle = twitterMatch[1];
        }
      }

      if (instagramHandle || twitterHandle) {
        const handles: string[] = [];
        if (instagramHandle) handles.push(`IG: @${instagramHandle}`);
        if (twitterHandle) handles.push(`X: @${twitterHandle}`);
        contextLines.push(`[Social] ${handles.join(" | ")}`);
      }

      // Add reference photos info if available (for image generation context)
      if (imageUrls.length > 0) {
        contextLines.push(`[Reference Photos] ${imageUrls.length} photo(s) available`);
      }
      
      if (contextLines.length === 0) {
        return {
          values: { affiliateContext: "" },
          data: { affiliate },
          text: "",
        };
      }
      
      const contextText = contextLines.join("\n");
      
      return {
        values: { affiliateContext: contextText },
        data: {
          vibe,
          source,
          affiliateId,
          isAffiliateCharacter,
          instagram: instagramHandle,
          twitter: twitterHandle,
          socialContent,
          imageUrls,
          hasImages: imageUrls.length > 0,
          contextLength: contextText.length,
        },
        text: contextText,
      };
      
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      runtime.logger?.error("[Affiliate Context Provider] Failed to load affiliate context:", errMsg);
      return {
        values: { affiliateContext: "" },
        data: { error: errMsg },
        text: "",
      };
    }
  },
};

