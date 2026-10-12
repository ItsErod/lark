export function messageMarkdown(input: { authorName: string; timestamp: string; content: string }, meta: boolean): string {
  const body = input.content.replace(/\r\n/g, "\n").slice(0, 4000);
  if (!meta) return body;
  const name = input.authorName.trim().slice(0, 80) || "Someone";
  const when = input.timestamp.trim().slice(0, 40);
  return `**${name}**${when ? ` (${when})` : ""}\n\n${body}`;
}
