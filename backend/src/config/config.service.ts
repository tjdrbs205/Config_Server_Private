import { EnvironmentValue } from "../common/environmentValue";
import { GitRepository } from "../common/gitRepo";

export class ConfigService {
  private env: EnvironmentValue;
  private gitRepo: GitRepository;

  constructor() {
    this.env = EnvironmentValue.getInstance();
    this.gitRepo = new GitRepository(this.env.GIT_REPO_MODE);
    this.gitRepo.start().catch(console.error);
  }

  async getConfigFile(application: string, profile: string) {
    const file = await this.gitRepo.find(application, profile);
    return { application, profile, propertySources: file };
  }
}
