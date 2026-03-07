export async function runUsagePoll(): Promise<{ orgsPolled: number; membersPolled: number; snapshotsCreated: number; errors: number }> {
  console.log("[usage-poll] REMOVED in v4 — all usage metered by proxy in real time");
  return { orgsPolled: 0, membersPolled: 0, snapshotsCreated: 0, errors: 0 };
}
