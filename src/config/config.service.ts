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

  private async safeFind(application: string, profile: string) {
    try {
      return this.gitRepo.find(application, profile);
    } catch {
      return null;
    }
  }

  /**
   * Spring Cloud Config 호환 응답 반환
   * GET /{application}/{profile}[/{label}]
   */
  @Log({ prefix: "CONFIG" })
  async getConfig(application: string, profile: string, label?: string): Promise<ConfigResponse> {
    const currentLabel = label || this.env.GIT_BRANCH;
    const file = await this.gitRepo.find(application, profile);
    const filledFile = this.fillSecret(file);
    const version = await this.gitRepo.getCurrentCommitHash();

    // Spring Cloud Config 형식으로 propertySources 변환
    const propertySources: PropertySource[] = filledFile.map((item: { name: string; source: Record<string, any> }) => ({
      name: `file:${this.env.GIT_URL}/${item.name}`,
      source: this.flattenProperties(item.source),
    }));

    return {
      name: application,
      profiles: [profile],
      label: currentLabel,
      version,
      state: null,
      propertySources,
    };
  }

  /**
   * 중첩된 객체를 점(.) 표기법으로 평탄화
   * Spring Cloud Config는 평탄화된 properties를 기대함
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
   * YAML 형식으로 설정 반환
   * GET /{application}-{profile}.yml
   * GET /{application}-{profile}.yaml
   */
  async getConfigAsYaml(application: string, profile: string, label?: string): Promise<string> {
    const config = await this.getConfig(application, profile, label);
    const merged = this.mergePropertySources(config.propertySources);
    return YAML.stringify(this.unflattenProperties(merged));
  }

  /**
   * Properties 형식으로 설정 반환
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
   * JSON 형식으로 설정 반환
   * GET /{application}-{profile}.json
   */
  async getConfigAsJson(application: string, profile: string, label?: string): Promise<Record<string, any>> {
    const config = await this.getConfig(application, profile, label);
    const merged = this.mergePropertySources(config.propertySources);
    return this.unflattenProperties(merged);
  }

  /**
   * PropertySources를 하나의 객체로 병합 (우선순위: 첫 번째가 가장 높음)
   */
  private mergePropertySources(propertySources: PropertySource[]): Record<string, any> {
    const result: Record<string, any> = {};
    // 역순으로 병합하여 우선순위가 높은 것이 덮어씀
    for (let i = propertySources.length - 1; i >= 0; i--) {
      Object.assign(result, propertySources[i].source);
    }
    return result;
  }

  /**
   * 평탄화된 properties를 중첩 객체로 변환
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
   * Properties 형식에서 특수문자 이스케이프
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

  @Log({ prefix: "GIT_POLLING_START" })
  startGitPolling() {
    this.gitRepo.startPolling(this.env.GIT_POLL_INTERVAL);
  }

  @Log({ prefix: "GIT_POLLING_STOP" })
  stopGitPolling() {
    this.gitRepo.stopPolling();
  }
}
