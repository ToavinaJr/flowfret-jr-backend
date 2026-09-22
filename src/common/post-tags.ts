const TAG_PATTERN = /(^|[^\p{L}\p{N}._%+-])@([\p{L}\p{N}_]{1,30})/gu;
const MAX_TAGS_PER_POST = 10;

export function extractPostTags(content: string | null | undefined): string[] {
  if (!content) return [];
  const tags: string[] = [];
  for (const match of content.matchAll(TAG_PATTERN)) {
    const name = match[2].normalize('NFKC').toLocaleLowerCase('en-US');
    if (!tags.includes(name)) tags.push(name);
    if (tags.length === MAX_TAGS_PER_POST) break;
  }
  return tags;
}
