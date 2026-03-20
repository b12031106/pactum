import { GitService } from '../src/lib/git';

async function main() {
  const repoPath = process.env.DOCS_REPO_PATH || './docs-repo';
  const remoteUrl = process.env.DOCS_REPO_REMOTE || undefined;
  console.log(`Initializing docs repo at: ${repoPath}`);
  const git = new GitService(repoPath);
  await git.cloneOrInit(remoteUrl);
  console.log('Docs repo ready.');
}

main().catch((err) => {
  console.error('Failed to init docs repo:', err);
  process.exit(1);
});
