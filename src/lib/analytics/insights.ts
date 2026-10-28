import { runQuery, type DatasetInfo, type QueryOutput } from './engine';

export type Role = 'date' | 'value' | 'category' | 'revenue' | 'cost' | 'customer';
export type RoleMap = Record<Role, string>;
export type InsightGroup = 'Ringkasan' | 'Peringkat & Segmen' | 'Penjualan & Profit' | 'Tren Waktu' | 'Pelanggan' | 'Kualitas Data';
export type InsightKind = 'number' | 'ranking' | 'period' | 'change' | 'rows' | 'quality';
export type InsightDefinition = {
  id: string;
  title: string;
  description: string;
  group: InsightGroup;
  needs: Role[];
  kind: InsightKind;
  query: (roles: RoleMap, info: DatasetInfo) => string;
};
export type InsightResult = { definition: InsightDefinition; sql: string; output: QueryOutput; headline: string; detail: string; chart: Array<{ label: string; value: number }> };

const q = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const n = (name: string) => 'TRY_CAST(' + q(name) + ' AS DOUBLE)';
const v = (r: RoleMap) => n(r.value);
const s = (r: RoleMap, role: Role = 'value') => 'SUM(' + n(r[role]) + ')';
const d = (r: RoleMap) => 'TRY_CAST(' + q(r.date) + ' AS DATE)';
const month = (r: RoleMap) => 'DATE_TRUNC(\'month\', ' + d(r) + ')';
const grouped = (r: RoleMap, role: Role = 'category', mode: 'SUM' | 'AVG' | 'COUNT' = 'SUM', order: 'DESC' | 'ASC' = 'DESC', limit = 12) => {
  const measure = mode === 'COUNT' ? 'COUNT(*)' : mode + '(' + v(r) + ')';
  return 'SELECT CAST(' + q(r[role]) + ' AS VARCHAR) AS label, ' + measure + ' AS value FROM dataset WHERE ' + q(r[role]) + ' IS NOT NULL GROUP BY 1 ORDER BY value ' + order + ' NULLS LAST LIMIT ' + limit;
};
const months = (r: RoleMap, mode: 'revenue' | 'value' | 'count' = 'revenue') =>
  'SELECT CAST(' + month(r) + ' AS VARCHAR) AS label, ' + (mode === 'count' ? 'COUNT(*)' : s(r, mode)) +
  ' AS value FROM dataset WHERE ' + d(r) + ' IS NOT NULL GROUP BY 1 ORDER BY 1 ASC';
const deltas = (r: RoleMap, order: 'ASC' | 'DESC') =>
  'WITH monthly AS (' + months(r) + '), diffs AS (SELECT label, value, LAG(value) OVER (ORDER BY label) AS previous FROM monthly) ' +
  'SELECT label, value, previous, value - previous AS change, CASE WHEN previous <> 0 THEN ROUND((value - previous) * 100.0 / ABS(previous), 2) END AS pct FROM diffs WHERE previous IS NOT NULL AND ' + (order === 'ASC' ? 'value < previous' : 'value > previous') + ' ORDER BY change ' + order + ' LIMIT 12';

const make = (id: string, title: string, group: InsightGroup, description: string, needs: Role[], kind: InsightKind, query: InsightDefinition['query']): InsightDefinition => ({
  id, title, group, description, needs, kind, query
});

export const insightCatalog: InsightDefinition[] = [
  make('record-count', 'Berapa total baris data?', 'Ringkasan', 'Hitung seluruh record yang tersedia.', [], 'number', () => 'SELECT COUNT(*) AS value FROM dataset'),
  make('total-value', 'Total nilai keseluruhan', 'Ringkasan', 'Jumlahkan kolom numerik utama.', ['value'], 'number', r => 'SELECT ' + s(r) + ' AS value FROM dataset'),
  make('average-value', 'Rata-rata nilai', 'Ringkasan', 'Cari nilai rata-rata seluruh record.', ['value'], 'number', r => 'SELECT AVG(' + v(r) + ') AS value FROM dataset'),
  make('median-value', 'Median nilai', 'Ringkasan', 'Titik tengah yang lebih tahan terhadap nilai ekstrem.', ['value'], 'number', r => 'SELECT MEDIAN(' + v(r) + ') AS value FROM dataset'),
  make('highest-value', 'Nilai terbesar', 'Ringkasan', 'Temukan nilai maksimum pada dataset.', ['value'], 'number', r => 'SELECT MAX(' + v(r) + ') AS value FROM dataset'),
  make('lowest-value', 'Nilai terkecil', 'Ringkasan', 'Temukan nilai minimum pada dataset.', ['value'], 'number', r => 'SELECT MIN(' + v(r) + ') AS value FROM dataset'),
  make('percentile90', 'Persentil ke-90', 'Ringkasan', 'Batas yang mencakup 90% nilai valid.', ['value'], 'number', r => 'SELECT QUANTILE_CONT(' + v(r) + ', 0.9) AS value FROM dataset'),
  make('negative-values', 'Jumlah nilai nol atau negatif', 'Ringkasan', 'Deteksi record dengan angka yang mungkin perlu diperiksa.', ['value'], 'number', r => 'SELECT COUNT(*) FILTER (WHERE ' + v(r) + ' <= 0) AS value FROM dataset'),

  make('top-categories', 'Kategori dengan nilai tertinggi', 'Peringkat & Segmen', 'Urutkan kategori berdasarkan total metrik.', ['category', 'value'], 'ranking', r => grouped(r)),
  make('bottom-categories', 'Kategori dengan nilai terendah', 'Peringkat & Segmen', 'Identifikasi kategori yang menyumbang nilai paling kecil.', ['category', 'value'], 'ranking', r => grouped(r, 'category', 'SUM', 'ASC')),
  make('most-common', 'Kategori paling sering muncul', 'Peringkat & Segmen', 'Hitung kemunculan setiap kategori.', ['category'], 'ranking', r => grouped(r, 'category', 'COUNT')),
  make('average-category', 'Rata-rata per kategori', 'Peringkat & Segmen', 'Bandingkan rata-rata metrik antarsegmen.', ['category', 'value'], 'ranking', r => grouped(r, 'category', 'AVG')),
  make('category-share', 'Kontribusi setiap kategori (%)', 'Peringkat & Segmen', 'Pangsa tiap kategori dari total nilai seluruh dataset.', ['category', 'value'], 'ranking', r =>
    'SELECT CAST(' + q(r.category) + ' AS VARCHAR) AS label, ROUND(100.0 * ' + s(r) + ' / NULLIF((SELECT ' + s(r) + ' FROM dataset), 0), 2) AS value FROM dataset WHERE ' + q(r.category) + ' IS NOT NULL GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT 12'),
  make('top-records', '10 record dengan nilai terbesar', 'Peringkat & Segmen', 'Lihat record ekstrem tinggi dan semua atributnya.', ['value'], 'rows', r => 'SELECT * FROM dataset ORDER BY ' + v(r) + ' DESC NULLS LAST LIMIT 10'),
  make('bottom-records', '10 record dengan nilai terkecil', 'Peringkat & Segmen', 'Lihat record ekstrem rendah dan semua atributnya.', ['value'], 'rows', r => 'SELECT * FROM dataset ORDER BY ' + v(r) + ' ASC NULLS LAST LIMIT 10'),

  make('gross-revenue', 'Total penjualan / pendapatan', 'Penjualan & Profit', 'Hitung total omzet, bukan keuntungan bersih.', ['revenue'], 'number', r => 'SELECT ' + s(r, 'revenue') + ' AS value FROM dataset'),
  make('gross-profit', 'Profit estimasi (penjualan − biaya)', 'Penjualan & Profit', 'Selisih pendapatan dan biaya yang tercatat, bukan laba bersih akuntansi.', ['revenue', 'cost'], 'number', r => 'SELECT SUM(' + n(r.revenue) + ' - ' + n(r.cost) + ') AS value FROM dataset'),
  make('profit-margin', 'Margin profit estimasi (%)', 'Penjualan & Profit', 'Persentase selisih pendapatan–biaya terhadap pendapatan.', ['revenue', 'cost'], 'number', r =>
    'SELECT ROUND(100.0 * SUM(' + n(r.revenue) + ' - ' + n(r.cost) + ') / NULLIF(' + s(r, 'revenue') + ',0),2) AS value FROM dataset'),
  make('profitable-categories', 'Kategori dengan profit terbesar', 'Penjualan & Profit', 'Peringkat selisih pendapatan dan biaya per kategori.', ['category', 'revenue', 'cost'], 'ranking', r =>
    'SELECT CAST(' + q(r.category) + ' AS VARCHAR) AS label, SUM(' + n(r.revenue) + ' - ' + n(r.cost) + ') AS value FROM dataset GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT 12'),
  make('loss-categories', 'Kategori berpotensi merugi', 'Penjualan & Profit', 'Hanya tampilkan kategori yang tercatat dengan selisih negatif.', ['category', 'revenue', 'cost'], 'ranking', r =>
    'SELECT CAST(' + q(r.category) + ' AS VARCHAR) AS label, SUM(' + n(r.revenue) + ' - ' + n(r.cost) + ') AS value FROM dataset GROUP BY 1 HAVING SUM(' + n(r.revenue) + ' - ' + n(r.cost) + ') < 0 ORDER BY value ASC LIMIT 12'),

  make('sales-timeline', 'Tren pendapatan per bulan', 'Tren Waktu', 'Grafik perubahan penjualan antarbulan.', ['date', 'revenue'], 'period', r => months(r)),
  make('largest-decline', 'Bulan penurunan penjualan terbesar', 'Tren Waktu', 'Bandingkan omzet setiap bulan dengan bulan sebelumnya, bukan menyimpulkan sebabnya.', ['date', 'revenue'], 'change', r => deltas(r, 'ASC')),
  make('fastest-growth', 'Bulan pertumbuhan penjualan terbesar', 'Tren Waktu', 'Cari kenaikan nominal tertinggi dibanding bulan sebelumnya.', ['date', 'revenue'], 'change', r => deltas(r, 'DESC')),
  make('volume-monthly', 'Jumlah transaksi per bulan', 'Tren Waktu', 'Bandingkan volume record berdasarkan tanggal.', ['date'], 'period', r => months(r, 'count')),
  make('average-monthly', 'Rata-rata nilai per bulan', 'Tren Waktu', 'Pantau perubahan rata-rata kolom numerik dari waktu ke waktu.', ['date', 'value'], 'period', r =>
    'SELECT CAST(' + month(r) + ' AS VARCHAR) AS label, AVG(' + v(r) + ') AS value FROM dataset WHERE ' + d(r) + ' IS NOT NULL GROUP BY 1 ORDER BY 1'),

  make('unique-customers', 'Total pelanggan unik', 'Pelanggan', 'Hitung pengenal pelanggan berbeda.', ['customer'], 'number', r => 'SELECT COUNT(DISTINCT ' + q(r.customer) + ') AS value FROM dataset'),
  make('repeat-customers', 'Pelanggan dengan lebih dari satu record', 'Pelanggan', 'Jumlah pelanggan yang muncul berulang, bukan otomatis pembelian berulang jika satu transaksi memiliki beberapa baris.', ['customer'], 'number', r =>
    'SELECT COUNT(*) AS value FROM (SELECT ' + q(r.customer) + ' FROM dataset WHERE ' + q(r.customer) + ' IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) t'),
  make('high-value-customers', 'Pelanggan dengan nilai terbesar', 'Pelanggan', 'Peringkat total metrik per pelanggan.', ['customer', 'value'], 'ranking', r => grouped(r, 'customer')),

  make('missing-cells', 'Kolom dengan data kosong', 'Kualitas Data', 'Tampilkan jumlah nilai kosong untuk setiap kolom.', [], 'quality', (_r, info) =>
    info.columns.map(c => 'SELECT ' + "'" + c.name.replaceAll("'", "''") + "'" + ' AS label, COUNT(*) FILTER (WHERE ' + q(c.name) + ' IS NULL OR TRIM(CAST(' + q(c.name) + ' AS VARCHAR)) = \'\') AS value FROM dataset').join(' UNION ALL ') + ' ORDER BY value DESC'),
  make('duplicate-rows', 'Potensi baris duplikat', 'Kualitas Data', 'Jumlah baris identik jika dibandingkan seluruh kolom.', [], 'number', () =>
    'SELECT (SELECT COUNT(*) FROM dataset) - (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM dataset)) AS value')
];

const numeric = (t: string) => /INT|DECIMAL|DOUBLE|FLOAT|REAL|HUGEINT|NUMERIC/.test(t.toUpperCase());
const dateType = (t: string) => /DATE|TIME/.test(t.toUpperCase());
const find = (info: DatasetInfo, aliases: string[], predicate?: (col: DatasetInfo['columns'][number]) => boolean) =>
  info.columns.find(col => (!predicate || predicate(col)) && aliases.some(alias =>
    col.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(alias.replace(/[^a-z0-9]/g, ''))))?.name ?? '';
const numericCol = (col: DatasetInfo['columns'][number]) => numeric(col.type);
export function inferRoles(info: DatasetInfo): RoleMap {
  const revenue = find(info, ['revenue','salesamount','totalsales','net sales','omzet','pendapatan','penjualan','sales'], numericCol);
  const cost = find(info, ['cost','cogs','hpp','biaya','modal','expense'], numericCol);
  const date = find(info, ['order_date','sales_date','transaction_date','tanggal','date','waktu','timestamp','period','bulan'], () => true)
    || info.columns.find(col => dateType(col.type))?.name || '';
  const category = find(info, ['category','kategori','product','produk','segment','segmen','divisi','department','jenis'], () => true)
    || info.columns.find(col => /VARCHAR|TEXT|STRING/.test(col.type.toUpperCase()) && col.unique > 1 && col.unique < Math.max(info.rows * 0.65, 4))?.name || '';
  const customer = find(info, ['customer_id','customer','pelanggan','client','buyer','member','pembeli'], () => true);
  const value = revenue || find(info, ['profit','amount','total','nilai','value','price','harga','qty','jumlah','units','score'], numericCol)
    || info.columns.find(numericCol)?.name || '';
  return { date, value, category, revenue, cost, customer };
}
export const compatible = (item: InsightDefinition, roles: RoleMap) => item.needs.every(role => !!roles[role]);
export const missingRoles = (item: InsightDefinition, roles: RoleMap) => item.needs.filter(role => !roles[role]);
export const roleLabels: Record<Role, string> = {
  date: 'Tanggal', value: 'Nilai utama', category: 'Kategori/segmen', revenue: 'Pendapatan', cost: 'Biaya', customer: 'ID pelanggan'
};
const fmt = (n: unknown) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 });
export async function executeInsight(def: InsightDefinition, roles: RoleMap, info: DatasetInfo): Promise<InsightResult> {
  if (!compatible(def, roles)) throw new Error('Kolom yang dibutuhkan belum dipetakan.');
  const sql = def.query(roles, info);
  const output = await runQuery(sql);
  const rows = output.rows;
  const first = rows[0];
  const chart = def.kind === 'number' || def.kind === 'rows' ? [] :
    rows.slice(0, 12).filter(row => Number.isFinite(Number(row.value))).map(row => ({ label: String(row.label ?? 'Tidak diketahui').slice(0, 36), value: Number(row.value) }));
  if (!rows.length) return { definition: def, sql, output, chart: [], headline: 'Tidak ada pola yang cocok', detail: def.kind === 'change' ? 'Tidak ditemukan perubahan dengan arah tersebut, atau data belum mencakup dua periode tanggal valid.' : 'Tidak ada baris yang cocok dengan kondisi analisis ini.' };
  if (def.kind === 'number') {
    const amount = first?.value;
    return { definition: def, sql, output, chart, headline: amount == null ? 'Tidak tersedia' : fmt(amount), detail: amount == null ? 'Data tidak cukup untuk menghitung hasil.' : 'Hasil dihitung langsung dari tabel dataset dengan DuckDB. Periksa satuan kolom sebelum menafsirkan angka.' };
  }
  if (def.kind === 'change') {
    const change = Number(first?.change ?? 0);
    const percentage = first?.pct == null ? 'persentase tidak tersedia' : fmt(first.pct) + '%';
    const headline = String(first?.label ?? '—').slice(0, 10);
    return { definition: def, sql, output, chart, headline,
      detail: 'Perubahan pada ' + headline + ': ' + (change > 0 ? '+' : '') + fmt(change) + ' (' + percentage + ') dibanding periode sebelumnya. Kenaikan/penurunan tidak menjelaskan penyebab.' };
  }
  if (def.kind === 'rows') return { definition: def, sql, output, chart, headline: fmt(rows.length) + ' record', detail: 'Urutan dihitung dari kolom nilai utama. Lihat tabel untuk atribut lengkap.' };
  if (def.kind === 'period') {
    const last = rows.at(-1), prior = rows.at(-2);
    const change = prior && Number(prior.value) !== 0 ? (Number(last?.value) - Number(prior.value)) / Math.abs(Number(prior.value)) * 100 : null;
    return { definition: def, sql, output, chart, headline: last ? fmt(last.value) : '—',
      detail: last ? 'Periode terakhir: ' + String(last.label).slice(0, 10) + (change == null ? '. Perlu dua periode untuk menghitung perubahan.' : '. Perubahan terhadap periode sebelumnya: ' + (change > 0 ? '+' : '') + fmt(change) + '%.') : 'Tidak ada tanggal valid.' };
  }
  const top = first;
  return { definition: def, sql, output, chart, headline: top ? (String(top.label ?? '—') + ' · ' + fmt(top.value)) : 'Tidak ditemukan',
    detail: def.kind === 'quality' ? 'Hasil menampilkan jumlah data kosong berdasarkan kolom.' : 'Peringkat diurutkan berdasarkan perhitungan nyata. Interpretasikan dengan memperhatikan konteks data.' };
}

export async function quickInsights(info: DatasetInfo, roles: RoleMap) {
  const ids = ['record-count', 'gross-revenue', 'largest-decline', 'top-categories', 'missing-cells'];
  const available = ids.map(id => insightCatalog.find(item => item.id === id)!).filter(item => compatible(item, roles));
  const results: InsightResult[] = [];
  for (const item of available.slice(0, 4)) {
    try { results.push(await executeInsight(item, roles, info)); } catch { /* Preview is optional. Other insights remain available. */ }
  }
  return results;
}
