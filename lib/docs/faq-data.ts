/**
 * FAQ Data
 * Structured FAQ content for the accordion component
 */

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQSection {
  title: string;
  items: FAQItem[];
}

export const faqData: FAQSection[] = [
  {
    title: "Getting Started",
    items: [
      {
        question: "What is elizaOS Platform?",
        answer: "elizaOS Platform is a complete solution for building and deploying AI agents. You can create custom AI personalities, generate content, and integrate AI into your applications.",
      },
      {
        question: "Do I need coding experience?",
        answer: "No! Our visual Character Creator and dashboard make it easy for anyone to create AI agents. Developers can use our API for advanced integrations.",
      },
      {
        question: "How do I get started?",
        answer: "Sign up for a free account, get 100 free credits to explore, try the AI Chat, and create your first character with the Character Creator.",
      },
      {
        question: "Is there a free trial?",
        answer: "Yes! New users get 100 free credits to test all features. No credit card required to start.",
      },
    ],
  },
  {
    title: "Credits & Billing",
    items: [
      {
        question: "How much do credits cost?",
        answer: "Credits start at $10 for 1,000 credits. Larger packs offer better value. See our Pricing page for details.",
      },
      {
        question: "What can I do with 1,000 credits?",
        answer: "With 1,000 credits you can have 200-500 AI chat messages, generate 100 images, create 20 short videos, or make plenty of API requests.",
      },
      {
        question: "Do credits expire?",
        answer: "No! Your credits never expire. Buy today, use them whenever you're ready.",
      },
      {
        question: "Can I get a refund?",
        answer: "Yes, we offer refunds for unused credits within 30 days of purchase. Contact support to request a refund.",
      },
      {
        question: "What payment methods do you accept?",
        answer: "We accept credit cards (Visa, Mastercard, Amex), debit cards, and digital wallets through Stripe.",
      },
    ],
  },
  {
    title: "Characters & Agents",
    items: [
      {
        question: "What is a character?",
        answer: "A character defines your AI agent's personality, knowledge, and behavior. It's like giving your AI a unique identity - how it talks, what it knows, and how it responds to users.",
      },
      {
        question: "How many characters can I create?",
        answer: "You can create unlimited characters on all plans!",
      },
      {
        question: "Can I share my characters?",
        answer: "Yes! Make your character public in the settings, and it will appear in the Marketplace.",
      },
      {
        question: "Can I use someone else's character?",
        answer: "Yes, if they've made it public. You can test it or use it as a template for your own.",
      },
      {
        question: "How do I make my character better?",
        answer: "Be specific about personality and purpose, provide conversation examples, test and iterate based on responses, and check out the Character Creator Guide.",
      },
    ],
  },
  {
    title: "API & Integration",
    items: [
      {
        question: "How do I get an API key?",
        answer: "Go to API Keys in your dashboard, click 'Create New Key', and copy your key. Keep it secure!",
      },
      {
        question: "Is the API free?",
        answer: "The API uses the same credit system as the dashboard. Check our Pricing page for rates.",
      },
      {
        question: "What's the rate limit?",
        answer: "60 requests per minute for standard users. Need more? Contact us about enterprise plans.",
      },
      {
        question: "Can I use the API in production?",
        answer: "Absolutely! Our API is production-ready and used by companies worldwide.",
      },
      {
        question: "Do you have SDKs?",
        answer: "Official SDKs are coming soon for Python, JavaScript/TypeScript, Ruby, and Go!",
      },
    ],
  },
  {
    title: "Features",
    items: [
      {
        question: "What AI models do you support?",
        answer: "We support multiple models including OpenAI (GPT-4, GPT-3.5), Anthropic (Claude), and Google (Gemini). You can select your preferred model in the chat interface.",
      },
      {
        question: "Can I generate images?",
        answer: "Yes! Use the Image Generator or the API. Images cost 10 credits each.",
      },
      {
        question: "Can I generate videos?",
        answer: "Yes! Our Video Generator can create short videos from text prompts.",
      },
      {
        question: "Can I upload my own data?",
        answer: "Yes! Use the Knowledge feature to upload documents that your AI agent can reference.",
      },
      {
        question: "Do you support voice/audio?",
        answer: "Yes! Voice cloning and text-to-speech features are available in the Voices section.",
      },
    ],
  },
  {
    title: "Privacy & Security",
    items: [
      {
        question: "Is my data safe?",
        answer: "Yes! We use industry-standard encryption and security practices. Your data is stored securely and never shared.",
      },
      {
        question: "Who can see my conversations?",
        answer: "Only you can see your private conversations. Unless you make a character public, it's completely private.",
      },
      {
        question: "Can I delete my data?",
        answer: "Yes! You can delete characters, conversations, and your entire account at any time from Account Settings.",
      },
      {
        question: "Do you use my data to train models?",
        answer: "No! We do not use your data to train AI models. Your conversations remain private.",
      },
    ],
  },
  {
    title: "Technical",
    items: [
      {
        question: "What happens if I run out of credits?",
        answer: "Your requests will pause until you add more credits. Your data and characters remain safe!",
      },
      {
        question: "Why is my response slow?",
        answer: "High demand periods may cause delays, complex prompts take longer to process, and video generation takes 1-5 minutes.",
      },
      {
        question: "Can I cancel a generation in progress?",
        answer: "Yes, but the credits may still be deducted. Complex generations like video cannot be cancelled mid-process.",
      },
      {
        question: "What browsers do you support?",
        answer: "We support all modern browsers: Chrome (recommended), Firefox, Safari, and Edge.",
      },
      {
        question: "Is there a mobile app?",
        answer: "Not yet, but our web app works great on mobile browsers!",
      },
    ],
  },
  {
    title: "Organizations & Teams",
    items: [
      {
        question: "Can I add team members?",
        answer: "Yes! Invite team members to your organization in Organization Settings.",
      },
      {
        question: "Do team members share credits?",
        answer: "Yes, all organization members share the same credit pool.",
      },
      {
        question: "Can I set permissions for team members?",
        answer: "Currently, all members have the same access. Granular permissions are coming soon!",
      },
      {
        question: "How many team members can I have?",
        answer: "No limit! Add as many team members as you need.",
      },
    ],
  },
];

