import Phase, { GetSecretOptions } from "@phase.dev/phase-node";
import { EnvironmentValue } from "../common/environmentValue";
import { GitRepository } from "../common/gitRepo";
import { SecretReader } from "../common/secretReader";
import { Log } from "../decorador/Logger";

export class ConfigService {
  private env: EnvironmentValue;
  private gitRepo: GitRepository;

  static #secretValue: Record<string, string> = {};

  constructor() {
    this.env = EnvironmentValue.getInstance();
    this.gitRepo = new GitRepository(this.env.GIT_REPO_MODE);
    this.gitRepo.start().catch(console.error);
    this.loadSecrets();
  }

  private async loadSecrets() {
    if (!this.env.PHASE_API_KEY && this.env.PHASE_API_KEY.trim() === "") return;

    const options: GetSecretOptions = {
      appId: this.env.PHASE_APP_ID,
      envName: this.env.PHASE_ENV_NAME,
      path: "/",
    };
    const secret = new SecretReader(new Phase(this.env.PHASE_API_KEY));
    const value = await secret.get(options);
    ConfigService.#secretValue = value;
  }

  /**
   * fill empty values in config with secrets
   */
  private fillSecret(config: Record<string, unknown>) {
    const secret = ConfigService.#secretValue;
    // original config object is not changed
    const result = JSON.parse(JSON.stringify(config));
    const stack: Array<{
      obj: any;
      parent: any;
      key: string;
      path: string;
    }> = [];

    for (const key in result) {
      stack.push({
        obj: result[key],
        parent: result,
        key: key,
        path: key,
      });
    }

    while (stack.length > 0) {
      const current = stack.pop()!;
      const { obj, parent, key, path } = current;

      if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
        for (const childKey in obj) {
          stack.push({
            obj: obj[childKey],
            parent: obj,
            key: childKey,
            path: `${path}.${childKey}`,
          });
        }
      } else {
        // secret injection priority
        const secretValue = secret[path] || secret[path.toUpperCase()] || secret[key] || secret[key.toUpperCase()];

        if (secretValue !== undefined) parent[key] = secretValue;
      }
    }
    return result;
  }

  @Log({ prefix: "CONFIG" })
  async getConfigFile(application: string, profile: string) {
    const file = await this.gitRepo.find(application, profile);
    const filledFile = this.fillSecret(file);
    return { application, profile, propertySources: filledFile };
  }

  @Log({ prefix: "GIT_POLLING_START" })
  startGitPolling() {
    this.gitRepo.startPolling(this.env.GIT_POLL_INTERVAL);
  }

  @Log({ prefix: "GIT_POLLING_STOP" })
  stopGitPolling() {
    this.gitRepo.stopPolling();
  }
}
