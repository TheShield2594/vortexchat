#!/usr/bin/env node
/**
 * Migration smoke test
 *
 * Runs `supabase db reset` (applies all migrations from scratch), then
 * connects to the local Postgres instance and asserts that:
 *
 *   1. All expected tables exist in the `public` schema
 *   2. Every expected table has Row Level Security enabled
 *
 * Usage (from repo root):
 *   node scripts/migration-smoke-test.mjs
 *
 * Prerequisites:
 *   - Supabase CLI installed and `supabase start` has been run at least once
 *   - PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE env vars, or the
 *     local defaults below are used.
 *
 * Exit code:
 *   0 – all assertions passed
 *   1 – one or more assertions failed (details printed to stderr)
 */

import { execSync } from "node:child_process"
import { createRequire } from "node:module"

// ── Postgres connection ───────────────────────────────────────────────────────
// `supabase start` exposes Postgres on 54322 with the default credentials.
const PG_HOST = process.env.PGHOST ?? "localhost"
const PG_PORT = process.env.PGPORT ?? "54322"
const PG_USER = process.env.PGUSER ?? "postgres"
const PG_PASSWORD = process.env.PGPASSWORD ?? "postgres"
const PG_DATABASE = process.env.PGDATABASE ?? "postgres"

// ── Expected tables ───────────────────────────────────────────────────────────
// Derived from the RLS-enabling statements across all migration files.
// Every table listed here MUST:
//   • exist in the public schema after `supabase db reset`
//   • have row_security = true (ALTER TABLE … ENABLE ROW LEVEL SECURITY)
const EXPECTED_TABLES_WITH_RLS = [
  "users",
  "servers",
  "server_members",
  "roles",
  "member_roles",
  "channels",
  "channel_permissions",
  "messages",
  "attachments",
  "reactions",
  "direct_messages",
  "dm_attachments",
  "voice_states",
  "notifications",
  "server_emojis",
  "webhooks",
  "threads",
  "thread_members",
  "thread_read_states",
  "friendships",
  "invites",
  "read_states",
  "dm_channels",
  "dm_channel_members",
  "dm_read_states",
  "events",
  "event_rsvps",
  "event_hosts",
  "event_reminders",
  "server_bans",
  "member_timeouts",
  "audit_logs",
  "moderation_appeals",
  "moderation_appeal_status_events",
  "moderation_appeal_internal_notes",
  "moderation_decision_templates",
  "member_screening",
  "screening_configs",
  "automod_rules",
  "automod_rule_analytics",
  "push_subscriptions",
  "notification_settings",
  "auth_sessions",
  "auth_challenges",
  "auth_security_policies",
  "auth_trusted_devices",
  "passkey_credentials",
  "recovery_codes",
  "login_attempts",
  "login_risk_events",
  "reports",
  "app_catalog",
  "app_catalog_credentials",
  "app_commands",
  "app_event_subscriptions",
  "app_rate_limits",
  "app_reviews",
  "app_usage_metrics",
  "server_app_installs",
  "server_app_install_credentials",
  "channel_tasks",
  "channel_docs",
  "workspace_updates",
  "social_alerts",
  "attachment_scan_metrics",
  "voice_call_sessions",
  "voice_call_participants",
  "voice_call_summaries",
  "voice_intelligence_policies",
  "voice_intelligence_audit_log",
  "voice_transcript_segments",
  "voice_transcript_translations",
  "dm_channel_keys",
  "user_device_keys",
  "user_connections",
]

// ── Step 1: reset the database ────────────────────────────────────────────────
console.log("⟳  Running supabase db reset …")
try {
  execSync("supabase db reset", {
    stdio: "inherit",
    encoding: "utf8",
  })
  console.log("✓  supabase db reset completed\n")
} catch (err) {
  console.error("✗  supabase db reset failed:", err.message)
  process.exit(1)
}

// ── Step 2: query the database ────────────────────────────────────────────────
// Dynamically import `pg` so the script can be run with plain Node without a
// build step, as long as `pg` is installed somewhere in the workspace.
let pg
try {
  const require = createRequire(import.meta.url)
  pg = require("pg")
} catch {
  console.error(
    "✗  Could not load the `pg` package.\n" +
      "   Install it with: npm install --save-dev pg\n" +
      "   Or run the smoke test inside a workspace that already has it."
  )
  process.exit(1)
}

const { Client } = pg

const client = new Client({
  host: PG_HOST,
  port: Number(PG_PORT),
  user: PG_USER,
  password: PG_PASSWORD,
  database: PG_DATABASE,
})

await client.connect()

// Fetch all tables in the public schema and their RLS status in one query.
const { rows } = await client.query(`
  SELECT
    c.relname          AS table_name,
    c.relrowsecurity   AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY c.relname
`)

await client.end()

const existing = new Map(rows.map((r) => [r.table_name, r.rls_enabled]))

// ── Step 3: assert tables exist and have RLS ──────────────────────────────────
let failures = 0

for (const table of EXPECTED_TABLES_WITH_RLS) {
  if (!existing.has(table)) {
    console.error(`✗  Table missing:      public.${table}`)
    failures++
    continue
  }
  if (!existing.get(table)) {
    console.error(`✗  RLS not enabled on: public.${table}`)
    failures++
  }
}

// Report tables present in the DB but not in our expected list (informational)
const unexpected = [...existing.keys()].filter(
  (t) => !EXPECTED_TABLES_WITH_RLS.includes(t)
)
if (unexpected.length > 0) {
  console.warn(
    `⚠  Tables in DB but not in expected list (add them if they need RLS):\n` +
      unexpected.map((t) => `     public.${t}`).join("\n")
  )
}

if (failures > 0) {
  console.error(`\n✗  ${failures} assertion(s) failed.`)
  process.exit(1)
}

console.log(
  `✓  All ${EXPECTED_TABLES_WITH_RLS.length} expected tables exist with RLS enabled.`
)
