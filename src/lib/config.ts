import path from "node:path";
import fs from "node:fs";

export type AppConfig = {
  liaraApiKey: string;
  liaraTeamId?: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmTemperature: number;
  llmMaxTokens: number;
  appUrl: string;
  mcpAuthToken?: string;
  dataDir: string;
  maxUploadMb: number;
};

let cached: AppConfig | null = null;

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function getConfig(): AppConfig {
  if (cached) return cached;

  const liaraApiKey = env("LIARA_API_KEY");
  if (!liaraApiKey) {
    throw new Error(
      "LIARA_API_KEY is missing. Add it to .env (see .env.example).",
    );
  }

  const llmApiKey = env("LLM_API_KEY") ?? env("DEEPSEEK_API_KEY") ?? "";

  const dataDir = path.resolve(
    process.cwd(),
    env("DATA_DIR") ?? ".data",
  );

  cached = {
    liaraApiKey,
    liaraTeamId: env("LIARA_TEAM_ID"),
    llmBaseUrl:
      env("LLM_BASE_URL") ?? env("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com",
    llmApiKey,
    llmModel: env("LLM_MODEL") ?? env("DEEPSEEK_MODEL") ?? "deepseek-flash",
    llmTemperature: Number(env("LLM_TEMPERATURE") ?? "0.3"),
    llmMaxTokens: Number(env("LLM_MAX_TOKENS") ?? "8000"),
    appUrl: (env("APP_URL") ?? "http://localhost:3000").replace(/\/$/, ""),
    mcpAuthToken: env("MCP_AUTH_TOKEN"),
    dataDir,
    maxUploadMb: Number(env("MAX_UPLOAD_MB") ?? "50"),
  };

  fs.mkdirSync(dataDir, { recursive: true });
  return cached;
}

export function hasConfig(): boolean {
  return Boolean(
    env("LIARA_API_KEY") &&
      (env("LLM_API_KEY") || env("DEEPSEEK_API_KEY")),
  );
}

export function getLlmConfig() {
  const config = getConfig();
  if (!config.llmApiKey) {
    throw new Error(
      "LLM_API_KEY (or DEEPSEEK_API_KEY) is missing. Add it to .env.",
    );
  }
  return config as AppConfig & { llmApiKey: string };
}

export function getDataDir(): string {
  const dataDir = path.resolve(process.cwd(), env("DATA_DIR") ?? ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function getPublicConfig() {
  const llmModel = env("LLM_MODEL") ?? env("DEEPSEEK_MODEL") ?? "deepseek-flash";
  return {
    llmModel,
    hasLiara: Boolean(env("LIARA_API_KEY")),
    hasLlm: Boolean(env("LLM_API_KEY") || env("DEEPSEEK_API_KEY")),
  };
}
