export interface PromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  render: (args: Record<string, string>) => { description: string; messages: Array<{ role: "user" | "assistant"; content: { type: "text"; text: string } }> };
}

const QUICKSTART_ME: PromptDefinition = {
  name: "quickstart-me",
  description: "Walk me through what my Allotly voucher gives me and suggest a first prompt to try.",
  render: () => ({
    description: "Allotly quickstart walkthrough",
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: "Welcome! I'll help you get started with your Allotly voucher. First, call the `quickstart` tool to see what you have available, then frame the result conversationally and suggest one of the sample prompts to try via the `chat` tool.",
      },
    }],
  }),
};

const COMPARE: PromptDefinition = {
  name: "compare",
  description: "Run the same question against multiple models and present the answers side-by-side.",
  arguments: [
    { name: "question", description: "The prompt to send to every model", required: true },
    { name: "models", description: "Comma-separated list of models (2-5)", required: false },
  ],
  render: (args) => {
    const question = args.question || "";
    const models = args.models || "auto";
    return {
      description: "Side-by-side model comparison",
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Call the \`compare_models\` tool with messages=[{role:"user",content:${JSON.stringify(question)}}] and models=${models === "auto" ? "the user's top 3 allowed models by tier (call list_available_models first if needed)" : `["${models.split(",").map(m => m.trim()).join('","')}"]`}. Then present each model's answer in a comparison table along with the per-model cost.`,
        },
      }],
    };
  },
};

const DEBATE_PATTERN: PromptDefinition = {
  name: "debate-pattern",
  description: "Educational pattern for orchestrating a multi-model debate using the chat tool.",
  arguments: [
    { name: "topic", description: "The debate topic", required: false },
    { name: "rounds", description: "Number of rounds (default 3)", required: false },
  ],
  render: (args) => {
    const topic = args.topic || "<topic>";
    const rounds = args.rounds || "3";
    return {
      description: "Host-orchestrated debate using chat tool",
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `I'll orchestrate a debate between models you choose, with you steering. I will use the \`chat\` tool for each turn — every round will deduct from your Allotly voucher. Topic: ${topic}. Rounds: ${rounds}. Confirm the participants, the topic, and the number of rounds before I begin. After each round, I'll summarise the strongest argument and ask whether to continue.`,
        },
      }],
    };
  },
};

const PROMPTS: Record<string, PromptDefinition> = {
  "quickstart-me": QUICKSTART_ME,
  "compare": COMPARE,
  "debate-pattern": DEBATE_PATTERN,
};

export function listPrompts(): PromptDefinition[] {
  return Object.values(PROMPTS);
}

export function getPrompt(name: string): PromptDefinition | undefined {
  return PROMPTS[name];
}
