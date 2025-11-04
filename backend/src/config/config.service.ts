import { InMemory } from "../common/InMemory";

export class ConfigService {
  private db: InMemory;

  constructor() {
    this.db = InMemory.getInstance();
  }

  async getConfigFile(application: string, profile: string) {
    const file = await this.db.find(application, profile);
    return { application, profile, propertySources: file };
  }
}
