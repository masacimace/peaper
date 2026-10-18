# Peaper — Implementation Blueprint v1.0

Baseline keputusan: percakapan sampai 19 Oktober 2026, 00:20 WIB.

Pembaruan: arahan UI/UX, global design tokens, motion, struktur kode, dan review visual selama development.

Status: scope produk yang sudah disepakati dan rencana implementasi. Dokumen ini belum merupakan hasil implementasi atau bukti aplikasi sudah berjalan.

## 1. Arah produk

Peaper adalah agentic coding tool yang berjalan di komputer pengguna dengan web UI lokal sebagai antarmuka utama. Pengguna menginstal package melalui npm, menjalankan perintah `peaper` dari folder project, lalu bekerja melalui browser.

Referensi kemampuan dan pemisahan arsitektur adalah Grok Build yang telah dikaji pada commit `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`. Implementasi Peaper memakai stack sendiri. Kajian Grok Build adalah inventaris referensi yang lebih luas; fitur di sana tidak otomatis menjadi scope awal Peaper.

Dokumen ini menjadi acuan scope terbaru ketika berbeda dari usulan dalam `Peaper-Grok-Build-Feature-Study-v0.1.md`.

## 2. Keputusan yang dikunci

| Bagian | Keputusan |
|---|---|
| Nama dan brand | Peaper / PEAPER |
| Antarmuka utama | Web UI di browser lokal |
| Distribusi | Package di npm registry dengan command `peaper` |
| Runtime | Node.js; versi yang didukung ditentukan saat validasi dependency |
| Package manager development | pnpm |
| Backend | TypeScript + Fastify |
| Frontend | React TypeScript + Vite + Tailwind CSS v4 |
| Database | SQLite melalui better-sqlite3 + FTS5 |
| ORM | Drizzle |
| Model integration | AI SDK; OpenRouter dan custom provider OpenAI-compatible |
| Validation | Zod |
| Editor dan highlighting | Monaco dan Shiki |
| Terminal browser | xterm.js melalui WebSocket ke node-pty |
| Event agent | SSE; perintah dari UI melalui HTTP |
| Visual web | Motion sebagai pilihan utama; GSAP untuk kebutuhan khusus bila diperlukan; Lucide Icons dan Google Fonts; aset/font yang diperlukan dibundel |
| UI/UX direction | Creative, modern, clean, professional; assistant memimpin art direction; aksen warna terkendali |
| Design system | Global design tokens untuk styling dan motion yang konsisten |
| Review visual | Pengguna melihat hasil awal lalu polishing berlangsung selama development |
| Engineering quality | TypeScript dan struktur folder modular, rapi, konsisten, dengan batas tanggung jawab jelas |
| CLI visual | Logo ASCII/block PEAPER, deskripsi, versi, URL, workspace, status dan stats ringkas |
| CLI styling | Logo teks statis dan warna ANSI; picocolors sesuai rekomendasi launcher |
| OpenTUI | Bukan dependency wajib; TUI penuh tidak diperlukan untuk tahap awal |
| ACP | Dikeluarkan dari scope awal |
| Subagents | Dikeluarkan dari scope awal |
| sqlite-vec | Opsional; semantic retrieval bukan prasyarat fitur dasar |
| Development pengguna | Windows 10 + VS Code |

## 3. Scope awal

### Coding agent utama

Satu agent utama menjalankan model/tool loop: memahami tugas, memeriksa workspace, melakukan perubahan, menjalankan command/test, membaca hasil, memperbaiki, dan memberikan hasil akhir. Pengguna dapat mengirim tindak lanjut dan membatalkan pekerjaan.

Tools awal mencakup pembacaan file, daftar direktori, pencarian teks/regex/file, pembuatan dan edit file/patch, serta command execution. UI menampilkan aktivitas tools, hasil, error, dan perubahan kode. Todo/progress serta pertanyaan terstruktur kepada pengguna termasuk dalam scope.

Provider configuration memuat endpoint/model, credential, parameter yang didukung, dan pemeriksaan konektivitas/kapabilitas. Custom provider tidak boleh dianggap otomatis mendukung seluruh fitur hanya karena format API-nya kompatibel.

### Session, konteks, dan pengendalian pekerjaan

Session autosave/resume, rename/search/export, context usage, compaction, serta ringkasan pekerjaan menjadi fondasi kontinuitas. Fork berarti membuat cabang percakapan untuk agent utama; fitur ini tidak membuat subagent.

Plan mode menyediakan eksplorasi, plan yang dapat ditinjau/direvisi, dan transisi ke implementasi. Permission handling dijalankan backend, dimulai bersama tools. Default policy dan rincian OS sandbox dicatat sebagai keputusan implementasi yang perlu ditetapkan sebelum akses tools luas.

Rewind percakapan dan restore file merupakan aksi terpisah dengan cakupan yang jelas. Snapshot file harus membedakan perubahan Peaper dari edit manual pengguna. Restore file tidak menjanjikan rollback efek command, database, atau layanan remote.

Background task manager melacak command build/test/dev server beserta output, status dan penghentiannya. Pekerjaan background berupa proses lokal; fitur ini tidak memerlukan subagents.

### Skills

| Aspek | Perilaku yang disepakati |
|---|---|
| Format | Folder `SKILL.md` dengan metadata dan instruksi; scripts/references/assets opsional |
| Scope personal | `~/.peaper/skills/` |
| Scope project | `<project>/.peaper/skills/` |
| Manual invocation | Slash command atau pemilihan skill di composer |
| Automatic invocation | Agent memilih skill aktif yang sesuai dari metadata; tersedia pengaturan per skill |
| Pemuatan | Metadata untuk discovery; body dan resources dimuat saat diperlukan |
| Transparansi | Chat menunjukkan skill yang dipakai dan pengguna dapat membuka instruksinya |
| Skills Manager | Create/edit/import folder lokal/enable/disable; tampilkan asal dan kebutuhan dependency |
| Eksekusi | Agent utama mengikuti skill; scripts menggunakan tool permissions yang sama |

Skill bawaan awal mengikuti rekomendasi Code Review, Debugging, dan Testing. Skill berisi prosedur dan tidak membentuk agent tambahan. Nama yang sama dari beberapa scope harus ditampilkan dengan asalnya; aturan resolusi nama ditentukan secara eksplisit saat implementasi.

### Memory Manager

SQLite menjadi sumber data utama memory dan FTS5 menjadi indeks pencarian teks. Vector search tetap dapat ditambahkan sebagai indeks opsional di kemudian hari.

| Jenis | Isi dan scope |
|---|---|
| Global memory | Informasi/preferensi lintas project |
| Project memory | Keputusan, konteks dan temuan khusus project |
| Session recap | Progres, pekerjaan tertunda dan langkah berikutnya pada session terkait |

Permintaan eksplisit seperti “ingat keputusan ini” menyimpan memory pada scope yang sesuai. Kesimpulan baru agent dapat ditawarkan sebagai saran yang dipilih pengguna untuk disimpan. Riwayat chat tetap dikelola sebagai session; tidak seluruh chat dipromosikan menjadi memory permanen.

Memory Manager menyediakan create/edit/delete/search/pin, sumber session, scope, dan waktu pembaruan. Catatan yang dipin dimuat sesuai scope dan batas konteks; memory lain dicari berdasarkan tugas. UI menunjukkan memory yang digunakan. Perubahan dan penghapusan harus tercermin pada indeks agar catatan yang dihapus tidak kembali melalui pencarian aktif.

### Persona dan custom instruction

Persona/profile mengatur perilaku agent utama. Custom instruction global/project/subdirectory menetapkan aturan yang dimuat berdasarkan scope. Aturan wajib tidak bergantung pada hasil pencarian semantik. UI perlu menampilkan sumber instruksi aktif agar pengguna dapat memahami perilaku agent.

### Integrasi dan workspace

MCP, lifecycle hooks, Git/worktree services, serta dashboard session/task dan usage termasuk baseline referensi yang disetujui. MCP dan hooks bekerja melalui agent utama. Worktree dapat dipakai untuk pekerjaan atau cabang session agent utama; tidak mengaktifkan delegasi subagents.

Kedalaman operasi Git/MCP/hooks ditentukan dalam pekerjaan implementasi, dengan target hasil yang dapat diuji. Token usage ditampilkan ketika disediakan provider; estimasi yang tidak lengkap harus dibedakan dari angka pasti.

## 4. Kemampuan yang belum menjadi komitmen tahap awal

| Status | Kemampuan |
|---|---|
| Dikeluarkan secara eksplisit | ACP dan subagents |
| Opsional | sqlite-vec + model embedding; OpenTUI/TUI tambahan |
| Referensi lanjutan, belum dimasukkan otomatis | Goal mode, workflow engine, deep research, scheduler/loop, marketplace/plugin distribution, headless agent automation, LSP/code graph |
| Memerlukan keputusan integrasi terpisah | Web search/fetch provider, media generation, browser automation, live application preview, cloud deployment |

CLI launcher dan diagnostics tetap dalam scope. Itu berbeda dari headless agent untuk menyelesaikan prompt melalui script/CI. Browser yang menampilkan Peaper juga berbeda dari browser automation atau preview aplikasi hasil coding.

## 5. Rancangan struktur implementasi

Rencana: satu repository pnpm workspace dengan satu package distribusi publik pada awalnya. Struktur berikut adalah pilihan implementasi yang diusulkan, bukan kebutuhan produk tambahan.

| Lokasi | Tanggung jawab |
|---|---|
| `apps/cli` | Command launcher, brand banner, opsi startup, diagnostic output |
| `apps/server` | Fastify, HTTP/SSE/WebSocket, penyajian frontend dan local session access |
| `apps/web` | React UI, chat, file/diff/editor, terminal, settings dan managers |
| `packages/core` | Agent runtime, provider adapters, tools, permission, storage, skills, memory dan integrasi |
| `packages/shared` | Zod schemas, API contracts dan event types |

Pembagian di dalam core memakai modul biasa; tidak perlu memecah setiap fitur menjadi package tersendiri. Packaging rilis merakit backend, launcher, frontend hasil build, migrations dan resources. Dependency native disertakan/dipasang sesuai strategi platform; jangan membundelnya dengan asumsi semua binary bersifat portabel.

Data pengguna disimpan di direktori pengguna, di luar folder instalasi npm. Skill project tetap di repository. Upgrade package menjalankan migration yang diperlukan tanpa mengganti data pengguna. Nama package dan scope npm belum ditetapkan atau diverifikasi ketersediaannya.

## 6. Urutan implementasi dan kriteria selesai

Milestone adalah urutan pengerjaan, bukan rilis produk yang memotong scope. Packaging dan kompatibilitas diuji sejak milestone pertama.

| Milestone | Pekerjaan | Kriteria selesai |
|---|---|---|
| M1 — Foundation | Workspace, shared schemas, CLI, Fastify, React/Vite, SQLite/FTS5, PTY smoke test, package tarball awal | Package lokal dapat dipasang; `peaper` mengenali folder aktif, menampilkan banner, membuka UI; database dan shell dapat digunakan |
| M2 — Coding end-to-end | Provider setup, model/tool loop, permission checks, file tools, command runner, SSE, terminal WebSocket, activity/diff/todo/cancel | Satu tugas kode nyata selesai melalui web: baca, edit, test, baca hasil, perbaiki; model tidak mengarang hasil command |
| M3 — Continuity | Session persistence/resume/search, context usage/compaction, instruksi, plan, conversation fork, snapshots/rewind | Reload UI menyambung pekerjaan; restart runtime menandai task terputus; resume dan restore mengikuti cakupan yang ditampilkan |
| M4 — Skills dan memory | Skill discovery/manual/auto, Skills Manager, persona/profile, Memory Manager, scoped retrieval dan recap | Skill dapat dipanggil kedua cara; memory tersimpan lintas session, scope tepat, edit/delete/pin berfungsi tanpa sqlite-vec |
| M5 — Integrations dan pekerjaan panjang | MCP, hooks, Git/worktrees, background task manager, dashboard/usage | Tools eksternal dan hooks berfungsi melalui agent utama; task panjang dapat dipantau/dihentikan; perubahan worktree dapat ditinjau |
| M6 — Release readiness | Polishing web/launcher, diagnostics, native installation checks, upgrade/migrations, npm contents dan release pipeline | Install dari tarball pada environment bersih berhasil; alur utama dan upgrade data diuji; package siap untuk publikasi |

Publikasi npm sungguhan dilakukan sesudah package siap dan identitas/nama package tersedia. Tahap perencanaan ini belum menerbitkan package.

## 7. Target pekerjaan pertama: M1 Foundation

Deliverable pertama adalah Peaper yang bisa dijalankan secara lokal dari hasil build/package, lengkap dengan kerangka UI fungsional dan pemeriksaan fondasi native.

Urutan pekerjaan:

1. Inisialisasi repository/workspace, TypeScript, lint/build scripts dan pemilihan versi dependency yang kompatibel.
2. Bentuk shared contracts untuk workspace, health, session dan event dasar.
3. Implementasikan CLI `peaper`, `--port`, `--no-open`, `--version`, serta fondasi `doctor`.
4. Jalankan Fastify pada loopback; sajikan frontend hasil build dan endpoint health/workspace.
5. Tampilkan logo PEAPER, versi, workspace, URL, status startup serta penanganan port terpakai yang jelas.
6. Buat halaman React awal untuk workspace/session dan status runtime. Detail visual dipoles sambil alur fungsional dibangun.
7. Jalankan migration SQLite, buktikan FTS5 tersedia, serta buktikan node-pty dapat membuat shell, menerima input, resize dan ditutup.
8. Buat tarball dengan `npm pack`; install dan jalankan dari folder di luar repository development.

M1 tidak memerlukan key model. Integrasi provider hidup dimulai pada M2 menggunakan konfigurasi milik pengguna; tidak ada credential yang disisipkan dalam source atau package.

## 8. Kontrak perilaku yang perlu dijaga sejak awal

- Browser adalah client; runtime memiliki lifecycle pekerjaan dan menyimpan statusnya.
- Refresh/putus koneksi browser tidak mengeksekusi ulang tool yang telah selesai.
- Event memiliki identitas dan urutan agar UI dapat replay/deduplicate ketika reconnect.
- Satu agent utama per session; tidak ada spawn/delegation ke subagent pada scope awal.
- Background command dan PTY memiliki pengelolaan stop, exit status dan cleanup.
- Permission diperiksa pada jalur eksekusi backend. Plan mode tidak boleh hanya berupa label UI.
- Sandbox OS, worktree, dan permission merupakan kemampuan berbeda. Status enforcement yang tersedia harus dinyatakan secara akurat.
- Instruksi global/project dan memory tetap memiliki cakupan yang jelas.
- Script skill dan hooks memakai lifecycle serta izin eksekusi yang konsisten.
- API key tetap di backend; frontend menerima status konfigurasi, bukan plaintext key untuk inference langsung.
- Package update tidak menimpa direktori data pengguna.
- CLI menyesuaikan lebar terminal dan kemampuan warna; mode output sederhana tersedia bila terminal tidak interaktif.
- Background teks/panel CLI menggunakan kemampuan terminal; gambar/blur/transparansi terminal mengikuti aplikasi terminal pengguna.

## 9. Validasi minimum yang bermakna

| Area | Bukti yang dibutuhkan |
|---|---|
| Distribusi | Install tarball di luar repo; executable, assets dan migrations ditemukan |
| Native Windows | better-sqlite3/FTS5 dan node-pty berhasil pada versi Node/arsitektur target |
| Provider | Streaming dan tool calling nyata untuk OpenRouter dan minimal satu endpoint compatible yang dipilih |
| Coding | Agent memperbaiki tugas contoh dengan perubahan file dan hasil test yang benar |
| Continuity | Reconnect, resume, cancellation dan status interrupted setelah runtime restart |
| Skills | Manual/auto, scope, enable/disable dan pemuatan resources |
| Memory | Persist, scope, retrieval, pin, update dan delete termasuk indeks |
| Rewind | Preview, perubahan eksternal dan batas snapshot tidak merusak edit pengguna tanpa tindakan yang jelas |
| Integrations | MCP/hook timeout, error dan hasil dipresentasikan dengan benar |

Versi dependency, nama package, repository tujuan, execution environment tambahan seperti WSL, rincian permission default dan mekanisme sandbox diputuskan ketika pekerjaan terkait dimulai. Tidak perlu membuka ulang keputusan produk yang sudah dikunci.

## 10. Arahan UI/UX dan design system

Pengguna mendelegasikan peran director UI/UX kepada assistant. Referensi tampilan tambahan dari pengguna tidak diperlukan untuk memulai. Assistant menentukan arah visual awal, menyajikan hasil yang bisa dilihat, lalu menyesuaikannya berdasarkan umpan balik selama development.

### Art direction

- Creative, modern, clean, dan professional untuk produk yang dipakai bekerja dalam waktu panjang.
- Kekhasan PEAPER dibangun melalui typography, komposisi, spacing, hierarki, detail komponen dan interaksi.
- Palet awal menggunakan warna netral dengan satu aksen brand yang terkendali; semantic colors dipakai sesuai fungsi statusnya.
- Density workspace seimbang: informasi teknis mudah dipindai, konten utama mendapat ruang yang cukup, kontrol sekunder tetap mudah ditemukan.
- Style logo CLI dan brand web saling berhubungan tanpa memaksakan ASCII sebagai bentuk seluruh web UI.
- Hindari ornament berulang, warna aksen yang berlebihan, decorative gradients/glows yang mendominasi, serta layout generik yang tidak membantu pekerjaan pengguna.
- Typography UI dan kode memiliki peran berbeda; pilihan font akhir termasuk keputusan art direction dan dibundel agar tersedia secara lokal.
- Perubahan layout, warna, komponen dan motion dapat dipoles tanpa mengubah scope kemampuan agent.

### Global design tokens

Styling menggunakan token global sebagai sumber utama. Komponen memakai nama semantic yang stabil, bukan mengulang nilai visual secara acak.

| Kelompok token | Cakupan |
|---|---|
| Colors | Canvas, surfaces, borders, text utama/sekunder, accent dan status |
| Typography | UI/code font, ukuran, weight, line-height, tracking |
| Spacing dan sizing | Jarak, padding, ukuran kontrol, lebar panel dan density |
| Shape | Radius dan ketebalan border |
| Elevation dan layering | Shadow dan z-index |
| Interaction | Focus ring, hover, selected, disabled dan active |
| Motion | Duration, easing, spring dan besaran perpindahan |

Implementasi awal menggunakan CSS custom properties global yang dipetakan ke Tailwind v4. Variasi komponen menurunkan nilai dari token; token khusus komponen ditambahkan ketika mempunyai kebutuhan yang berulang. Motion presets mengacu pada definisi global yang sama sehingga timing dan karakter gerak konsisten.

### Motion dan GSAP

Motion menjadi pilihan utama untuk interaksi React: transisi panel, enter/exit komponen, perpindahan layout, dialogs, menus, hover/tap, dan status feedback. GSAP dapat digunakan untuk sequence/timeline khusus yang memberi manfaat visual nyata; kebutuhan pemakaiannya ditentukan selama implementasi.

Satu properti pada satu elemen memiliki satu pengendali animasi yang jelas. Jika GSAP dipakai, lifecycle cleanup mengikuti mount/unmount komponen. Transisi warna atau keadaan sederhana dapat memakai CSS.

Gerak terasa halus dan responsif, tidak menunda input, aksi utama atau pembacaan hasil. Hormati reduced-motion, pertahankan fokus keyboard dan kestabilan scroll, serta batasi animasi pada transcript streaming, editor dan terminal agar output panjang tetap lancar.

## 11. Standar kode dan struktur folder

Struktur workspace pada bagian 5 tetap menjadi dasar. Di dalam aplikasi/modul, file dikelompokkan berdasarkan fitur dan tanggung jawab yang nyata.

| Lapisan | Pedoman |
|---|---|
| UI primitives | Komponen reusable dan token-driven; konsisten untuk buttons, inputs, dialogs dan menus |
| Feature UI | Session, chat, workspace, skills, memory, terminal dan settings memiliki modul masing-masing |
| Data dan state | API clients, hooks/state dan transformasi data dipisahkan dari presentational components |
| Backend routes | Validasi request, panggil service, kembalikan response/event sesuai kontrak |
| Core services | Business logic dan lifecycle agent tidak bergantung pada React atau bentuk komponen UI |
| Storage | Query/migrations berada pada modul storage; akses database tidak tersebar di routes atau frontend |
| Shared contracts | Zod schemas dan types untuk API/events dikelola bersama tanpa menggandakan kontrak |
| Integrations | Adapters provider/MCP/hooks/terminal mempunyai batas input/output dan error yang jelas |

Gunakan TypeScript strict, nama file/fungsi yang menjelaskan maksudnya, imports yang teratur, serta komponen/fungsi dengan tanggung jawab terfokus. Hindari file raksasa, circular dependencies, duplikasi aturan inti, folder utils yang menampung semua logika, dan abstraksi yang belum mempunyai kebutuhan konkret.

Lint, formatting dan type-check menjadi bagian workflow. Pengujian difokuskan pada perilaku penting: agent execution, permissions, persistence, retrieval, cancellation/reconnect, integrasi native, serta instalasi package. Perubahan styling sederhana diverifikasi melalui tampilan, interaksi dan pemeriksaan yang relevan.

## 12. Alur review visual selama development

Pada M1, bangun app shell dan alur awal yang sudah memakai token global: launcher brand, workspace/session navigation, area chat/composer, dan pola panel untuk files/diff/terminal. Detail penempatan ditentukan assistant sebagai rancangan awal dan dapat dipoles dari hasil review.

1. Implementasikan satu alur yang bisa dilihat dan digunakan.
2. Tampilkan hasilnya kepada pengguna ketika milestone visual siap ditinjau.
3. Terima perubahan yang diminta dan polish bagian terkait.
4. Terapkan perubahan berulang melalui token atau komponen bersama.
5. Lanjutkan alur fungsional berikutnya dengan bahasa visual yang konsisten.

Review mencakup keadaan empty, loading, ready, error, interrupted dan streaming sesuai fitur yang sudah tersedia. Layout diperiksa pada ukuran jendela yang relevan, termasuk area browser sempit. Pengguna tidak perlu menyusun seluruh spesifikasi visual sebelum implementasi dimulai.

## 13. Sumber konteks

- Keputusan pengguna dalam percakapan Peaper sampai 19 Oktober 2026, 00:20 WIB.
- `Peaper-Grok-Build-Feature-Study-v0.1.md`, kajian source dengan 34 tautan pada snapshot yang diperiksa.
- [Grok Build pada snapshot kajian](https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8).
- [Agent Skills specification](https://agentskills.io/specification).
- [Motion for React](https://motion.dev/docs/react) dan [reduced motion](https://motion.dev/docs/react-use-reduced-motion).
- [React integration GSAP](https://gsap.com/resources/React/).

Grok Build tetap referensi produk/arsitektur; keputusan scope Peaper pada dokumen ini mengikuti perubahan terbaru pengguna, khususnya pengeluaran ACP dan subagents serta persetujuan skill, memory dan distribusi npm.