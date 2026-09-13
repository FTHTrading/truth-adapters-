import { aiOutput } from "./ai-output.ts";
import { correction } from "./correction.ts";
import { document } from "./document.ts";
import { evmTx } from "./evm-tx.ts";
import { httpServed } from "./http-served.ts";
import type { AdapterSpec } from "./types.ts";
import { xrplTx } from "./xrpl-tx.ts";

/** Adapters that run anywhere (Workers + Node). Parallel, not hierarchical. */
export const WORKER_ADAPTERS: Readonly<Record<string, AdapterSpec>> = Object.freeze({
  [document.name]: document,
  [aiOutput.name]: aiOutput,
  [httpServed.name]: httpServed,
  [evmTx.name]: evmTx,
  [xrplTx.name]: xrplTx,
  [correction.name]: correction,
});
