import simpleGit, { SimpleGit } from 'simple-git';
import { Mutex } from 'async-mutex';
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

interface GitAuthor {
  name: string;
  email: string;
}

interface GitLogEntry {
  sha: string;
  message: string;
  author: string;
  email: string;
  date: string;
  body: string;
}

const pushRetryQueue: Array<{ sha: string; retries: number }> = [];
const MAX_PUSH_RETRIES = 5;

export class GitService {
  private git: SimpleGit;
  private mutex = new Mutex();
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  async init(): Promise<void> {
    if (!existsSync(join(this.repoPath, '.git'))) {
      await this.git.init();
      await this.git.addConfig('user.name', 'Pactum System');
      await this.git.addConfig('user.email', 'system@pactum.local');
    }
  }

  async cloneOrInit(remoteUrl?: string): Promise<void> {
    if (existsSync(join(this.repoPath, '.git'))) return;
    if (remoteUrl) {
      await simpleGit().clone(remoteUrl, this.repoPath);
    } else {
      await this.init();
    }
  }

  async commitFile(
    fileName: string,
    content: string,
    message: string,
    author: GitAuthor,
    body?: string,
  ): Promise<string> {
    return this.mutex.runExclusive(async () => {
      const filePath = join(this.repoPath, fileName);
      writeFileSync(filePath, content, 'utf-8');
      await this.git.add(fileName);
      const fullMessage = body ? `${message}\n\n${body}` : message;
      const result = await this.git.commit(fullMessage, [fileName], {
        '--author': `${author.name} <${author.email}>`,
      });
      const sha = result.commit;
      this.pushAsync();
      return sha;
    });
  }

  async appendMetadataComment(
    fileName: string,
    eventType: string,
    email: string,
  ): Promise<void> {
    const filePath = join(this.repoPath, fileName);
    const timestamp = new Date().toISOString();
    const comment = `\n<!-- pactum:${eventType} ${timestamp} by ${email} -->`;
    appendFileSync(filePath, comment, 'utf-8');
  }

  async commitWithMetadata(
    fileName: string,
    eventType: string,
    message: string,
    author: GitAuthor,
    body?: string,
  ): Promise<string> {
    return this.mutex.runExclusive(async () => {
      await this.appendMetadataComment(fileName, eventType, author.email);
      await this.git.add(fileName);
      const fullMessage = body ? `${message}\n\n${body}` : message;
      const result = await this.git.commit(fullMessage, [fileName], {
        '--author': `${author.name} <${author.email}>`,
      });
      const sha = result.commit;
      this.pushAsync();
      return sha;
    });
  }

  async getLog(fileName: string): Promise<GitLogEntry[]> {
    return this.mutex.runExclusive(async () => {
      const log = await this.git.log({ file: fileName });
      return log.all.map((entry) => ({
        sha: entry.hash,
        message: entry.message,
        author: entry.author_name,
        email: entry.author_email,
        date: entry.date,
        body: entry.body,
      }));
    });
  }

  async getDiff(sha: string, fileName: string): Promise<string> {
    return this.mutex.runExclusive(async () => {
      try {
        return await this.git.diff([`${sha}^..${sha}`, '--', fileName]);
      } catch {
        return await this.git.diff(['4b825dc642cb6eb9a060e54bf899d15363da7f63', sha, '--', fileName]);
      }
    });
  }

  async readFile(fileName: string): Promise<string | null> {
    const filePath = join(this.repoPath, fileName);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  }

  private pushAsync(): void {
    this.git.getRemotes().then((remotes) => {
      if (remotes.length > 0) {
        this.git.push().catch((err) => {
          console.error('Git push failed, queued for retry:', err.message);
          pushRetryQueue.push({ sha: 'latest', retries: 0 });
        });
      }
    }).catch(() => {});
  }

  async retryFailedPushes(): Promise<void> {
    const pending = [...pushRetryQueue];
    pushRetryQueue.length = 0;
    for (const item of pending) {
      if (item.retries >= MAX_PUSH_RETRIES) {
        console.error(`Git push abandoned after ${MAX_PUSH_RETRIES} retries`);
        continue;
      }
      try {
        await this.git.push();
      } catch {
        pushRetryQueue.push({ sha: item.sha, retries: item.retries + 1 });
      }
    }
  }
}

let _docsGit: GitService | null = null;

export function getDocsGitService(): GitService {
  if (!_docsGit) {
    const repoPath = process.env.DOCS_REPO_PATH || './docs-repo';
    _docsGit = new GitService(repoPath);
  }
  return _docsGit;
}
