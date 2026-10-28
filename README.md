# KleinData v2 · Smart Insight Studio

**Make data make sense.** KleinData adalah workspace analytics ringan yang mengubah data mentah menjadi ringkasan, SQL, grafik, dan pilihan insight yang dapat dijelaskan.

[![SvelteKit](https://img.shields.io/badge/SvelteKit-5-ff3e00)](https://svelte.dev) [![DuckDB](https://img.shields.io/badge/Engine-DuckDB--Wasm-ffc13d)](https://duckdb.org/docs/stable/clients/wasm/overview.html) [![License](https://img.shields.io/badge/License-MIT-191919)](LICENSE)

> Aplikasi sudah berganti nama dari **DataForge v1** menjadi **KleinData v2**. GitHub repository masih menggunakan URL DataForge demi menjaga kompatibilitas tautan serta integrasi deploy yang sudah ada.

## Apa yang berubah di v2?

- Desain ulang menjadi **white + black + orange** dengan aksen ungu, navigasi pill, bento cards, dan ikon bintang empat sudut.
- **Insight Studio**: 30 resep SQL analitik yang benar-benar dieksekusi terhadap dataset yang diimpor, bukan laporan hasil teks statis.
- **Rekomendasi otomatis** sesaat setelah dataset diimpor, jika skema kolom memungkinkan.
- **Deteksi dan pemetaan kolom**: tanggal, nilai utama, kategori, pendapatan, biaya, dan ID pelanggan. Pengguna dapat mengoreksinya.
- Analisis tanpa prasyarat kolom ditandai siap; yang membutuhkan kolom lain ditandai `Perlu kolom`, bukan membuat hasil buatan.
- Hasil analisis dilengkapi ringkasan angka, keterangan, peringkat/bar chart, tabel, SQL, ekspor CSV, dan laporan Markdown.
- Fitur sebelumnya tetap tersedia: Data Explorer, SQL Playground, Visualizations (bar, line, donut), Data Quality, ekspor, dan demo.

### 30 jenis insight yang tersedia

| Kategori | Pilihan |
|---|---|
| Ringkasan (8) | Total baris, total nilai, rata-rata, median, maksimum, minimum, persentil 90, nilai nonpositif |
| Peringkat & Segmen (7) | Kategori tertinggi, kategori terendah, paling sering muncul, rata-rata kategori, kontribusi kategori (%), 10 record terbesar, 10 record terkecil |
| Penjualan & Profit (5) | Total pendapatan, estimasi profit, margin estimasi, kategori paling menguntungkan, kategori dengan selisih negatif |
| Tren Waktu (5) | Tren pendapatan per bulan, bulan penurunan terbesar, bulan kenaikan terbesar, volume bulanan, rata-rata nilai bulanan |
| Pelanggan (3) | Pelanggan unik, pelanggan berulang menurut record, pelanggan nilai terbesar |
| Kualitas Data (2) | Data kosong per kolom, baris identik/duplikat |

**Catatan metodologi:** Profit yang ditampilkan adalah *pendapatan dikurangi kolom biaya*. Ini bukan laba bersih jika biaya operasional, pajak, dan retur belum masuk. Penurunan terhadap bulan sebelumnya tidak membuktikan penyebab penurunan; insight hanya bersifat deskriptif. `Pelanggan berulang` berarti ID muncul di lebih dari satu record—bila satu pesanan terdiri dari beberapa baris, itu belum tentu pembelian berulang.

Semua analisis bekerja berdasarkan nama dan tipe kolom dataset. Insight tanggal, revenue, cost, category, dan customer hanya aktif jika datanya ada/dipetakan. Hasil berasal dari query DuckDB. **Tidak menggunakan AI API** dan tidak mengirim data pengguna ke LLM eksternal.

## Cara memakai

1. Buka aplikasi dan klik **Explore sample data**, atau impor CSV, TSV, JSON, XLSX, atau Parquet (maksimum 60 MB).
2. Lihat hasil otomatis di kartu **Yang perlu kamu ketahui dari data ini**.
3. Pilih **Insight Studio** untuk mengakses 30 pilihan. Kartu berstatus *Siap* bisa langsung dieksekusi.
4. Jika hasil tidak sesuai atau analisis berstatus *Perlu kolom*, buka **Pemetaan kolom** dan pilih kolom yang tepat.
5. Klik analisis, baca *Hasil utama*, diagram, tabel bukti dan SQL. Ekspor hasil ke CSV atau laporan Markdown.
6. Gunakan SQL Playground untuk pertanyaan bebas terhadap tabel `dataset`; gunakan Visualizations untuk grafik manual.

Contoh pertanyaan: *Kapan pendapatan mengalami penurunan terbesar?* membutuhkan `Tanggal` dan `Pendapatan`. KleinData mengelompokkan omzet per bulan, membandingkan setiap bulan terhadap sebelumnya, dan memberi periode beserta besarnya perubahan. Dataset harus memiliki setidaknya dua bulan dengan tanggal valid.

## Teknologi

| Layer | Pilihan |
|---|---|
| Web | SvelteKit 2, Svelte 5, TypeScript |
| SQL Analytics | DuckDB-Wasm (browser runtime yang di-host sendiri) |
| Data visualisasi | Chart.js |
| Animation | GSAP, dengan dukungan `prefers-reduced-motion` |
| UI | CSS responsif, Lucide Svelte |
| API | Hono melalui SvelteKit endpoint `/api/health` |
| Future schema | Drizzle ORM untuk Cloudflare D1 (belum diaktifkan) |
| Hosting | Vercel Hobby; adapter alternatif Cloudflare Workers |
| CI | GitHub Actions: type check, build, Playwright |

## Local development

Node.js 22+ direkomendasikan.

```bash
git clone https://github.com/Darren0099/DataForge.git
cd DataForge
npm install
npm run dev
```

Test:

```bash
npm run check
npm run build
npx playwright install chromium
npm test
```

Deployment menggunakan adapter Vercel secara default. Cloudflare dapat dibuild dengan `DEPLOY_TARGET=cloudflare npm run build`, lalu `npx wrangler deploy`, setelah konfigurasi akun valid.

## Privasi dan keterbatasan

- Dataset tetap diproses dalam mesin DuckDB yang berjalan di browser.
- Tidak ada API upload dataset. Data di memori akan hilang ketika halaman di-refresh.
- Runtime WASM/Worker dibundel dan disajikan dari server aplikasi.
- Data visualisasi yang disimpan di browser hanyalah **konfigurasi grafik**, bukan seluruh dataset.
- Penjelajahan tabel dibatasi 10 baris preview; hasil SQL membatasi hasil tampil maksimal 1.000 baris.
- Ekspor dari overview mengambil hingga 1.000 record; untuk dataset besar gunakan SQL atau file asal.
- Deteksi kolom adalah heuristik nama dan tipe, tidak selalu benar. Sebelum menarik kesimpulan, periksa pemetaan kolom, satuan, periode, biaya, dan kualitas tanggal.
- Belum ada akun, sinkronisasi cloud, project bersama, atau penjadwalan laporan.

**Lisensi:** MIT · [Darren0099](https://github.com/Darren0099).
