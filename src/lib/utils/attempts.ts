export function getAttemptCreationMs(attempt: { id?: string; createdAt?: string; timestamp?: string }): number {
  if (attempt.createdAt) {
    const parsed = new Date(attempt.createdAt).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (attempt.id) {
    const match = String(attempt.id).match(/(\d{10,})/);
    if (match) {
      const parsedId = parseInt(match[1], 10);
      if (!isNaN(parsedId) && parsedId > 0) return parsedId;
    }
  }
  if (attempt.timestamp) {
    const parsed = new Date(attempt.timestamp).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
}
