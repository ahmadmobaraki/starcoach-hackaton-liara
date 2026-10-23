import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "raahbar-test-"));
process.env.DATA_DIR = dataDir;
process.env.LIARA_API_KEY = "test-liara-key";
process.env.LLM_API_KEY = "test-llm-key";
process.env.APPROVAL_SECRET = "test-approval-secret";
process.env.APP_URL = "http://localhost:3000";
process.env.TZ = "UTC";
