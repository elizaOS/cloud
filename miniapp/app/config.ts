export interface SiteConfig {
  name: string;
  shortName: string;
  url: string;
  description: string;
  ogImage: string;
  icons: {
    favicon: string;
    appleTouchIcon: string;
  };
  author: {
    name: string;
    twitter: string;
  };
  hero: {
    headline: string;
    subheadline: string;
    imageAlt: string;
  };
  sharing: {
    defaultText: string;
  };
  links: {
    twitter: string;
    github: string;
    email: string;
  };
  keywords: string[];
}

export const siteConfig: SiteConfig = {
  name: "Create a Character",
  shortName: "FriendAI",
  url: "https://createacharacter.com",
  description:
    "Create a Character. Chat Tonight. Build your own AI character and start chatting in minutes.",
  ogImage: "/og.jpg",
  icons: {
    favicon: "/favicon.svg",
    appleTouchIcon: "/apple-touch-icon.png",
  },
  author: {
    name: "CreateACharacter",
    twitter: "@createacharacter",
  },
  hero: {
    headline: "Create a Friend",
    subheadline: "& Chat Right Away.",
    imageAlt: "Create a Character",
  },
  sharing: {
    defaultText: "I'm chatting with my AI friend! Create your own AI companion",
  },
  links: {
    twitter: "https://twitter.com/createacharacter",
    github: "https://github.com/createacharacter",
    email: "mailto:hello@createacharacter.com",
  },
  keywords: [
    "AI character",
    "AI companion",
    "virtual character",
    "AI chat",
    "create character",
    "AI conversation",
    "virtual companion",
    "chatbot",
  ],
};
