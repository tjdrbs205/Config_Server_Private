/**
 * application-profile parsing utilities
 * @example "myapp-dev" -> { application: "myapp", profile: "dev" }
 * @example "my-app-prod" -> { application: "my-app", profile: "prod" }
 * @example "myapp" -> { application: "myapp", profile: "default" }
 */
export function parseApplicationProfile(name: string): { application: string; profile: string } {
  const lastDashIndex = name.lastIndexOf("-");
  if (lastDashIndex === -1) {
    return { application: name, profile: "default" };
  }
  return {
    application: name.substring(0, lastDashIndex),
    profile: name.substring(lastDashIndex + 1),
  };
}

/**
 * filePath splitting utilities
 * @example "myapp-dev.yml" -> { name: "myapp", profile: "dev", ext: ".yml" }
 * @example "myapp.json" -> { name: "myapp", profile: "default", ext: ".json" }
 */
export function splitFilePath(filePath: string): { name: string; profile: string; ext: string } {
  const lastDot = filePath.lastIndexOf(".");
  const ext = lastDot >= 0 ? filePath.slice(lastDot) : "";
  const stem = lastDot >= 0 ? filePath.slice(0, lastDot) : filePath;

  const { application, profile } = parseApplicationProfile(stem);
  return { name: application, profile, ext };
}
