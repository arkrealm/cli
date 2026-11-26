#!/usr/bin/env node
import { downloadTemplate } from "giget";
import { existsSync, readFileSync, cpSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import registry from "./registry.json" with { type: "json" };

type RegistryEntry = {
  repo: string;
  tier: "free" | "paid";
  description: string;
};

type ModuleManifest = {
  name: string;
  files?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  env?: string[];
};

const modules = registry as Record<string, RegistryEntry>;

async function installModule(moduleName: string, targetRoot: string, token?: string) {
  const entry = modules[moduleName];
  if (!entry) {
    throw new Error(`Unknown module "${moduleName}". Available: ${Object.keys(modules).join(", ")}`);
  }

  if (entry.tier === "paid" && !token) {
    throw new Error(`"${moduleName}" is a paid module. Pass --token <github_pat> or set ARKREALM_GITHUB_TOKEN.`);
  }

  const tmpDir = join(targetRoot, ".arkrealm-tmp", moduleName);
  console.log(`Downloading ${moduleName} (${entry.repo})...`);

  await downloadTemplate(entry.repo, {
    dir: tmpDir,
    force: true,
    auth: entry.tier === "paid" ? token : undefined,
  });

  const manifestPath = join(tmpDir, "module.manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as ModuleManifest;
    console.log(`Applying manifest for ${manifest.name}...`);

    if (manifest.files) {
      for (const [srcRel, destRel] of Object.entries(manifest.files)) {
        const srcPath = join(tmpDir, srcRel);
        const destPath = join(targetRoot, destRel);
        if (existsSync(srcPath)) {
          mkdirSync(join(destPath, ".."), { recursive: true });
          cpSync(srcPath, destPath, { recursive: true });
          console.log(`  Copied ${srcRel} -> ${destRel}`);
        }
      }
    }

    if (manifest.env?.length) {
      console.log(`  Required env vars: ${manifest.env.join(", ")}`);
    }
  } else {
    // Fallback if repo has no module.manifest.json yet
    const destDir = join(targetRoot, "src/modules", moduleName);
    mkdirSync(destDir, { recursive: true });
    cpSync(tmpDir, destDir, { recursive: true });
    console.log(`  Copied files to src/modules/${moduleName}`);
  }

  rmSync(join(targetRoot, ".arkrealm-tmp"), { recursive: true, force: true });
  console.log(`Done: ${moduleName}\n`);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const token = getFlagValue(args, "--token") ?? process.env.ARKREALM_GITHUB_TOKEN;

  if (command === "add") {
    const moduleName = args[1];
    if (!moduleName) {
      console.error("Usage: arkrealm add <module-name> [--token <github_pat>]");
      process.exit(1);
    }
    await installModule(moduleName, process.cwd(), token);
    return;
  }

  if (command === "init") {
    const isLite = args.includes("--lite");
    const dirArg = args[1] && !args[1].startsWith("--") ? args[1] : ".";
    const targetRoot = resolve(process.cwd(), dirArg);
    mkdirSync(targetRoot, { recursive: true });

    if (isLite) {
      console.log(`Initializing ArkRealm Lite stack in ${targetRoot}...\n`);
      await installModule("auth-api-demo", targetRoot, token);
      console.log("Lite stack ready.");
      return;
    }

    console.log("Usage: arkrealm init [dir] --lite");
    process.exit(1);
  }

  console.log("ArkRealm CLI\n");
  console.log("Commands:");
  console.log("  arkrealm init [dir] --lite       Scaffold free demo stack");
  console.log("  arkrealm add <module> [--token]  Add a module to current project");
  console.log("\nAvailable modules:", Object.keys(modules).join(", "));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
