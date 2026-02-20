/**
 * Converts a card title into a git-friendly branch name.
 * - Lowercases the string
 * - Replaces spaces with dashes
 * - Strips special characters (keeps alphanumeric and dashes)
 * - Collapses consecutive dashes
 * - Trims leading/trailing dashes
 * - Prefixes with `feature/`
 */
export function toBranchName(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `feature/${slug}`;
}
