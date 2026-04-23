#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { clientFromEnv } from "./wp-client.js";

loadDotenv();

const [, , cmd, ...rest] = process.argv;

const commands = {
  site: async (client) => {
    const info = await client.site();
    print(info);
  },
  "list-posts": async (client) => {
    const { data, total } = await client.listPosts({ per_page: num(rest[0], 10) });
    print(data.map(summarizePost));
    console.error(`# ${data.length} of ${total} posts`);
  },
  "get-post": async (client) => {
    const id = required(rest[0], "post id");
    const { data } = await client.getPost(id);
    print(summarizePost(data, { full: true }));
  },
  "list-pages": async (client) => {
    const { data, total } = await client.listPages({ per_page: num(rest[0], 10) });
    print(data.map(summarizePost));
    console.error(`# ${data.length} of ${total} pages`);
  },
  "list-media": async (client) => {
    const { data, total } = await client.listMedia({ per_page: num(rest[0], 10) });
    print(data.map((m) => ({ id: m.id, title: m.title?.rendered, source_url: m.source_url, mime: m.mime_type })));
    console.error(`# ${data.length} of ${total} media items`);
  },
  search: async (client) => {
    const term = required(rest[0], "search term");
    const { data } = await client.search(term);
    print(data.map((r) => ({ id: r.id, type: r.type, title: r.title, url: r.url })));
  },
};

async function main() {
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    usage();
    process.exit(cmd ? 0 : 1);
  }
  const handler = commands[cmd];
  if (!handler) {
    console.error(`Unknown command: ${cmd}`);
    usage();
    process.exit(1);
  }
  if (!process.env.WP_BASE_URL) {
    console.error("WP_BASE_URL is not set. Copy .env.example to .env and edit it.");
    process.exit(2);
  }
  const client = clientFromEnv();
  await handler(client);
}

function usage() {
  console.error(`Usage: wp <command> [...args]

Commands:
  site                      Fetch site name, description, and REST namespaces
  list-posts [limit]        List recent posts (default 10)
  get-post <id>             Fetch a single post by id
  list-pages [limit]        List pages (default 10)
  list-media [limit]        List media items (default 10)
  search <term>             Search across posts, pages, media

Env:
  WP_BASE_URL (required)    e.g. https://uae-construction.com
  WP_USERNAME               WP user login (for authenticated requests)
  WP_APP_PASSWORD           Application Password from WP admin`);
}

function summarizePost(p, { full = false } = {}) {
  const base = {
    id: p.id,
    slug: p.slug,
    status: p.status,
    date: p.date,
    link: p.link,
    title: p.title?.rendered,
  };
  if (!full) return base;
  return {
    ...base,
    excerpt: stripTags(p.excerpt?.rendered || "").slice(0, 300),
    content_length: (p.content?.rendered || "").length,
  };
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function required(v, name) {
  if (!v) {
    console.error(`Missing required argument: ${name}`);
    process.exit(2);
  }
  return v;
}

function print(v) {
  process.stdout.write(JSON.stringify(v, null, 2) + "\n");
}

function loadDotenv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "..", ".env");
  let raw;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key]) continue;
    let val = rawVal;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
