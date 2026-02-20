/**
 * Converts a card title into a safe git branch name.
 *
 * Rules:
 * - Lowercase the entire string
 * - Replace whitespace runs with a single dash
 * - Strip characters that are invalid in git branch names
 * - Collapse consecutive dashes
 * - Trim leading/trailing dashes
 * - Prefix with `feature/`
 */
export function toBranchName(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `feature/${slug}`;
}
