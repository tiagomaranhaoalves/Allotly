import { z } from "zod";

const cacheControlSchema = z.object({
  type: z.literal("ephemeral"),
}).passthrough();

const textBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  cache_control: cacheControlSchema.optional(),
  citations: z.array(z.any()).optional(),
}).passthrough();

const imageSourceBase64 = z.object({
  type: z.literal("base64"),
  media_type: z.string(),
  data: z.string(),
}).passthrough();

const imageSourceUrl = z.object({
  type: z.literal("url"),
  url: z.string(),
}).passthrough();

const imageBlockSchema = z.object({
  type: z.literal("image"),
  source: z.union([imageSourceBase64, imageSourceUrl, z.any()]),
  cache_control: cacheControlSchema.optional(),
}).passthrough();

const toolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.any(),
  cache_control: cacheControlSchema.optional(),
}).passthrough();

const toolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(z.any())]).optional(),
  is_error: z.boolean().optional(),
  cache_control: cacheControlSchema.optional(),
}).passthrough();

const thinkingBlockSchema = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
  signature: z.string().optional(),
}).passthrough();

const documentBlockSchema = z.object({
  type: z.literal("document"),
  source: z.any(),
  cache_control: cacheControlSchema.optional(),
  citations: z.any().optional(),
}).passthrough();

const contentBlockSchema = z.union([
  textBlockSchema,
  imageBlockSchema,
  toolUseBlockSchema,
  toolResultBlockSchema,
  thinkingBlockSchema,
  documentBlockSchema,
  z.object({ type: z.string() }).passthrough(),
]);

const messageContentSchema = z.union([
  z.string(),
  z.array(contentBlockSchema),
]);

const systemContentSchema = z.union([
  z.string(),
  z.array(textBlockSchema),
]);

const toolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  input_schema: z.any(),
  cache_control: cacheControlSchema.optional(),
}).passthrough();

const toolChoiceSchema = z.union([
  z.object({ type: z.literal("auto") }).passthrough(),
  z.object({ type: z.literal("any") }).passthrough(),
  z.object({ type: z.literal("none") }).passthrough(),
  z.object({ type: z.literal("tool"), name: z.string() }).passthrough(),
]);

export const anthropicMessagesRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: messageContentSchema,
  })).min(1, "messages must be a non-empty array"),
  system: systemContentSchema.optional(),
  max_tokens: z.number().int().min(1, "max_tokens must be at least 1"),
  metadata: z.any().optional(),
  stop_sequences: z.array(z.string()).optional(),
  stream: z.boolean().optional().default(false),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  tools: z.array(toolSchema).optional(),
  tool_choice: toolChoiceSchema.optional(),
  thinking: z.any().optional(),
}).passthrough();

export type AnthropicMessagesRequest = z.infer<typeof anthropicMessagesRequestSchema>;

export const ANTHROPIC_NATIVE_FIELDS = ["cache_control", "thinking", "citations"] as const;

export const ANTHROPIC_STREAM_EVENTS = [
  "message_start",
  "content_block_start",
  "content_block_delta",
  "content_block_stop",
  "message_delta",
  "message_stop",
  "ping",
  "error",
] as const;

export type AnthropicStreamEvent = typeof ANTHROPIC_STREAM_EVENTS[number];
