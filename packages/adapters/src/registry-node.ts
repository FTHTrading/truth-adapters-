import { gitCommit } from "./git-commit.ts";
import { WORKER_ADAPTERS } from "./registry.ts";
import type { AdapterSpec } from "./types.ts";

/** Everything in WORKER_ADAPTERS plus adapters that need a Node runtime. */
export const NODE_ADAPTERS: Readonly<Record<string, AdapterSpec>> = Object.freeze({
  ...WORKER_ADAPTERS,
  [gitCommit.name]: gitCommit,
});
