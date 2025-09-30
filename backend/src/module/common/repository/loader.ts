import dotenv from "dotenv";
import YAML from "yaml";
import PropertiesReader from "properties-reader";

export class ParseConfig {
  parseConfig(filename: string, content: string): Record<string, any> {
    if (filename.endsWith(".json")) return JSON.parse(content);
    if (filename.endsWith(".env")) return dotenv.parse(content);
    if (filename.endsWith(".yml") || filename.endsWith(".yaml"))
      return YAML.parse(content);
    if (filename.endsWith(".properties")) {
      return PropertiesReader(content).getAllProperties();
    }
    throw new Error(`Unsupported file format: ${filename}`);
  }
}
