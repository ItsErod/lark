export function outgoingError(content: string, fileCount: number, fileBytes: number, limitBytes = 10 * 1024 * 1024): string | null {
  return composedError(content, fileCount, fileBytes, 0, limitBytes);
}

/** `extras` counts stickers and a forward. Discord allows those with an empty body. */
export function composedError(content: string, fileCount: number, fileBytes: number, extras = 0, limitBytes = 10 * 1024 * 1024): string | null {
  if ([...content].length > 2000) return "Messages are limited to 2,000 characters.";
  if (!content.trim() && fileCount === 0 && extras <= 0) return "Write a message or attach a file.";
  if (fileCount > 4) return "Lark sends up to 4 files at a time.";
  if (extras > 3) return "Discord accepts up to 3 stickers.";
  if (fileBytes > limitBytes) {
    const mb = Math.max(1, Math.round(limitBytes / (1024 * 1024)));
    return `Attachments are limited to ${mb} MB on this account.`;
  }
  return null;
}

/** Discord marks a spoiler by prefixing the uploaded filename. */
export function spoilerUploadName(name: string, spoiler: boolean): string {
  const base = name.trim() || "file";
  if (!spoiler || base.startsWith("SPOILER_")) return base;
  return `SPOILER_${base}`;
}
