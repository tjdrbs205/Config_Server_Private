import dotenv from "dotenv";
import { EnvStore, JsonStore } from "../../common/memory_db/envStore";
dotenv.config();

export class ConfigService {
  private static instance: ConfigService | null = null;
  private envStore: EnvStore;
  private fetchConcurrency: number =
    Number(process.env.GIT_FETCH_CONCURRENCY) || 10;

  private constructor() {
    this.envStore = EnvStore.getInstance();
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  private parseFileContent(name: string | undefined, text: string) {
    let parsed: any = text;
    try {
      const lower = (name || "").toLowerCase();
      if (lower.endsWith(".json")) parsed = JSON.parse(text);
      else if (lower.endsWith(".env")) {
        parsed = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"))
          .reduce((acc: Record<string, string>, line) => {
            const idx = line.indexOf("=");
            if (idx > -1)
              acc[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
            return acc;
          }, {});
      }
    } catch (err) {
      parsed = text;
    }
    return parsed;
  }

  private flattenPathToFinalStore(pathToValue: Record<string, any>): JsonStore {
    const finalStore: JsonStore = {};
    for (const [p, val] of Object.entries(pathToValue)) {
      const name = p.split("/").pop() || p;
      if (!(name in finalStore)) finalStore[name] = val;
      else finalStore[p] = val;
    }
    return finalStore;
  }

  private async githubApiFetch(url: string, options: any = {}) {
    const token = process.env.GIT_AUTH_TOKEN;
    const headers = {
      ...(options.headers || {}),
      Accept: "application/vnd.github.v3+json",
    };

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

  private async limitedParallelFetch<T, R>(
    items: T[],
    limit: number,
    fetchFn: (item: T) => Promise<R>
  ) {
    const results: R[] = [];
    let idx = 0;

    const next = async () => {
      if (idx >= items.length) return;
      const cur = idx++;
      results[cur] = await fetchFn(items[cur]);
      await next();
    };

    await Promise.all(Array(Math.min(limit, items.length)).fill(0).map(next));
    return results;
  }

  private async fetchEnvPayloadFromGitTree(
    owner: string,
    repo: string,
    pathPrefix: string,
    branch: string
  ) {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const treeRes = await this.githubApiFetch(treeUrl);

    const topEtag = treeRes.headers.get("etag");
    const rateLimit = {
      limit: Number(treeRes.headers.get("X-RateLimit-Limit") || 0),
      remaining: Number(treeRes.headers.get("X-RateLimit-Remaining") || 0),
      reset: Number(treeRes.headers.get("X-RateLimit-Reset") || 0),
    };

    const treeJson = await treeRes.json();
    const tree = treeJson && treeJson.tree ? treeJson.tree : [];

    let prefix = (pathPrefix || "").replace(/^\/+/, "");
    if (prefix && !prefix.endsWith("/")) prefix = prefix + "/";

    const blobs = tree.filter(
      (n: any) => n.type === "blob" && n.path.startsWith(prefix)
    );

    const pathToValue: Record<string, any> = {};
    const fileMeta: Record<string, any> = {};

    await this.limitedParallelFetch(
      blobs,
      this.fetchConcurrency,
      async (entry: any) => {
        try {
          const blobUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${entry.sha}`;
          const blobRes = await this.githubApiFetch(blobUrl);
          const blobJson = await blobRes.json();
          const contentBase64 = blobJson.content || "";
          const encoding = blobJson.encoding || "base64";
          let text = "";
          if (encoding === "base64")
            text = Buffer.from(contentBase64, "base64").toString("utf8");
          else text = contentBase64;

          const parsed = this.parseFileContent(
            entry.path.split("/").pop(),
            text
          );
          pathToValue[entry.path] = parsed;
          fileMeta[entry.path] = { sha: entry.sha, size: entry.size };
        } catch (e) {
          console.error(
            `Failed blob fetch for ${entry.path} in ${owner}/${repo}:`,
            e
          );
        }
      }
    );

    const finalStore = this.flattenPathToFinalStore(pathToValue);

    return {
      store: finalStore,
      raw: pathToValue,
      meta: {
        source: { owner, repo, path: pathPrefix, branch, url: treeUrl },
        fetchAt: new Date().toISOString(),
        etag: topEtag,
        rateLimit,
        file: fileMeta,
        fetchedBy: this.constructor.name,
      },
    };
  }

  async discoverAndLoadByRepoName(
    owner?: string,
    repoName: string = process.env.REPO_NAME || "env_repo",
    path: string = "environment/json",
    branch: string = "main"
  ) {
    const listUrl = owner
      ? `https://api.github.com/users/${owner}/repos?per_page=100`
      : `https://api.github.com/user/repos?per_page=100`;

    const listRes = await this.githubApiFetch(listUrl);

    const repos = await listRes.json();

    const matched = (repos || [])
      .filter((r: any) =>
        String(r.name).toLowerCase().includes(repoName.toLowerCase())
      )
      .map((r: any) => ({ owner: r.owner.login, repo: r.name }));

    const aggregatedStore: Record<string, any> = {};
    const aggregatedMeta: Record<string, any> = {};

    await this.limitedParallelFetch(
      matched,
      this.fetchConcurrency,
      async (info: any) => {
        try {
          const payload = await this.fetchEnvPayloadFromGitTree(
            info.owner,
            info.repo,
            path,
            branch
          );
          const key = `${info.owner}/${info.repo}`;
          aggregatedStore[key] = payload.store;
          aggregatedMeta[key] = payload.meta;
        } catch (e) {
          console.error(`Error fetching from ${info.owner}/${info.repo}:`, e);
        }
      }
    );

    this.envStore.GitEnvStore = {
      store: aggregatedStore,
      meta: {
        fetchedAt: new Date().toISOString(),
        fetchedBy: this.constructor.name,
        repoFilter: repoName,
        repositories: Object.keys(aggregatedStore),
        details: aggregatedMeta,
      },
    };

    return {
      success: true,
      count: Object.keys(aggregatedStore).length,
    };
  }

  async getTestApi() {
    try {
      const res = await this.discoverAndLoadByRepoName();

      return {
        success: true,
        message: "Test API is working!",
        result: res,
      };
    } catch (e) {
      return {
        success: false,
        message: "Error fetching from GitHub API",
        error: e,
      };
    }
  }

  getEnvTest() {
    return this.envStore.GitEnvStore;
  }
}
