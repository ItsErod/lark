export function outgoingError(content: string, fileCount: number, fileBytes: number): string | null {
  if ([...content].length > 2000) return "Messages are limited to 2,000 characters.";
  if (!content.trim() && fileCount === 0) return "Write a message or attach a file.";
  if (fileCount > 4) return "Lark sends up to 4 files at a time.";
  if (fileBytes > 8 * 1024 * 1024) return "Attachments are limited to 8 MB in this version.";
  return null;
}
