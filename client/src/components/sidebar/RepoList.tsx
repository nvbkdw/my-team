import { useEffect, useState } from 'react';
import { useRepoStore } from '../../stores/repoStore.js';

export default function RepoList() {
  const repos = useRepoStore((s) => s.repos);
  const loading = useRepoStore((s) => s.loading);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  if (loading && repos.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-gray-400">Loading repos...</p>
    );
  }

  if (repos.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-gray-400">No repos added yet.</p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {repos.map((repo) => (
        <li key={repo.id}>
          <button
            onClick={() =>
              setExpandedId(expandedId === repo.id ? null : repo.id)
            }
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5 shrink-0 text-gray-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z"
                clipRule="evenodd"
              />
              <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />
            </svg>
            <span className="truncate">{repo.name}</span>
          </button>

          {expandedId === repo.id && (
            <div className="ml-7 mt-1 space-y-1 text-xs text-gray-500 dark:text-gray-400 pb-1">
              <p className="truncate" title={repo.local_path}>
                {repo.local_path}
              </p>
              {repo.github_owner && repo.github_repo && (
                <p>
                  {repo.github_owner}/{repo.github_repo}
                </p>
              )}
              <p>Branch: {repo.default_branch}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
