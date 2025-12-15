import Phase, { GetSecretOptions } from "@phase.dev/phase-node";
import { EnvironmentValue } from "../common/environmentValue";
import { GitRepository } from "../common/gitRepo";
import { SecretReader } from "../common/secretReader";
import { Log } from "../decorador/Logger";
import YAML from "yaml";

interface PropertySource {
  name: string;
  source: Record<string, unknown>;
}

export interface ConfigResponse {
  name: string;
  profiles: string[];
  label: string | null;
  version: string | null;
  state: string | null;
  propertySources: PropertySource[];
}

export class ConfigService {
  private env: EnvironmentValue;
  private gitRepo: GitRepository;

  private secretsLastLoadedAtMs: number = 0;
  private secretsLoading: Promise<void> | null = null;

  static #secretValue: Record<string, string> = {};

  constructor() {
    this.env = EnvironmentValue.getInstance();
    this.gitRepo = new GitRepository(this.env.GIT_REPO_MODE);
    this.gitRepo.start().catch(console.error);
    void this.refreshSecrets();
  }

  async refreshSecrets(): Promise<{ status: "OK" | "IN_PROGRESS" | "SKIPPED"; loadedAt: string | null }> {
    if (this.secretsLoading) {
      return {
        status: "IN_PROGRESS",
        loadedAt: this.secretsLastLoadedAtMs ? new Date(this.secretsLastLoadedAtMs).toISOString() : null,
      };
    }

    this.secretsLoading = this.loadSecrets().finally(() => {
      this.secretsLoading = null;
    });

    await this.secretsLoading;
    return {
      status: "OK",
      loadedAt: this.secretsLastLoadedAtMs ? new Date(this.secretsLastLoadedAtMs).toISOString() : null,
    };
  }

  private async loadSecrets() {
    if (!this.env.PHASE_API_KEY || this.env.PHASE_API_KEY.trim() === "") return;

    const options: GetSecretOptions = {
      appId: this.env.PHASE_APP_ID,
      envName: this.env.PHASE_ENV_NAME,
      path: "/",
    };

    try {
      const secret = new SecretReader(new Phase(this.env.PHASE_API_KEY));
      const value = await secret.get(options);
      ConfigService.#secretValue = value;
      this.secretsLastLoadedAtMs = Date.now();
    } catch (error) {
      // Keep previous secrets on transient failure
      console.error("[ConfigService] Failed to load secrets:", error);
    }
  }

  /**
   * fill empty values in config with secrets
   */
  private fillSecret(config: Array<{ name: string; source: Record<string, any> }>) {
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

  /**
   * Convert flattened properties to nested object
   */
  private unflattenProperties(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key in obj) {
      const keys = key.split(".");
      let current = result;

      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in current)) {
          current[k] = {};
        }
        current = current[k];
      }

      current[keys[keys.length - 1]] = obj[key];
    }

    return result;
  }

  /**
   * Properties value escaping for .properties format
   */
  private escapePropertyValue(value: any): string {
    if (value === null || value === undefined) return "";
    const str = String(value);
    return str.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  }

  /**
   * @deprecated Use getConfig instead for Spring Cloud Config compatibility
   */
  async getConfigFile(application: string, profile: string, label: string = "main"): Promise<ConfigResponse> {
    return this.getConfig(application, profile, label);
  }

  /**
   * Flatten nested object to dot notation
   * Spring Cloud Config expects flattened properties
   */
  private flattenProperties(obj: Record<string, any>, prefix: string = ""): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key in obj) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(result, this.flattenProperties(value, newKey));
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * Return config as YAML format
   * GET /{application}-{profile}.yml
   * GET /{application}-{profile}.yaml
   */
  async getConfigAsYaml(application: string, profile: string, label?: string): Promise<string> {
    const config = await this.getConfig(application, profile, label);
    const merged = this.mergePropertySources(config.propertySources);
    return YAML.stringify(this.unflattenProperties(merged));
  }

  /**
   * Return config as Properties format
   * GET /{application}-{profile}.properties
   */
  async getConfigAsProperties(application: string, profile: string, label?: string): Promise<string> {
    const config = await this.getConfig(application, profile, label);
    const merged = this.mergePropertySources(config.propertySources);
    return Object.entries(merged)
      .map(([key, value]) => `${key}=${this.escapePropertyValue(value)}`)
      .join("\n");
  }

  /**
   * Return config as JSON format (nested object)
   * GET /{application}-{profile}.json
   */
  async getConfigAsJson(application: string, profile: string, label?: string): Promise<Record<string, any>> {
    const config = await this.getConfig(application, profile, label);
    const merged = this.mergePropertySources(config.propertySources);
    return this.unflattenProperties(merged);
  }

  /**
   * Merge PropertySources into a single object (priority: first has highest)
   */
  private mergePropertySources(propertySources: PropertySource[]): Record<string, any> {
    const result: Record<string, any> = {};
    // Merge in reverse order so higher priority sources override
    for (let i = propertySources.length - 1; i >= 0; i--) {
      Object.assign(result, propertySources[i].source);
    }
    return result;
  }

  /**
   * Returns Spring Cloud Config compatible response
   * GET /{application}/{profile}[/{label}]
   * @param profile - Single profile or comma-separated profiles (e.g., "dev,local")
   */
  @Log({ prefix: "CONFIG" })
  async getConfig(application: string, profile: string, label?: string): Promise<ConfigResponse> {
    const currentLabel = label || this.env.GIT_BRANCH;
    const file = await this.gitRepo.find(application, profile);
    const filledFile = this.fillSecret(file);
    const version = await this.gitRepo.getCurrentCommitHash();

    // Convert comma-separated profiles to array
    const profileList = profile
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // Convert propertySources to Spring Cloud Config format
    const propertySources: PropertySource[] = filledFile.map((item: { name: string; source: Record<string, any> }) => ({
      name: `file:${this.env.GIT_URL}/${item.name}`,
      source: this.flattenProperties(item.source),
    }));

    return {
      name: application,
      profiles: profileList.length > 0 ? profileList : ["default"],
      label: currentLabel,
      version,
      state: null,
      propertySources,
    };
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
