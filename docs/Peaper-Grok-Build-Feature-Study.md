# Peaper — Kajian Fitur Grok Build v0.1

Tanggal kajian: 18 Oktober 2026 (Asia/Jakarta).

Repository: https://github.com/xai-org/grok-build

Snapshot GitHub yang diperiksa: `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`.

`SOURCE_REV` monorepo upstream pada snapshot: `559751fdcec02d413e4c57c8832ab275e4f44980`.

## 1. Tujuan dan batas pemeriksaan

Dokumen ini memetakan kemampuan Grok Build sebagai referensi pengembangan Peaper: coding agent yang runtime-nya berjalan lokal dengan antarmuka utama di browser lokal. Rekomendasi Peaper dalam dokumen ini adalah usulan scope, belum menjadi persetujuan atas seluruh fitur.

Metode: membaca README dan panduan yang disertakan di repository, menelusuri struktur source, serta memeriksa implementasi terpilih untuk memory, rewind, tools, plan mode, workflows, dan sandbox. Dokumentasi online resmi dipakai sebagai pembanding. Repository tidak dikompilasi, tidak dijalankan, dan tidak diuji end-to-end. Keberadaan source tidak membuktikan semua fitur aktif pada setiap build atau berjalan pada seluruh provider dan OS.

Dokumentasi dan source tidak selalu sejalan. Temuan konflik dicatat di bagian 7; untuk perilaku implementasi, snapshot source menjadi acuan kajian ini.

## 2. Keputusan Peaper yang sudah disetujui

| Bagian | Keputusan |
|---|---|
| Nama project | Peaper |
| Bentuk produk | Agentic coding tool lokal; web UI sebagai antarmuka utama |
| Runtime dan package manager | Node.js + pnpm |
| Backend | TypeScript + Fastify |
| Database | SQLite melalui better-sqlite3; FTS5 untuk pencarian teks |
| Vector search | sqlite-vec opsional; bukan prasyarat memory, skill, persona, atau custom instruction |
| ORM | Drizzle |
| Komunikasi | SSE untuk event agent; WebSocket untuk terminal interaktif |
| Frontend | React TypeScript + Vite + Tailwind CSS v4 |
| Library utama | AI SDK, Zod, Monaco, Shiki, xterm.js, Motion, Lucide Icons, Google Fonts |
| Shell interaktif | node-pty di backend |
| Provider | OpenRouter + custom provider OpenAI-compatible |
| TUI tambahan | OpenTUI React opsional |
| Development awal | Windows 10 + VS Code |

## 3. Pola arsitektur yang layak diadopsi

Grok Build memisahkan frontend TUI, agent runtime, tool implementations, workspace/filesystem/VCS, konfigurasi, dan integrasi. README juga menjelaskan penggunaan interaktif, headless, dan melalui Agent Client Protocol (ACP). [S01]

Peaper dapat mempertahankan pemisahan ini dengan implementasi TypeScript. Web UI menjadi client dari runtime lokal. Runtime memiliki session, lifecycle pekerjaan, provider adapters, tool execution, permissions, dan persistence. CLI launcher dan TUI opsional mengakses layanan yang sama; mereka tidak perlu memiliki agent loop sendiri.

| Lapisan Peaper yang diusulkan | Tanggung jawab |
|---|---|
| Web UI | Chat, composer, progress, diff, terminal, pengaturan, pengelolaan fitur |
| Fastify API dan event transport | Command dari UI, SSE, WebSocket terminal, reconnect |
| Agent runtime | Model/tool loop, konteks, pembatalan, subagent, pekerjaan background |
| Tool dan workspace services | File, pencarian, shell, Git, language-server integration |
| Provider adapters | OpenRouter, endpoint custom, metadata dan kapabilitas model |
| Persistence dan configuration | Session, event, memory, settings; file skill dan instruction |

ACP adalah opsi integrasi lanjutan, bukan kewajiban untuk komunikasi internal web Peaper. Pola event terstruktur Grok tetap berguna: teks, tool start/update/end, plan, permission request, dan status session dibedakan secara eksplisit. [S02]

## 4. Peta fitur Grok Build dan adaptasi Peaper

Label bukti: **source + panduan** berarti implementasi terpilih dibaca selain dokumentasi; **panduan/struktur** berarti kemampuan didokumentasikan dan modul relevan ditemukan, tetapi tidak semua jalur implementasinya diaudit. Semua baris tetap merupakan hasil pemeriksaan statis.

| Kelompok | Kemampuan referensi Grok Build | Adaptasi untuk Peaper | Bukti |
|---|---|---|---|
| Coding loop | Membaca project, memakai tools, mengedit file, menjalankan command | Agent runtime mandiri dengan event pekerjaan yang terlihat di UI | [S01], [S03]; source + panduan |
| File tools | Baca file, daftar direktori, grep, penggantian teks; juga tersedia implementasi toolset lain | Tools terstruktur untuk baca/cari/edit/create; patch dan diff yang dapat ditinjau | [S03]; source + panduan |
| Terminal | Menjalankan command dan mengambil output; task dapat dihentikan | Pisahkan command runner agent dari terminal interaktif pengguna; gunakan node-pty saat membutuhkan PTY | [S03], [S04]; source + panduan |
| Progress dan klarifikasi | Todo, tool aktivitas, ask-user-question | Todo/progress panel dan kartu pertanyaan di chat | [S03], [S05]; source + panduan |
| Plan mode | Eksplorasi, menulis plan, review dan revisi sebelum implementasi | Plan panel dengan approve/request changes; aturan eksekusi ditegakkan backend | [S06]; panduan + implementasi terkait ditelusuri |
| Sessions | Autosave, resume, rename, pencarian, export, fork | Riwayat per project, pencarian FTS5, export dan branch percakapan | [S05]; panduan/struktur |
| Context management | Compact manual/otomatis dan informasi context usage | Context meter, ringkasan terkontrol, pemuatan kembali instruksi penting | [S05], [S07]; panduan/struktur |
| Rewind | Jalur source mendukung conversation, files, atau keduanya | Pisahkan aksi rewind chat dan restore file; preview serta deteksi konflik | [S08], [S09]; source + panduan |
| Project instructions | Keluarga AGENTS.md, aturan per direktori, rules tambahan per session | Loader instruction global/project/subdirectory; tampilkan asal dan cakupan aturan | [S10]; panduan/struktur |
| Skills | SKILL.md, metadata, scope global/project, slash invocation, automatic discovery | Skill browser, manual invoke, discovery melalui metadata, pemuatan isi saat dipakai | [S11]; panduan/struktur |
| Agents dan persona | Agent definition mengatur session/tools/model; persona sebagai lapisan perilaku child | Agent profile dan persona dibedakan; scope main/subagent perlu ditetapkan Peaper | [S12]; panduan/struktur |
| Memory | Scope global/workspace, note dan session summary, flush, consolidation, search/get | Memory browser, remember/forget/edit, sumber dan scope jelas; FTS5 menjadi jalur dasar | [S13], [S14]; source + panduan |
| Subagents | Child context terpisah, task background, hasil ke parent, konfigurasi kemampuan | Task delegasi dengan batas concurrency/budget dan panel transcript child | [S12], [S03]; panduan + tool source |
| Worktrees dan Git | Isolasi workspace untuk fork/subagent; operasi status/diff/stage/commit melalui integrasi | Git services dan worktree per task; review perubahan sebelum apply ke workspace utama | [S02], [S05]; panduan/struktur |
| Background tasks | Command panjang tetap berjalan, ambil output, stop, notifikasi selesai | Task manager untuk build/test/dev server, terpisah dari koneksi browser | [S04]; source + panduan |
| Monitor dan scheduler | Event dari monitor dan prompt berulang melalui loop/scheduler | Monitor panel dan scheduler lokal; status host/runtime memengaruhi eksekusi | [S04], [S03]; source + panduan |
| Goal mode | Objective berkelanjutan, progress, evaluator/verifier, budget | Autonomy dengan completion criteria dan bukti hasil; sediakan pause/stop dan budget | [S07], [S15]; source + panduan |
| Workflows | Definisi workflow tersimpan dan run management; deep-research builtin | Workflow orchestration lanjutan; pilih format yang sesuai TypeScript, tidak harus Rhai | [S07], [S16], [S17]; source + panduan |
| MCP | Integrasi stdio/HTTP/SSE, tool discovery/use, konfigurasi dan OAuth | MCP manager lokal; tampilkan konektivitas, tools, izin dan status auth | [S18]; panduan/struktur |
| Hooks | Lifecycle scripts dan HTTP callbacks; pre/post tool, session, compaction, subagents | Hook registry, enable/disable, trust, timeout dan log hasil | [S19]; panduan/struktur |
| Plugins/marketplaces | Bundle skills, agents, hooks, server integrations; sumber marketplace | Local plugin loader lebih dahulu; katalog/distribusi dapat ditambahkan sebagai lapisan lanjutan | [S20]; panduan/struktur |
| Model/provider configuration | Custom endpoint, model picker, sampling/context settings, beberapa API backend | Pertahankan scope awal OpenRouter + OpenAI-compatible; validasi kapabilitas tiap model | [S21]; panduan/struktur |
| Permissions | Ask, auto-review, always-approve serta allow/ask/deny rules | Backend policy engine; keputusan UI tidak menggantikan pemeriksaan eksekusi | [S22]; panduan/struktur |
| OS sandbox | Enforcement spesifik platform dan profil filesystem/network | Execution adapter per OS; nyatakan status isolasi nyata, terutama Windows | [S23], [S24]; source + panduan |
| Dashboard dan usage | Roster session, status task, context/token/usage, tampilan/theme | Project/session dashboard, token usage, biaya jika data tersedia, settings UI | [S25], [S26], [S07]; panduan/struktur |
| Headless dan ACP | Scripting, output terstruktur, integration editor/client | CLI headless dan ACP sebagai pintu masuk tambahan ke runtime yang sama | [S02], [S27]; panduan/struktur |
| Web search dan fetch | Search client memakai Responses API; URL fetch memiliki modul sendiri | Pisahkan adapter pencarian dari inference provider; fetch dan search adalah tools berbeda | [S28], [S29]; source |
| Media | Image generation/edit dan video tools dengan konfigurasi layanan tersendiri | Opsional sesuai provider media; jangan diasumsikan tersedia dari chat endpoint custom | [S30], [S03]; source + panduan |

## 5. Skill, memory, persona, instruction: pembagian yang disarankan

Keempat fitur memiliki fungsi berbeda. Skill mengajarkan prosedur; instruction menetapkan aturan yang berlaku; persona mengatur perilaku/format; memory menyimpan fakta dan keputusan yang perlu diambil kembali. Mereka tidak perlu digabung menjadi satu vector store.

| Komponen | Sumber utama Peaper yang disarankan | Cara dimuat |
|---|---|---|
| Skill | Folder SKILL.md dengan resources/scripts | Temukan melalui katalog metadata; muat body ketika dipakai |
| Custom instruction | Markdown global/project/subdirectory | Muat berdasarkan scope dan aturan prioritas yang eksplisit |
| Agent profile/persona | Konfigurasi/file instruksi | Muat profile aktif dan lapisan perilaku yang dipilih |
| Memory global/project | Note terstruktur atau Markdown, dengan metadata SQLite | Ambil yang wajib secara langsung; cari relevansi melalui FTS5 |
| Semantic retrieval | Indeks sqlite-vec yang dapat dibangun ulang | Hanya aktif bila model embedding dan indeks tersedia |

Temuan source yang relevan: `search.rs` Grok mendefinisikan FTS-only dan hybrid, memeriksa ketersediaan vector index/provider, serta kembali ke pencarian teks ketika jalur vector tidak tersedia. Panduan memory juga menjelaskan bahwa embedding model tidak diisi secara default; memory sendiri experimental dan disabled secara default. [S13], [S14]

Dengan demikian, sqlite-vec opsional konsisten dengan referensi yang dipilih. Fitur memory Peaper tetap perlu memiliki create/read/update/delete, scope, sumber, timestamp, dan kontrol pengguna. Capture otomatis serta consolidation berbantuan model adalah kemampuan tambahan yang perlu pengaturan tersendiri; keduanya dapat menggunakan inference dan menimbulkan biaya.

Grok juga memiliki jalur memory v2 untuk observations dan curated topics. Jangan menganggap seluruh paragraf panduan legacy dan v2 merupakan satu implementasi storage yang identik. [S13]

## 6. Usulan baseline awal Peaper

Ini urutan pembangunan menuju kemampuan yang terinspirasi Grok Build, bukan pemotongan scope yang sudah disetujui pengguna. Daftar final fitur rilis masih perlu dirumuskan.

### A. Fondasi coding agent

Project/workspace selection; provider configuration; streaming chat; tool loop; file read/search/edit; command execution dan terminal interaktif; aktivitas tools; diff review; todo; pertanyaan pengguna; cancellation; session autosave/resume; context usage dan compaction; project instructions; permission handling.

Kriteria hasil: satu tugas nyata dapat diselesaikan dari instruksi sampai perubahan kode, build/test, penilaian hasil, dan tindak lanjut. Reload browser dapat menyambung kembali tanpa mengeksekusi ulang tool yang sudah selesai.

### B. Kemampuan personalisasi dan pekerjaan panjang

Skills; agent profile/persona; memory global/project dengan FTS5; background tasks; subagents; worktrees; rewind dengan batas cakupan jelas; MCP; hooks; project/session dashboard; usage tracking.

Bagian A dan B bersama-sama lebih mendekati pengalaman coding agent yang dimaksud pengguna daripada chat yang hanya dilengkapi editor. Implementasi internal dapat bertahap agar setiap lapisan dapat diverifikasi.

### C. Kemampuan lanjutan dan integrasi

Goal mode dengan verifier; workflow engine; monitor/scheduler; plugin marketplace; headless automation; ACP; LSP/code navigation. Semantic memory, media generation dan TUI tambahan tetap opsional. Keputusan memasukkan seluruh bagian C ke rilis pertama belum diambil.

Web search/fetch perlu diputuskan adapter-nya. OS sandbox perlu diputuskan pendekatannya pada Windows; fitur ini tidak otomatis tersedia hanya karena ada policy tools atau node-pty.

## 7. Batasan dan perbedaan yang ditemukan

### 7.1 Rewind: panduan yang disertakan tertinggal dari source

Panduan session di repository mengatakan rewind hanya memangkas percakapan dan tidak mengembalikan file. Namun, implementasi `handle_rewind` mempunyai `All`, `FilesOnly`, dan `ConversationOnly`, mengumpulkan snapshot file, membandingkan perubahan eksternal, menyiapkan preview, dan menjalankan revert pada fase konfirmasi. Extension handler menggunakan `All` jika mode tidak diberikan. [S05], [S08], [S09], [S31]

Untuk Peaper, kontrak UI/API perlu menyatakan persis apa yang dikembalikan. Restore file yang dilacak tidak berarti rollback seluruh efek shell, database, dependency install, atau aksi remote. Cakupan snapshot Peaper perlu ditentukan dan diuji, termasuk perubahan manual dari VS Code.

### 7.2 Plan mode bukan otomatis isolasi read-only

Panduan plan mode menjelaskan pembatasan edit tool ke plan file, tetapi juga menyebut bash tidak diperiksa untuk semua penulisan file dan child agent mempunyai tracker plan tersendiri. Jadi, label plan mode tidak cukup untuk menjamin seluruh jalur eksekusi tidak menulis. [S06]

Peaper sebaiknya menurunkan batas kemampuan dari mode session ke tools, shell, dan subagents secara konsisten. Bedakan aturan kerja agent dari enforcement OS.

### 7.3 OS sandbox tidak setara pada Windows

Dokumentasi menjelaskan enforcement Linux/macOS dengan mekanisme masing-masing. Source `SandboxManager::apply` menggunakan jalur enforcement `unix`; jalur selain itu adalah stub yang tidak menerapkan sandbox. Persyaratan native Windows Peaper perlu desain dan pengujian sendiri. [S23], [S24]

Klaim dukungan binary Windows Grok tidak sama dengan klaim sandbox kernel Windows yang setara. README juga membedakan binary Windows yang dipublikasikan dari build source Windows yang best-effort dan belum diuji dari tree ini. [S01]

### 7.4 Search/media memerlukan kemampuan layanan tambahan

Web search dibangun melalui client Responses API dengan kemampuan search. Image/media memakai konfigurasi dan client tersendiri. Mengganti model chat ke OpenAI-compatible endpoint tidak otomatis menyediakan search, image edit, atau video generation. [S21], [S28], [S30]

Peaper memerlukan capability registry: tool calling, streaming, image input, reasoning metadata, usage, context limit, dan dukungan layanan tambahan. Jangan menampilkan tool provider yang belum dapat dijalankan.

### 7.5 App builder/deployment belum dapat dianggap fitur siap pakai

Modul Grok tools pada snapshot mengarah ke `app_builder_stub.rs`, `deploy_app_stub.rs`, dan `init_or_update_app_stub.rs`. App builder config yang dibaca hanya mempunyai varian `Disabled`. Nama simbol deployment tidak cukup untuk menyatakan implementasi deployment publik tersedia. [S03], [S32], [S33], [S34]

Preview aplikasi web di Peaper adalah keputusan produk dan implementasi Peaper tersendiri. Browser yang menampilkan UI Peaper, live preview aplikasi hasil coding, dan browser automation adalah tiga kemampuan berbeda. Sisa test/source references browser ditemukan, tetapi jalur browser automation aktif belum diverifikasi; kajian ini tidak mengklaim dukungan penuh browser automation pada snapshot.

### 7.6 Resume session berbeda dari memulihkan proses

Resume percakapan tidak berarti proses shell yang mati akan hidup kembali. Panduan workflow juga membatasi resume lintas restart dan tidak menjanjikan exactly-once untuk external effects. [S05], [S07]

Untuk Peaper, UI perlu membedakan task running, completed, failed, cancelled, dan interrupted setelah restart. Jangan otomatis mengulang command yang mempunyai efek samping hanya karena event terakhir belum lengkap.

## 8. Implikasi terhadap stack Peaper

Stack yang dipilih tetap dapat dipakai; kajian Grok tidak menjadi alasan mengganti TypeScript/Fastify ke Rust.

| Kebutuhan | Implikasi implementasi |
|---|---|
| Runtime mandiri dari UI | Status job/session dimiliki backend; browser subscribe melalui event |
| Reconnect | Event IDs/order, persistence, cursor/replay, deduplication |
| Command dan terminal | Structured command result untuk agent; PTY untuk interaksi terminal; lifecycle/cleanup terpusat |
| SQLite | Simpan session metadata/events, task state, usage, memory metadata; kerja indeks berat jangan memblokir streaming |
| Search kode | Exact text/regex dan file search tetap diperlukan; FTS5 memory tidak menggantikan pencarian source |
| Skill/instruction/plugin | Discovery dan scope eksplisit; konfigurasi project yang bisa menjalankan kode memerlukan trust yang jelas |
| LSP | Monaco adalah editor; dukungan navigasi agent lintas bahasa membutuhkan backend language-server tersendiri |
| Subagents | Batas concurrency, konteks, permissions, model/provider, usage attribution dan konflik file |
| Worktrees | Git isolation terpisah dari OS sandbox; shell tetap mempunyai hak proses host |
| Provider custom | Uji tool calls, streaming args, usage, reasoning, rate-limit/error handling per endpoint/model |
| Optional vector search | Gagal/unavailable harus tetap menyediakan FTS-only tanpa merusak memory |
| Font dan aset UI | Bundel aset yang dibutuhkan agar UI lokal tidak bergantung pada unduhan setiap startup |

## 9. Hal yang belum dikunci

1. Daftar final fitur Peaper v1 dari kelompok A/B/C.
2. Native Windows sebagai satu-satunya execution environment awal atau juga adapter WSL.
3. Default permission mode dan strategi sandbox Windows.
4. Scope persona untuk main agent, subagent, atau keduanya.
5. Perilaku automatic memory capture/consolidation dan persetujuan penyimpanannya.
6. Adapter web search, bentuk plugin, format workflow, dan waktu memasukkan ACP.
7. Kontrak rewind/snapshot dan pemulihan pekerjaan setelah runtime restart.
8. Desain web UI: penempatan chat, editor/diff, terminal, tasks, settings; studi ini belum merupakan desain UI final.

## 10. Referensi source

Semua tautan source di bawah dikunci ke commit kajian agar tetap dapat ditinjau meskipun branch utama berubah. Panduan di repository dapat berbeda dari dokumentasi online atau binary rilis; jangan menganggap ketiganya identik.

- [S01] [README.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/README.md)
- [S02] [crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md)
- [S03] [crates/codegen/xai-grok-tools/src/implementations/grok_build/mod.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/mod.rs)
- [S04] [crates/codegen/xai-grok-pager/docs/user-guide/20-background-tasks.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/20-background-tasks.md)
- [S05] [crates/codegen/xai-grok-pager/docs/user-guide/17-sessions.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/17-sessions.md)
- [S06] [crates/codegen/xai-grok-pager/docs/user-guide/19-plan-mode.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/19-plan-mode.md)
- [S07] [crates/codegen/xai-grok-pager/docs/user-guide/04-slash-commands.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/04-slash-commands.md)
- [S08] [crates/codegen/xai-grok-shell/src/session/acp_session_impl/rewind.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_session_impl/rewind.rs)
- [S09] [crates/codegen/xai-grok-shell/src/extensions/rewind.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/extensions/rewind.rs)
- [S10] [crates/codegen/xai-grok-pager/docs/user-guide/12-project-rules.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/12-project-rules.md)
- [S11] [crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md)
- [S12] [crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md)
- [S13] [crates/codegen/xai-grok-pager/docs/user-guide/13-memory.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/13-memory.md)
- [S14] [crates/codegen/xai-grok-memory/src/search.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-memory/src/search.rs)
- [S15] [crates/codegen/xai-grok-shell/src/session/acp_session_impl/goal.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_session_impl/goal.rs)
- [S16] [crates/codegen/xai-grok-shell/src/session/workflow/registry.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/workflow/registry.rs)
- [S17] [crates/codegen/xai-workflow/src/engine.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-workflow/src/engine.rs)
- [S18] [crates/codegen/xai-grok-pager/docs/user-guide/07-mcp-servers.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/07-mcp-servers.md)
- [S19] [crates/codegen/xai-grok-pager/docs/user-guide/10-hooks.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/10-hooks.md)
- [S20] [crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md)
- [S21] [crates/codegen/xai-grok-pager/docs/user-guide/11-custom-models.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/11-custom-models.md)
- [S22] [crates/codegen/xai-grok-pager/docs/user-guide/22-permissions-and-safety.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/22-permissions-and-safety.md)
- [S23] [crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md)
- [S24] [crates/codegen/xai-grok-sandbox/src/lib.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-sandbox/src/lib.rs)
- [S25] [crates/codegen/xai-grok-pager/docs/user-guide/23-dashboard.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/23-dashboard.md)
- [S26] [crates/codegen/xai-grok-pager/docs/user-guide/25-status-line.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/25-status-line.md)
- [S27] [crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md)
- [S28] [crates/codegen/xai-grok-tools/src/implementations/grok_build/web_search/mod.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/web_search/mod.rs)
- [S29] [crates/codegen/xai-grok-tools/src/implementations/grok_build/web_fetch/mod.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/web_fetch/mod.rs)
- [S30] [crates/codegen/xai-grok-tools/src/implementations/grok_build/image_gen/mod.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/image_gen/mod.rs)
- [S31] [crates/codegen/xai-grok-shell/src/session/acp_types.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_types.rs)
- [S32] [crates/codegen/xai-grok-tools/src/implementations/grok_build/app_builder_stub.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/app_builder_stub.rs)
- [S33] [crates/codegen/xai-grok-tools/src/implementations/grok_build/deploy_app_stub.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/deploy_app_stub.rs)
- [S34] [crates/codegen/xai-grok-tools/src/implementations/grok_build/init_or_update_app_stub.rs](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/init_or_update_app_stub.rs)

Dokumentasi online pembanding:

- https://docs.x.ai/build/overview
- https://docs.x.ai/build/features/skills-plugins-marketplaces
- https://docs.x.ai/build/features/project-rules
- https://docs.x.ai/build/features/sessions
- https://docs.x.ai/build/features/permissions
- https://docs.x.ai/build/features/sandbox
- https://docs.x.ai/build/features/plan-mode
- https://docs.x.ai/build/features/subagents
- https://docs.x.ai/build/features/mcp-servers

