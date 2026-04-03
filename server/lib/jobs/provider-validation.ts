import { storage } from "../../storage";
import { getProviderAdapter } from "../providers";
import { decryptProviderKey } from "../encryption";
import { sendEmail, emailTemplates } from "../email";

export async function runProviderValidation(): Promise<void> {
  const orgs = await storage.getAllOrganizations();
  let validated = 0;
  let invalidated = 0;

  for (const org of orgs) {
    const connections = await storage.getProviderConnectionsByOrg(org.id);

    for (const conn of connections) {
      if (conn.status === "DISCONNECTED") continue;

      try {
        const decryptedKey = decryptProviderKey(conn.adminApiKeyEncrypted, conn.adminApiKeyIv, conn.adminApiKeyTag);
        const adapter = getProviderAdapter(conn.provider);

        const validationOptions = conn.provider === "AZURE_OPENAI" ? {
          baseUrl: conn.azureBaseUrl || undefined,
          deploymentName: ((conn.azureDeployments as any[])?.[0])?.deploymentName,
          apiVersion: conn.azureApiVersion || "2024-10-21",
          endpointMode: (conn.azureEndpointMode === "v1" && conn.azureBaseUrl?.includes("azure-api.net")) ? "legacy" : (conn.azureEndpointMode || "legacy"),
        } : undefined;

        const result = await adapter.validateAdminKey(decryptedKey, validationOptions);
        const isValid = result.valid;

        if (!isValid && conn.status === "ACTIVE") {
          await storage.updateProviderConnection(conn.id, { status: "INVALID" });
          invalidated++;

          await storage.createAuditLog({
            orgId: org.id,
            actorId: "system",
            action: "provider.validation_failed",
            targetType: "provider_connection",
            targetId: conn.id,
            metadata: { provider: conn.provider },
          });

          const rootAdmins = (await storage.getUsersByOrg(org.id)).filter(
            u => u.orgRole === "ROOT_ADMIN" && u.status === "ACTIVE"
          );
          for (const admin of rootAdmins) {
            const tmpl = emailTemplates.providerKeyInvalid(admin.name || admin.email, conn.provider, conn.id);
            await sendEmail(admin.email, tmpl.subject, tmpl.html);
          }
        } else if (isValid && conn.status === "INVALID") {
          await storage.updateProviderConnection(conn.id, { status: "ACTIVE" });
          validated++;
        } else {
          validated++;
        }
      } catch (e: any) {
        console.error(`[provider-validation] Error validating ${conn.provider} (${conn.id}):`, e.message);
      }
    }
  }

  if (validated > 0 || invalidated > 0) {
    console.log(`[provider-validation] Validated: ${validated}, Invalidated: ${invalidated}`);
  }
}
