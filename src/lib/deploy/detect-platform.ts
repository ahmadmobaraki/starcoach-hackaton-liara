import fs from "node:fs/promises";
import path from "node:path";

export async function detectPlatform(root: string): Promise<string> {
  const exists = async (name: string) =>
    fs
      .stat(path.join(root, name))
      .then(() => true)
      .catch(() => false);

  const readJson = async (name: string) => {
    try {
      return JSON.parse(await fs.readFile(path.join(root, name), "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  };

  const [hasPackage, hasDocker, hasComposer, hasRequirements, hasPipfile, hasGoMod] =
    await Promise.all([
      exists("package.json"),
      exists("Dockerfile"),
      exists("composer.json"),
      exists("requirements.txt"),
      exists("Pipfile"),
      exists("go.mod"),
    ]);

  if (await exists("wp-content")) return "wordpress";
  if (hasGoMod) return hasDocker ? "docker" : "go";
  if (hasComposer) {
    const composer = await readJson("composer.json");
    const require = (composer.require ?? {}) as Record<string, unknown>;
    return require["laravel/framework"] || require["laravel/lumen-framework"]
      ? "laravel"
      : "php";
  }
  if (await exists("index.php")) return "php";
  if (hasRequirements || hasPipfile) {
    const requirements =
      (await readRequirements(root, hasRequirements, hasPipfile)).toLowerCase();
    if (requirements.includes("django")) return "django";
    if (requirements.includes("flask")) return "flask";
    return "python";
  }
  if (hasPackage) {
    const pkg = await readJson("package.json");
    const deps = (pkg.dependencies ?? {}) as Record<string, unknown>;
    const dev = (pkg.devDependencies ?? {}) as Record<string, unknown>;
    if (deps.next) return "next";
    if (deps["@angular/core"]) return "angular";
    if (dev["@vue/cli-service"] || (deps.vue && dev.vite)) return "vue";
    if (
      deps["react-scripts"] ||
      (deps.react && dev.vite) ||
      deps.preact
    ) {
      return "react";
    }
    return "node";
  }
  if (hasDocker) return "docker";
  if (await exists("Startup.cs")) return "dotnet";
  if (await exists("Program.cs")) return "dotnet";
  return "static";
}

async function readRequirements(
  root: string,
  hasRequirements: boolean,
  hasPipfile: boolean,
): Promise<string> {
  const parts: string[] = [];
  if (hasRequirements) {
    parts.push(
      await fs.readFile(path.join(root, "requirements.txt"), "utf8").catch(() => ""),
    );
  }
  if (hasPipfile) {
    parts.push(await fs.readFile(path.join(root, "Pipfile"), "utf8").catch(() => ""));
  }
  return parts.join("\n");
}
