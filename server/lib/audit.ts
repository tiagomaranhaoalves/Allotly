import { storage } from "../storage";

export async function logAudit(params: {
  orgId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, any>;
}) {
  return storage.createAuditLog({
    orgId: params.orgId,
    actorId: params.actorId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: params.metadata,
  });
}
