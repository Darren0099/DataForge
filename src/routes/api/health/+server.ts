import type { RequestHandler } from './$types';
import { Hono } from 'hono';
const api = new Hono();
api.get('/api/health', (c) => c.json({ status: 'ok', service: 'KleinData API', version: '2.0.0', engine: 'DuckDB-Wasm', timestamp: new Date().toISOString() }));
export const GET: RequestHandler = ({ request }) => api.fetch(request);
