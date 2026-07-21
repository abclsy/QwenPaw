import type { TFunction } from "i18next";

const defaultConfig = {
  theme: {
    colorPrimary: "#1961AC",
    darkMode: false,
    prefix: "qwenpaw",
    leftHeader: {
      logo: "",
      title: "Work with 小铁智友",
    },
  },
  sender: {
    attachments: true,
    maxLength: 10000,
    disclaimer: "Works for you, grows with you",
  },
  welcome: {
    greeting: "Hello, I'm 小铁智友 🐾",
    description:
      "Your smart work assistant — I can help with coding, documents, data analysis, and task management. Just tell me what you need!",
    avatar: "/online.svg",
    prompts: [
      {
        value: "What can you do? Tell me about your features.",
      },
      {
        value: "Help me create a project task list template.",
      },
      {
        value: "What should I focus on today?",
      },
    ],
  },
  api: {
    baseURL: "",
    token: "",
  },
} as const;

class ChatConfigProvider {
  getGreeting(t: TFunction): string {
    return t("chat.greeting");
  }

  getDescription(t: TFunction): string {
    return t("chat.description");
  }

  getPrompts(t: TFunction): Array<{ value: string }> {
    return [
      { value: t("chat.prompt1") },
      { value: t("chat.prompt2") },
      { value: t("chat.prompt3") },
    ];
  }

  getConfig(t: TFunction) {
    return {
      ...defaultConfig,
      sender: {
        ...defaultConfig.sender,
        disclaimer: t("chat.disclaimer"),
      },
      welcome: {
        ...defaultConfig.welcome,
        greeting: this.getGreeting(t),
        description: this.getDescription(t),
        prompts: this.getPrompts(t),
      },
    };
  }
}

const configProvider = new ChatConfigProvider();

export function getDefaultConfig(t: TFunction) {
  return configProvider.getConfig(t);
}

export default defaultConfig;

export type DefaultConfig = typeof defaultConfig;

// Export provider for extension
export { configProvider };
