import type { IAhkoFileConfig, IAhkoProfileConfig } from "../models/config.model.js";

let activeConfig: IAhkoFileConfig | undefined;

/**
 * Programmatically loads and activates a declarative configuration.
 * Universal across Node.js, browsers, and edge environments.
 *
 * @param config - Complete configuration object conforming to `IAhkoFileConfig`.
 */
export function loadConfig(config: IAhkoFileConfig): void {
  activeConfig = { ...config };
}

/**
 * Resets the currently active configuration in memory to undefined.
 */
export function resetConfig(): void {
  activeConfig = undefined;
}

/**
 * Asynchronously loads a `config.ahko.json` or custom config file from the filesystem in Node.js.
 * Sets the active configuration in memory upon successful read and parse.
 *
 * @param filePath - Optional relative or absolute path to the configuration file (default: "config.ahko.json").
 * @returns The parsed configuration object, or `undefined` if not running in Node.js or if file cannot be read.
 */
export async function loadConfigFile(filePath = "config.ahko.json"): Promise<IAhkoFileConfig | undefined> {
  if (typeof process === "undefined" || !process.versions?.node) {
    return undefined;
  }

  try {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const resolvedPath = resolve(process.cwd(), filePath);
    const content = await readFile(resolvedPath, "utf-8");
    const parsed = JSON.parse(content) as IAhkoFileConfig;
    activeConfig = parsed;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Safely inspects the local filesystem synchronously if running in a Node.js CJS/compatible environment.
 */
function tryAutoDiscoverSync(): void {
  if (activeConfig !== undefined || typeof process === "undefined" || !process.versions?.node) {
    return;
  }

  try {
    let fs: { existsSync(p: string): boolean; readFileSync(p: string, enc: string): string } | null = null;
    let path: { resolve(...paths: string[]): string } | null = null;

    if (typeof (process as unknown as { getBuiltinModule?: (mod: string) => unknown }).getBuiltinModule === "function") {
      const getBuiltin = (process as unknown as { getBuiltinModule: (mod: string) => unknown }).getBuiltinModule;
      fs = getBuiltin("node:fs") as typeof fs;
      path = getBuiltin("node:path") as typeof path;
    } else if (typeof require === "function") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      fs = require("node:fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      path = require("node:path");
    }

    if (fs && path) {
      const configPath = path.resolve(process.cwd(), "config.ahko.json");
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf-8");
        activeConfig = JSON.parse(raw) as IAhkoFileConfig;
      }
    }
  } catch {
    // Non-critical auto-discovery failure; fallback to programmatic configuration
  }
}

/**
 * Returns the currently active declarative configuration, attempting auto-discovery if in Node.js.
 */
export function getActiveConfig(): IAhkoFileConfig | undefined {
  if (activeConfig === undefined) {
    tryAutoDiscoverSync();
  }
  return activeConfig;
}

/**
 * Retrieves a specific profile configuration by name, or the default profile if no name is provided.
 *
 * @param profileName - Optional name of the profile (e.g. "api", "background").
 * @returns The profile configuration if defined, or undefined.
 */
export function getProfileConfig(profileName?: string): IAhkoProfileConfig | undefined {
  const config = getActiveConfig();
  if (!config) {
    return undefined;
  }

  if (profileName) {
    return config.profiles?.[profileName];
  }

  return config.default;
}
