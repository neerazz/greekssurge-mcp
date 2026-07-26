import {
  mkdir,
  lstat,
  readFile,
  rename,
  rm,
  writeFile,
  chmod,
} from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface TokenStore {
  read(): Promise<string | undefined>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface FileTokenStoreOptions {
  tokenPath: string;
  env?: Record<string, string | undefined>;
}

export class FileTokenStore implements TokenStore {
  private readonly env: Record<string, string | undefined>;

  constructor(private readonly options: FileTokenStoreOptions) {
    this.env = options.env ?? process.env;
  }

  async read(): Promise<string | undefined> {
    const envToken = this.env.GREEKSSURGE_TOKEN;
    if (envToken) return envToken;

    try {
      await this.assertNotSymlink();
      const raw = await readFile(this.options.tokenPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as { token?: unknown }).token !== "string"
      ) {
        throw new Error("Token store is malformed.");
      }
      return (parsed as { token: string }).token;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      if (error instanceof SyntaxError)
        throw new Error(
          "Token store is malformed. Run `greekssurge-mcp auth logout` and login again.",
        );
      if (
        error instanceof Error &&
        /Token store is malformed|symlink/i.test(error.message)
      )
        throw error;
      throw new Error("Unable to read token store.");
    }
  }

  async write(token: string): Promise<void> {
    if (!token || /\s/.test(token))
      throw new Error("Refusing to store an invalid GreeksSurge token.");
    await mkdir(dirname(this.options.tokenPath), {
      recursive: true,
      mode: 0o700,
    });
    await this.assertNotSymlink();

    const tempPath = join(
      dirname(this.options.tokenPath),
      `.${basename(this.options.tokenPath)}.${randomUUID()}.tmp`,
    );
    const payload = `${JSON.stringify({ token })}\n`;
    await writeFile(tempPath, payload, { mode: 0o600 });
    if (process.platform !== "win32") await chmod(tempPath, 0o600);
    await rename(tempPath, this.options.tokenPath);
    if (process.platform !== "win32")
      await chmod(this.options.tokenPath, 0o600);
  }

  async clear(): Promise<void> {
    await rm(this.options.tokenPath, { force: true });
  }

  private async assertNotSymlink(): Promise<void> {
    try {
      const stat = await lstat(this.options.tokenPath);
      if (stat.isSymbolicLink())
        throw new Error("Refusing to use a symlink token store path.");
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
