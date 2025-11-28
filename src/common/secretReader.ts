import Phase, { GetSecretOptions } from "@phase.dev/phase-node";

export type GetOprions = GetSecretOptions;
export type SupportedEnvService = Phase;

export type SecretItem = { key: string; value: string };
export type SecretValue = Record<string, string>;

export class SecretReader {
  private envService: SupportedEnvService;

  constructor(envService: SupportedEnvService) {
    this.envService = envService;
  }

  /**
   * Supported Env Service --> Phase
   *
   * add more services in the future
   * else if (this.envService instanceof AnotherService)
   */
  private async envGet(oprions: GetOprions) {
    if (this.envService instanceof Phase) {
      return this.envService.get(oprions);
    }
    return [];
  }

  async get(options: GetOprions): Promise<SecretValue> {
    const raw = await this.envGet(options);
    const result: SecretValue = raw.reduce((acc, cur) => {
      acc[cur.key] = cur.value;
      return acc;
    }, {} as SecretValue);
    return result;
  }
}
