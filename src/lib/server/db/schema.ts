import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
// Optional Cloudflare D1 schema for future authenticated cloud workspaces.
// The browser-first MVP deliberately stores no user datasets on a public server.
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  configuration: text('configuration', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});
