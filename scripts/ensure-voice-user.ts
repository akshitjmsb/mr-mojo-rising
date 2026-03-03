import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

async function main() {
  const root = process.cwd();
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(root, ".env"));

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const voiceEmail = requireEnv("VOICE_LOGIN_EMAIL");
  const voicePassword = requireEnv("VOICE_LOGIN_PASSWORD");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let existingUserId: string | null = null;
  let page = 1;
  const perPage = 200;
  const targetEmail = voiceEmail.toLowerCase();

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    const matched = data.users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (matched) {
      existingUserId = matched.id;
      break;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  if (existingUserId) {
    const { error } = await supabase.auth.admin.updateUserById(existingUserId, {
      email: voiceEmail,
      password: voicePassword,
      email_confirm: true,
    });
    if (error) {
      throw new Error(`Failed to update existing voice user: ${error.message}`);
    }
    console.log(`Updated voice user: ${voiceEmail} (${existingUserId})`);
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: voiceEmail,
    password: voicePassword,
    email_confirm: true,
  });

  if (error) {
    throw new Error(`Failed to create voice user: ${error.message}`);
  }

  console.log(`Created voice user: ${voiceEmail} (${data.user.id})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
