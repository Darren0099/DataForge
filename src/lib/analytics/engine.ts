import * as duckdb from '@duckdb/duckdb-wasm';
import readXlsxFile from 'read-excel-file/browser';

export type DataRow = Record<string, unknown>;
export type ColumnInfo = { name: string; type: string; missing: number; unique: number };
export type DatasetInfo = { name: string; rows: number; columns: ColumnInfo[]; preview: DataRow[] };
export type QueryOutput = { columns: string[]; rows: DataRow[]; duration: number };
export type ChartPoint = { label: string; value: number };

let database: duckdb.AsyncDuckDB | undefined;
let connection: duckdb.AsyncDuckDBConnection | undefined;
let fileSequence = 0;

const asNumber = (input: unknown): number => {
  if (typeof input === 'bigint') return Number(input);
  return Number(input ?? 0);
};
const sanitize = (value: unknown): unknown => {
  if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Array.from(value);
  return value;
};
const normalize = (row: unknown): DataRow => {
  const source = row && typeof row === 'object' && 'toJSON' in row && typeof (row as {toJSON: () => unknown}).toJSON === 'function'
    ? (row as {toJSON: () => Record<string, unknown>}).toJSON()
    : row as Record<string, unknown>;
  return Object.fromEntries(Object.entries(source ?? {}).map(([key, value]) => [key, sanitize(value)]));
};
const quoteIdentifier = (identifier: string): string => '"' + identifier.replaceAll('"', '""') + '"';
const quoteLiteral = (str: string): string => "'" + str.replaceAll("'", "''") + "'";

export async function getConnection() {
  if (connection) return connection;
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  if (!bundle.mainWorker) throw new Error('Unable to load DuckDB analytics worker.');
  const url = URL.createObjectURL(new Blob(['importScripts(' + JSON.stringify(bundle.mainWorker) + ');'], { type: 'text/javascript' }));
  const worker = new Worker(url);
  try {
    const instance = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await instance.instantiate(bundle.mainModule, bundle.pthreadWorker);
    database = instance;
    connection = await instance.connect();
    return connection;
  } catch (error) {
    worker.terminate();
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function runQuery(sql: string): Promise<QueryOutput> {
  const conn = await getConnection();
  const started = performance.now();
  const result = await conn.query(sql);
  const rows = result.toArray().slice(0, 1000).map(normalize);
  return { rows, columns: result.schema.fields.map((field) => field.name), duration: Math.round(performance.now() - started) };
}

function csvEncode(rows: unknown[][]) {
  return rows.map((row) => row.map((cell) => {
    const value = cell instanceof Date ? cell.toISOString() : String(cell ?? '');
    return '"' + value.replaceAll('"', '""') + '"';
  }).join(',')).join('\n');
}

export async function loadFile(file: File): Promise<DatasetInfo> {
  const suffix = file.name.toLowerCase().split('.').pop();
  if (!['csv', 'tsv', 'json', 'parquet', 'xlsx'].includes(suffix ?? '')) {
    throw new Error('Unsupported format. Please use CSV, TSV, JSON, Parquet or XLSX.');
  }
  if (file.size > 60 * 1024 * 1024) throw new Error('File is larger than 60 MB. Please use a smaller sample.');
  const conn = await getConnection();
  let data = new Uint8Array(await file.arrayBuffer());
  let type = suffix ?? 'csv';
  if (type === 'xlsx') {
    const sheet = await readXlsxFile(file);
    if (!sheet.length) throw new Error('The Excel workbook is empty.');
    data = new TextEncoder().encode(csvEncode(sheet));
    type = 'csv';
  }
  const path = 'dataforge_' + (++fileSequence) + '.' + type;
  await database!.registerFileBuffer(path, data);
  const reader = type === 'parquet' ? 'read_parquet'
    : type === 'json' ? 'read_json_auto'
    : type === 'tsv' ? 'read_csv_auto' : 'read_csv_auto';
  const params = type === 'tsv' ? ', delim=\'\\t\', header=true, sample_size=-1'
    : type === 'csv' ? ', header=true, sample_size=-1' : '';
  await conn.query('CREATE OR REPLACE TABLE dataset AS SELECT * FROM ' + reader + '(' + quoteLiteral(path) + params + ')');
  return inspectDataset(file.name);
}

export async function loadDemo(): Promise<DatasetInfo> {
  const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];
  const categories = ['Electronics', 'Home & Living', 'Fashion', 'Sports'];
  const channels = ['Online', 'Retail', 'Partner'];
  const rows: unknown[][] = [['order_id', 'order_date', 'region', 'category', 'channel', 'units', 'revenue', 'cost', 'customer_rating']];
  for (let i = 0; i < 240; i++) {
    const units = 2 + (i * 7) % 21;
    const revenue = units * (42 + (i * 13) % 98);
    const cost = Math.round(revenue * (0.48 + (i % 7) * 0.035));
    const date = new Date(Date.UTC(2026, Math.floor(i / 20), (i % 27) + 1));
    rows.push(['DF-' + String(i + 1).padStart(4, '0'), date.toISOString().slice(0, 10), regions[i % 4], categories[(i * 3 + Math.floor(i / 7)) % 4], channels[i % 3], units, revenue, cost, (3.2 + (i % 17) * 0.1).toFixed(1)]);
  }
  const data = new TextEncoder().encode(csvEncode(rows));
  const conn = await getConnection();
  const path = 'dataforge_demo_' + (++fileSequence) + '.csv';
  await database!.registerFileBuffer(path, data);
  await conn.query('CREATE OR REPLACE TABLE dataset AS SELECT * FROM read_csv_auto(' + quoteLiteral(path) + ', header=true, sample_size=-1)');
  return inspectDataset('Retail Performance 2026.csv');
}

export async function inspectDataset(name: string): Promise<DatasetInfo> {
  const conn = await getConnection();
  const description = (await conn.query('DESCRIBE dataset')).toArray().map(normalize);
  const count = (await conn.query('SELECT COUNT(*) AS total FROM dataset')).toArray().map(normalize);
  const preview = (await conn.query('SELECT * FROM dataset LIMIT 10')).toArray().map(normalize);
  const columns: ColumnInfo[] = [];
  for (const col of description.slice(0, 60)) {
    const colName = String(col.column_name);
    const identifier = quoteIdentifier(colName);
    const metrics = (await conn.query('SELECT COUNT(*) FILTER (WHERE ' + identifier + ' IS NULL OR TRIM(CAST(' + identifier + ' AS VARCHAR)) = \'\') AS missing, COUNT(DISTINCT ' + identifier + ') AS unique_count FROM dataset')).toArray().map(normalize)[0];
    columns.push({ name: colName, type: String(col.column_type), missing: asNumber(metrics.missing), unique: asNumber(metrics.unique_count) });
  }
  return { name, rows: asNumber(count[0].total), columns, preview };
}

export async function cleanDataset(mode: 'duplicates' | 'nulls', datasetName: string) {
  const conn = await getConnection();
  const criteria = mode === 'duplicates' ? 'SELECT DISTINCT * FROM dataset'
    : 'SELECT * FROM dataset WHERE ' + (await inspectDataset(datasetName)).columns.map((col) => quoteIdentifier(col.name) + ' IS NOT NULL AND TRIM(CAST(' + quoteIdentifier(col.name) + ' AS VARCHAR)) <> \'\'').join(' AND ');
  await conn.query('CREATE OR REPLACE TABLE dataset_clean AS ' + criteria);
  await conn.query('DROP TABLE dataset');
  await conn.query('ALTER TABLE dataset_clean RENAME TO dataset');
  return inspectDataset(datasetName);
}

export async function getChartData(x: string, y: string, aggregate: 'sum' | 'avg' | 'count'): Promise<ChartPoint[]> {
  const xCol = quoteIdentifier(x);
  const value = aggregate === 'count' ? 'COUNT(*)'
    : (aggregate === 'avg' ? 'AVG' : 'SUM') + '(TRY_CAST(' + quoteIdentifier(y) + ' AS DOUBLE))';
  const sql = 'SELECT CAST(' + xCol + ' AS VARCHAR) AS label, ' + value + ' AS value FROM dataset GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT 12';
  const result = await runQuery(sql);
  return result.rows.map((item) => ({ label: String(item.label ?? 'Unknown'), value: asNumber(item.value) })).reverse();
}

export function downloadText(content: string, filename: string, type = 'text/plain') {
  const object = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = object;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(object), 1500);
}
export function asCSV(rows: DataRow[], columnNames?: string[]): string {
  const names = columnNames ?? Object.keys(rows[0] ?? {});
  return csvEncode([names, ...rows.map((row) => names.map((name) => row[name]))]);
}
