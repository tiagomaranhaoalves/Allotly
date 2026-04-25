import crypto from "crypto";
import { processChatCompletion, type ProcessChatCompletionResult } from "../proxy/handler";
import type { TeamMembership } from "@shared/schema";

export interface BridgedChatInput {
  membership: TeamMembership;
  userId: string;
  apiKeyId: string;
  body: any;
}

export async function callChatCompletion(input: BridgedChatInput): Promise<ProcessChatCompletionResult> {
  return processChatCompletion({
    membership: input.membership,
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    body: input.body,
    stream: false,
    requestId: crypto.randomUUID(),
  });
}

export type { ProcessChatCompletionResult };
