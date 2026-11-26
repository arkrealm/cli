# ArkRealm CLI

Official CLI for scaffolding modular full-stack starter kits and production modules from [ArkRealm](https://github.com/arkrealm).

## Quick Start

Scaffold the free demo stack into a new directory:

```bash
npx arkrealm init my-app --lite
```

Or add a module directly into an existing project:

```bash
npx arkrealm add auth-api-demo
```

## Commands

| Command | Description |
| :--- | :--- |
| `npx arkrealm init [dir] --lite` | Initialize a project with the free `auth-api-demo` starter module |
| `npx arkrealm add <module>` | Install a free module into the current project |
| `npx arkrealm add <module> --token <github_pat>` | Install a private paid module using your GitHub Personal Access Token |

## Available Modules

* **`auth-api-demo`** *(Free)* — Authentication API starter module with manifest-driven file placement, `package.json` dependency merging, and `.env.example` setup.

## Private Module Authentication

For private paid modules, pass a read-only GitHub Personal Access Token (`Contents: Read-only`) via flag or environment variable:

```bash
export ARKREALM_GITHUB_TOKEN=github_pat_...
npx arkrealm add auth-api
```

## License

MIT
