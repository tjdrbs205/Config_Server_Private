export type JsonStore = Record<string, any>;

export class ConfigService {
  private static instance: ConfigService | null = null;
  private memoryStore: JsonStore = {};

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  private async githubApiFetch(url: string, token?: string, options: any = {}) {
    const headers = {
      ...(options.headers || {}),
      Accept: "application/vnd.github.v3.raw",
    } as Record<string, string>;

    if (token) {
      headers.Authorization = `token ${token}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      throw new Error(
        `GitHub API request failed: ${res.status} - ${res.statusText}`
      );
    }

    return res;
  }

  async loadEnvFromGitHubApi(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    token?: string
  ) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

    const newStore: JsonStore = {};

    const fileListRes = await this.githubApiFetch(url, token || undefined);
    const fileList = await fileListRes.json();

    for (const file of fileList) {
      const fileRes = await this.githubApiFetch(file.url, token || undefined);
      const json = await fileRes.json();
      newStore[file.name] = json;
    }

    this.memoryStore = newStore;
    return { success: true };
  }

  async getTestApi() {
    const user = {
      owner: "tjdrbs205",
      repo: "test_env_repo",
      path: "environment/test",
      branch: "main",
      token: "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",
    };

    try {
      await this.loadEnvFromGitHubApi(
        user.owner,
        user.repo,
        user.path,
        user.branch,
        user.token
      );
    } catch (e) {
      return { message: "Error fetching from GitHub API", error: e };
    }
    return { message: "Test API is working!" };
  }

  getEnvTest() {
    return this.memoryStore;
  }
}
