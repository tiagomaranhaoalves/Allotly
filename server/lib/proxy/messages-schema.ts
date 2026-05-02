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

// =============================================================================
// Response schema (non-streaming POST /v1/messages reply)
// =============================================================================

const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_creation_input_tokens: z.number().int().nonnegative().optional(),
  cache_read_input_tokens: z.number().int().nonnegative().optional(),
}).passthrough();

const stopReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "pause_turn",
  "refusal",
]).nullable();

const responseTextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  citations: z.array(z.any()).optional(),
}).passthrough();

const responseToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.any(),
}).passthrough();

const responseThinkingBlockSchema = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
  signature: z.string().optional(),
}).passthrough();

const responseContentBlockSchema = z.union([
  responseTextBlockSchema,
  responseToolUseBlockSchema,
  responseThinkingBlockSchema,
  z.object({ type: z.string() }).passthrough(),
]);

export const anthropicMessagesResponseSchema = z.object({
  id: z.string(),
  type: z.literal("message"),
  role: z.literal("assistant"),
  model: z.string(),
  content: z.array(responseContentBlockSchema),
  stop_reason: stopReasonSchema,
  stop_sequence: z.string().nullable().optional(),
  usage: usageSchema,
}).passthrough();

export type AnthropicMessagesResponse = z.infer<typeof anthropicMessagesResponseSchema>;

export const anthropicErrorResponseSchema = z.object({
  type: z.literal("error"),
  error: z.object({
    type: z.string(),
    message: z.string(),
  }).passthrough(),
}).passthrough();

export type AnthropicErrorResponse = z.infer<typeof anthropicErrorResponseSchema>;

// =============================================================================
// Streaming event union schemas — one schema per SSE event type, plus a
// discriminated union over `type`.
// =============================================================================

export const messageStartEventSchema = z.object({
  type: z.literal("message_start"),
  message: z.object({
    id: z.string(),
    type: z.literal("message"),
    role: z.literal("assistant"),
    model: z.string(),
    content: z.array(responseContentBlockSchema),
    stop_reason: stopReasonSchema,
    stop_sequence: z.string().nullable().optional(),
    usage: usageSchema,
  }).passthrough(),
}).passthrough();

export const contentBlockStartEventSchema = z.object({
  type: z.literal("content_block_start"),
  index: z.number().int().nonnegative(),
  content_block: responseContentBlockSchema,
}).passthrough();

const textDeltaSchema = z.object({
  type: z.literal("text_delta"),
  text: z.string(),
}).passthrough();

const inputJsonDeltaSchema = z.object({
  type: z.literal("input_json_delta"),
  partial_json: z.string(),
}).passthrough();

const thinkingDeltaSchema = z.object({
  type: z.literal("thinking_delta"),
  thinking: z.string(),
}).passthrough();

const signatureDeltaSchema = z.object({
  type: z.literal("signature_delta"),
  signature: z.string(),
}).passthrough();

const citationsDeltaSchema = z.object({
  type: z.literal("citations_delta"),
  citation: z.any(),
}).passthrough();

export const contentBlockDeltaEventSchema = z.object({
  type: z.literal("content_block_delta"),
  index: z.number().int().nonnegative(),
  delta: z.union([
    textDeltaSchema,
    inputJsonDeltaSchema,
    thinkingDeltaSchema,
    signatureDeltaSchema,
    citationsDeltaSchema,
    z.object({ type: z.string() }).passthrough(),
  ]),
}).passthrough();

export const contentBlockStopEventSchema = z.object({
  type: z.literal("content_block_stop"),
  index: z.number().int().nonnegative(),
}).passthrough();

export const messageDeltaEventSchema = z.object({
  type: z.literal("message_delta"),
  delta: z.object({
    stop_reason: stopReasonSchema.optional(),
    stop_sequence: z.string().nullable().optional(),
  }).passthrough(),
  usage: usageSchema.partial().passthrough().optional(),
}).passthrough();

export const messageStopEventSchema = z.object({
  type: z.literal("message_stop"),
}).passthrough();

export const pingEventSchema = z.object({
  type: z.literal("ping"),
}).passthrough();

export const errorEventSchema = z.object({
  type: z.literal("error"),
  error: z.object({
    type: z.string(),
    message: z.string(),
  }).passthrough(),
}).passthrough();

/**
 * Discriminated union over all Anthropic SSE event payloads. The wire format
 * frames each as `event: <name>\ndata: <json>\n\n`; this schema validates the
 * `data` JSON only, since that is where the `type` discriminator lives.
 */
export const anthropicStreamEventSchema = z.discriminatedUnion("type", [
  messageStartEventSchema,
  contentBlockStartEventSchema,
  contentBlockDeltaEventSchema,
  contentBlockStopEventSchema,
  messageDeltaEventSchema,
  messageStopEventSchema,
  pingEventSchema,
  errorEventSchema,
]);

export type AnthropicStreamEventData = z.infer<typeof anthropicStreamEventSchema>;
