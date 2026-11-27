#!/usr/bin/env node
import { downloadTemplate } from "giget";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  cpSync,
  copyFileSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import registry from "./registry.json" with { type: "json" };

type RegistryEntry = {
  repo: string;
  tier: "free" | "paid";
  standalone?: boolean;
  description: string;
};

type ModuleManifest = {
  name: string;
  version?: string;
  files?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  env?: Record<string, string> | string[];
  postInstall?: string[];
};

const modules = registry as Record<string, RegistryEntry>;

function mergePackageJson(targetRoot: string, manifest: ModuleManifest) {
  const pkgPath = join(targetRoot, "package.json");
  if (!existsSync(pkgPath)) return;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  let updated = false;

  if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
    pkg.dependencies = {
      ...(pkg.dependencies ?? {}),
      ...manifest.dependencies,
    };
    updated = true;
  }

  if (
    manifest.devDependencies &&
    Object.keys(manifest.devDependencies).length > 0
  ) {
    pkg.devDependencies = {
      ...(pkg.devDependencies ?? {}),
      ...manifest.devDependencies,
    };
    updated = true;
  }

  if (updated) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log("  Updated package.json dependencies");
  }
}

function mergeEnvExample(
  targetRoot: string,
  env?: Record<string, string> | string[],
) {
  if (!env) return;

  const envPath = join(targetRoot, ".env.example");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const lines = existing ? existing.split("\n") : [];

  const entries: [string, string][] = Array.isArray(env)
    ? env.map((k) => [k, ""])
    : Object.entries(env);

  let added = 0;
  for (const [key, defaultVal] of entries) {
    const alreadyExists = lines.some((line) => line.startsWith(`${key}=`));
    if (!alreadyExists) {
      lines.push(`${key}=${defaultVal}`);
      added++;
    }
  }

  if (added > 0) {
    writeFileSync(
      envPath,
      lines.filter((l, i) => i < lines.length - 1 || l !== "").join("\n") +
        "\n",
    );
    console.log(`  Added ${added} variable(s) to .env.example`);
  }
}

async function scaffoldStandaloneApp(
  moduleName: string,
  workspaceRoot: string,
  envTargetFile: ".env" | ".env.local",
  token?: string,
) {
  const entry = modules[moduleName];
  if (!entry) {
    throw new Error(`Unknown module "${moduleName}".`);
  }

  const destDir = join(workspaceRoot, moduleName);
  console.log(`Downloading ${moduleName} (${entry.repo})...`);

  await downloadTemplate(entry.repo, {
    dir: destDir,
    force: true,
    auth: entry.tier === "paid" ? token : undefined,
  });

  const envExample = join(destDir, ".env.example");
  const envDest = join(destDir, envTargetFile);
  if (existsSync(envExample) && !existsSync(envDest)) {
    copyFileSync(envExample, envDest);
    console.log(`  Created ${moduleName}/${envTargetFile} from .env.example`);
  }

  console.log(`Done: ${moduleName}\n`);
}

async function installModule(
  moduleName: string,
  targetRoot: string,
  token?: string,
) {
  const entry = modules[moduleName];
  if (!entry) {
    throw new Error(
      `Unknown module "${moduleName}". Available: ${Object.keys(modules).join(", ")}`,
    );
  }

  if (entry.standalone) {
    throw new Error(
      `"${moduleName}" is a standalone demo template, not an injectable module. Run "arkrealm init <dir> --lite" instead.`,
    );
  }

  if (entry.tier === "paid" && !token) {
    throw new Error(
      `"${moduleName}" is a paid module. Pass --token <github_pat> or set ARKREALM_GITHUB_TOKEN.`,
    );
  }

  const tmpDir = join(targetRoot, ".arkrealm-tmp", moduleName);
  console.log(`Downloading ${moduleName} (${entry.repo})...`);

  try {
    await downloadTemplate(entry.repo, {
      dir: tmpDir,
      force: true,
      auth: entry.tier === "paid" ? token : undefined,
    });

    const manifestPath = join(tmpDir, "module.manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error(
        `"${moduleName}" is a standalone template, not an injectable module. Run "arkrealm init <dir> --lite" instead.`,
      );
    }

    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf-8"),
    ) as ModuleManifest;
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

    mergePackageJson(targetRoot, manifest);
    mergeEnvExample(targetRoot, manifest.env);

    if (manifest.postInstall?.length) {
      console.log("\n  Next steps:");
      for (const step of manifest.postInstall) {
        console.log(`    - ${step}`);
      }
    }

    console.log(`Done: ${moduleName}\n`);
  } finally {
    rmSync(join(targetRoot, ".arkrealm-tmp"), { recursive: true, force: true });
  }
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const token =
    getFlagValue(args, "--token") ?? process.env.ARKREALM_GITHUB_TOKEN;

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
      console.log(
        `Initializing ArkRealm Lite full-stack demo in ${targetRoot}...\n`,
      );
      await scaffoldStandaloneApp("auth-api-demo", targetRoot, ".env", token);
      await scaffoldStandaloneApp(
        "auth-ui-demo",
        targetRoot,
        ".env.local",
        token,
      );

      console.log("ArkRealm Lite stack ready! Run these commands to start:\n");
      console.log(
        "  1. Start Backend API in background (http://localhost:3000):",
      );
      console.log(
        `     cd ${join(dirArg, "auth-api-demo")} && docker compose up --build -d\n`,
      );
      console.log("  2. Start Next.js Frontend (http://localhost:3001):");
      console.log("     cd ../auth-ui-demo && pnpm install && pnpm dev\n");
      return;
    }

    console.log("Usage: arkrealm init [dir] --lite");
    process.exit(1);
  }

  console.log("ArkRealm CLI\n");
  console.log("Commands:");
  console.log(
    "  arkrealm init [dir] --lite       Scaffold free full-stack demo (API + UI)",
  );
  console.log(
    "  arkrealm add <module> [--token]  Add a module to current project",
  );
  console.log("\nAvailable modules:", Object.keys(modules).join(", "));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
