import { z } from "zod";

export const BudgetSnapshotSchema = z.object({
  remaining_cents: z.number().int().nonnegative(),
  total_cents: z.number().int().nonnegative(),
  currency: z.literal("usd"),
  period_end: z.string(),
  requests_remaining: z.number().int().nonnegative().nullable(),
  rate_limit_per_min: z.number().int().positive(),
  concurrency_limit: z.number().int().positive(),
  voucher_expires_at: z.string().nullable(),
});
export type BudgetSnapshot = z.infer<typeof BudgetSnapshotSchema>;

const TextContent = z.object({ type: z.literal("text"), text: z.string() });
const ImageContent = z.object({
  type: z.literal("image_url"),
  image_url: z.union([z.string(), z.object({ url: z.string(), detail: z.string().optional() })]),
});
const ToolUseContent = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.any()).optional(),
});
const ToolResultContent = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(z.any())]).optional(),
});

const ContentPart = z.union([TextContent, ImageContent, ToolUseContent, ToolResultContent, z.record(z.any())]);

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.union([z.string(), z.array(ContentPart)]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatToolInputSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  model: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  system: z.string().optional(),
  response_format: z.object({
    type: z.enum(["text", "json_object", "json_schema"]),
    json_schema: z.record(z.any()).optional(),
  }).optional(),
  tools: z.array(z.record(z.any())).optional(),
  tool_choice: z.union([
    z.enum(["auto", "none", "required"]),
    z.object({ type: z.literal("function"), function: z.object({ name: z.string() }) }),
  ]).optional(),
  stream: z.boolean().optional().default(false),
});

export const CompareModelsInputSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  models: z.array(z.string()).min(2).max(5),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const RecommendModelInputSchema = z.object({
  task_description: z.string().min(10).max(1000),
  expected_output_length: z.enum(["short", "medium", "long"]).optional().default("medium"),
  needs_vision: z.boolean().optional().default(false),
  needs_tools: z.boolean().optional().default(false),
  prefer: z.enum(["cheapest", "fastest", "smartest"]).optional().default("smartest"),
});

export const VoucherInfoInputSchema = z.object({
  code: z.string().min(1),
});

export const RedeemVoucherInputSchema = z.object({
  code: z.string().min(1),
  idempotency_key: z.string().min(8).max(128),
});

export const RedeemAndChatInputSchema = z.object({
  code: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  model: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  idempotency_key: z.string().min(8).max(128),
});

export const RequestTopupInputSchema = z.object({
  amount_cents_requested: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
  idempotency_key: z.string().min(8).max(128),
});

export const RecentUsageInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  since: z.string().optional(),
});

export const EmptyInputSchema = z.object({});
