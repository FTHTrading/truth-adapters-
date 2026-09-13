import { execFileSync } from "node:child_process";
import { isObject, optionalString, type AdapterSpec } from "./types.ts";

/**
 * Direct observation of a git commit object in a local repository.
 * Node-only (spawns `git`). Arguments are passed as an argv array; no shell.
 */
const SHA40 = /^[0-9a-f]{40}$/;

export function readCommit(repo: string, sha: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = execFileSync("git", ["-C", repo, "cat-file", "-p", sha], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
  const [headerText, ...bodyParts] = raw.split("\n\n");
  const headers = (headerText ?? "").split("\n");
  const get = (k: string) => headers.filter((h) => h.startsWith(k + " ")).map((h) => h.slice(k.length + 1));
  const tree = get("tree")[0];
  if (!tree) return null;
  const parseIdent = (line: string | undefined) => {
    if (!line) return { ident: null, time: null, tz: null };
    const m = /^(.*) (\d+) ([+-]\d{4})$/.exec(line);
    return { ident: m ? m[1]! : line, time: m ? Number(m[2]) : null, tz: m ? m[3]! : null };
  };
  return {
    tree,
    parents: get("parent"),
    author: parseIdent(get("author")[0]),
    committer: parseIdent(get("committer")[0]),
    message: bodyParts.join("\n\n"),
  };
}

async function sha256Text(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const gitCommit: AdapterSpec = {
  name: "git-commit",
  version: "1.0.0",
  observation: "direct",
  runtime: "node",
  description: "Reads a commit object from a local git repository and records tree, parents, author/committer times and the message digest.",
  price: { atomic: "1000" },
  inputExample: { repo: "C:/Users/Kevan/truth", sha: "2e3c850" },
  async translate(input, ctx) {
    if (!isObject(input)) return null;
    const repo = optionalString(input.repo, 1024);
    const ref = optionalString(input.sha, 64);
    if (!repo || !ref) return null;
    let sha: string;
    try {
      sha = execFileSync("git", ["-C", repo, "rev-parse", "--verify", `${ref}^{commit}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return null;
    }
    if (!SHA40.test(sha)) return null;
    const c = readCommit(repo, sha);
    if (!c) return null;
    const author = c.author as { time: number | null };
    const committer = c.committer as { time: number | null };
    return {
      kind: "git_commit",
      sha,
      tree: c.tree,
      parents: c.parents,
      author_time: author.time,
      committer_time: committer.time,
      message_sha256: await sha256Text(String(c.message)),
      observed_at: ctx.clock(),
    };
  },
};
