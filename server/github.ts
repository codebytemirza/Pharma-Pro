let cachedResolvedRepo: { raw: string; resolved: string } | null = null;

/**
 * Resolves a GitHub repository string into "owner/repo" format.
 * If user supplied "my_pharm", queries GitHub API /user to get username (e.g. "codebytemirza")
 * and returns "codebytemirza/my_pharm".
 */
export async function resolveGitHubRepo(token: string, rawRepo: string): Promise<string> {
  const trimmed = (rawRepo || '').trim();
  if (!trimmed || trimmed === 'owner/my_pharm') {
    return '';
  }

  if (cachedResolvedRepo && cachedResolvedRepo.raw === trimmed) {
    return cachedResolvedRepo.resolved;
  }

  // If already contains owner/repo
  if (trimmed.includes('/')) {
    cachedResolvedRepo = { raw: trimmed, resolved: trimmed };
    return trimmed;
  }

  // If bare repo name and token provided, resolve owner from /user endpoint
  if (token) {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'Pharmacy-Management-System-Local-Server',
        },
      });
      if (res.ok) {
        const userData = (await res.json()) as { login?: string };
        if (userData?.login) {
          const resolved = `${userData.login}/${trimmed}`;
          cachedResolvedRepo = { raw: trimmed, resolved };
          return resolved;
        }
      }
    } catch (err) {
      console.warn('Could not query GitHub user profile for repo owner:', err);
    }
  }

  return trimmed;
}
