import { ConfigService } from "./config.service";

export class ConfigController {
  private configService = ConfigService.getInstance();

  getEnvTest = (req: any, res: any) => {
    const data = this.configService.getEnvTest();
    res.json(data);
  };

  getTestApi = async (req: any, res: any) => {
    const data = await this.configService.getTestApi();
    res.json(data);
  };
}
