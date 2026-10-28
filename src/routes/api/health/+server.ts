import type { RequestHandler } from './$types';
import { Hono } from 'hono';
const api = new Hono();
api.get('/api/health', (c) => c.json({ status: 'ok', service: 'DataForge API', engine: 'DuckDB-Wasm', timestamp: new Date().toISOString() }));
export const GET: RequestHandler = ({ request }) => api.fetch(request);
