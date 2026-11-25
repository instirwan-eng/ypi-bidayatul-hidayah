/**
 * School Inventory Dashboard Module (Barang Habis Pakai, Buku, Perlengkapan Sekolah)
 * for YPI BIDAYATUL HIDAYAH.
 */
window.InventoryModule = (() => {
  const { escapeHtml } = window.MathHelper;

  let state = {
    tab: "overview", // overview | consumables | books | equipment
    subTab: {
      consumables: "data", // data | recap
      books: "data",
      equipment: "data",
    },
    summary: null,
    consumables: [],
    consumableLogs: [],
    books: [],
    bookLogs: [],
    equipment: [],
    equipmentLogs: [],
    filters: {
      consumablesSearch: "",
      consumablesStatus: "",
      consumablesDate: new Date().toISOString().slice(0, 10),
      booksSearch: "",
      booksKategori: "",
      booksKelas: "",
      booksDate: new Date().toISOString().slice(0, 10),
      equipmentSearch: "",
      equipmentKelayakan: "",
      equipmentStatus: "",
      equipmentDate: new Date().toISOString().slice(0, 10),
    },
  };

  let invChart = null;

  function setTab(tabName) {
    state.tab = tabName;
    render();
  }

  function setSubTab(section, sub) {
    state.subTab[section] = sub;
    render();
  }

  async function loadAll() {
    const [summary, consumables, cLogs, books, bLogs, equipment, eLogs] = await Promise.all([
      window.App.api("/api/inventory/summary"),
      window.App.api("/api/inventory/consumables"),
      window.App.api("/api/inventory/consumables/logs"),
      window.App.api("/api/inventory/books"),
      window.App.api("/api/inventory/books/logs"),
      window.App.api("/api/inventory/equipment"),
      window.App.api("/api/inventory/equipment/logs"),
    ]);
    state.summary = summary;
    state.consumables = consumables;
    state.consumableLogs = cLogs;
    state.books = books;
    state.bookLogs = bLogs;
    state.equipment = equipment;
    state.equipmentLogs = eLogs;
  }

  function statusBadgeConsumable(status) {
    if (status === "Aman") return `<span class="badge badge-success">Aman</span>`;
    if (status === "Menipis") return `<span class="badge badge-warning">Menipis</span>`;
    return `<span class="badge badge-danger">Habis</span>`;
  }

  function badgeKelayakan(k) {
    if (k === "Layak") return `<span class="badge badge-success">Layak</span>`;
    if (k === "Perlu Perbaikan") return `<span class="badge badge-warning">Perlu Perbaikan</span>`;
    return `<span class="badge badge-danger">${escapeHtml(k)}</span>`;
  }

  function badgeEquipmentStatus(s) {
    if (s === "Ada") return `<span class="badge badge-success">Ada</span>`;
    if (s === "Sedang Diperbaiki") return `<span class="badge badge-warning">Sedang Diperbaiki</span>`;
    return `<span class="badge badge-danger">Hilang</span>`;
  }

  // -------------------------------------------------------------------------
  // Render Entry
  // -------------------------------------------------------------------------

  async function initAndRender(subSection) {
    if (subSection) state.tab = subSection;
    const container = document.getElementById("main-content");
    container.innerHTML = `<div class="loading-box">Memuat data inventaris sekolah...</div>`;
    try {
      await loadAll();
      render();
    } catch (err) {
      container.innerHTML = `<div class="error-box">Gagal memuat inventaris: ${escapeHtml(err.message)}</div>`;
    }
  }

  function render() {
    const container = document.getElementById("main-content");
    if (!container) return;

    const tabs = [
      { id: "overview", label: "Ringkasan Inventaris", icon: "layout-dashboard" },
      { id: "consumables", label: "Barang Habis Pakai", icon: "package-open" },
      { id: "books", label: "Inventaris Buku", icon: "book-open" },
      { id: "equipment", label: "Perlengkapan Sekolah", icon: "armchair" },
    ];

    let bodyHtml = "";
    if (state.tab === "overview") bodyHtml = renderOverview();
    else if (state.tab === "consumables") bodyHtml = renderConsumables();
    else if (state.tab === "books") bodyHtml = renderBooks();
    else if (state.tab === "equipment") bodyHtml = renderEquipment();

    container.innerHTML = `
      <div class="dashboard-header">
        <div>
          <span class="eyebrow">SISTEM SARANA & PRASARANA</span>
          <h1>Dashboard Inventaris Sekolah</h1>
          <p class="subtitle">Pengelolaan barang habis pakai, buku pelajaran kelas 1–12, dan perlengkapan YPI BIDAYATUL HIDAYAH.</p>
        </div>
        <div class="header-actions no-print">
          <button class="btn btn-outline" onclick="window.App.navigate('exam-portal')">
            <i data-lucide="graduation-cap"></i> Buka Portal Soal & UTBK
          </button>
        </div>
      </div>

      <div class="pill-tabs no-print">
        ${tabs
          .map(
            (t) => `
          <button class="pill-tab ${state.tab === t.id ? "active" : ""}" onclick="window.InventoryModule.setTab('${t.id}')">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
          </button>`
          )
          .join("")}
      </div>

      <div class="dashboard-body">
        ${bodyHtml}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    if (state.tab === "overview") {
      renderOverviewChart();
    }
  }

  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------

  function renderOverview() {
    const s = state.summary;
    if (!s) return "";
    return `
      <div class="kpi-grid">
        <div class="kpi-card kpi-emerald" onclick="window.InventoryModule.setTab('consumables')" style="cursor:pointer">
          <div class="kpi-icon"><i data-lucide="package-open"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Barang Habis Pakai</span>
            <strong class="kpi-value">${s.consumables.total_items} Jenis</strong>
            <span class="kpi-sub">Total Sisa: ${s.consumables.total_sisa} | Menipis: ${s.consumables.menipis} | Habis: ${s.consumables.habis}</span>
          </div>
        </div>
        <div class="kpi-card kpi-amber" onclick="window.InventoryModule.setTab('books')" style="cursor:pointer">
          <div class="kpi-icon"><i data-lucide="book-open"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Inventaris Buku (Kelas 1–12)</span>
            <strong class="kpi-value">${s.books.total_titles} Judul</strong>
            <span class="kpi-sub">Sisa: ${s.books.total_sisa} eks | Dipinjam: ${s.books.sedang_dipinjam} eks</span>
          </div>
        </div>
        <div class="kpi-card kpi-blue" onclick="window.InventoryModule.setTab('equipment')" style="cursor:pointer">
          <div class="kpi-icon"><i data-lucide="armchair"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Perlengkapan Sekolah</span>
            <strong class="kpi-value">${s.equipment.total_items} Jenis</strong>
            <span class="kpi-sub">Sisa Stok: ${s.equipment.total_sisa} unit | Layak: ${s.equipment.layak}</span>
          </div>
        </div>
        <div class="kpi-card kpi-teal">
          <div class="kpi-icon"><i data-lucide="clipboard-list"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Aktivitas Harian Hari Ini</span>
            <strong class="kpi-value">${s.consumables.today_logs + s.books.today_logs + s.equipment.today_logs} Catatan</strong>
            <span class="kpi-sub">Pakai: ${s.consumables.today_logs} | Pinjam Buku: ${s.books.today_logs} | Distribusi: ${s.equipment.today_logs}</span>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h3><i data-lucide="bar-chart-3"></i> Distribusi Kondisi & Status Inventaris</h3>
          </div>
          <div class="chart-wrapper">
            <canvas id="invOverviewChart"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3><i data-lucide="zap"></i> Akses Cepat & Peringatan Stok</h3>
          </div>
          <div class="alert-list">
            ${state.consumables
              .filter((c) => c.status !== "Aman")
              .slice(0, 5)
              .map(
                (c) => `
              <div class="alert-item ${c.status === "Habis" ? "alert-danger" : "alert-warning"}">
                <div>
                  <strong>${escapeHtml(c.nama_barang)}</strong>
                  <small>${escapeHtml(c.lokasi_barang || "Tanpa lokasi")} • Sisa ${c.sisa_barang} ${escapeHtml(c.satuan)}</small>
                </div>
                ${statusBadgeConsumable(c.status)}
              </div>`
              )
              .join("") || `<div class="empty-note">Semua stok barang habis pakai dalam kondisi aman.</div>`}
          </div>
          <div class="quick-actions-row">
            <button class="btn btn-primary btn-sm" onclick="window.InventoryModule.setTab('consumables')">Kelola Barang Habis Pakai</button>
            <button class="btn btn-outline btn-sm" onclick="window.InventoryModule.setTab('books')">Kelola Buku</button>
            <button class="btn btn-outline btn-sm" onclick="window.InventoryModule.setTab('equipment')">Kelola Perlengkapan</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderOverviewChart() {
    const ctx = document.getElementById("invOverviewChart");
    if (!ctx || typeof window.Chart === "undefined" || !state.summary) return;
    if (invChart) invChart.destroy();
    const s = state.summary;
    invChart = new window.Chart(ctx, {
      type: "bar",
      data: {
        labels: [
          "Habis Pakai (Aman)",
          "Habis Pakai (Menipis/Habis)",
          "Buku (Layak)",
          "Buku (Tidak Layak)",
          "Perlengkapan (Layak)",
          "Perlengkapan (Rusak/Perbaikan)",
        ],
        datasets: [
          {
            label: "Jumlah Item",
            data: [
              s.consumables.aman,
              s.consumables.menipis + s.consumables.habis,
              s.books.layak,
              s.books.tidak_layak,
              s.equipment.layak,
              s.equipment.rusak + s.equipment.perlu_perbaikan,
            ],
            backgroundColor: ["#059669", "#f59e0b", "#0284c7", "#ef4444", "#10b981", "#f97316"],
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // -------------------------------------------------------------------------
  // 1a. Barang Habis Pakai
  // -------------------------------------------------------------------------

  function renderConsumables() {
    const sub = state.subTab.consumables;
    const filtered = state.consumables.filter((c) => {
      const q = state.filters.consumablesSearch.toLowerCase();
      const matchQ =
        !q ||
        c.nama_barang.toLowerCase().includes(q) ||
        c.kategori.toLowerCase().includes(q) ||
        c.lokasi_barang.toLowerCase().includes(q);
      const matchS = !state.filters.consumablesStatus || c.status === state.filters.consumablesStatus;
      return matchQ && matchS;
    });

    const dateFilter = state.filters.consumablesDate;
    const logs = state.consumableLogs.filter((l) => !dateFilter || l.tanggal === dateFilter);

    return `
      <div class="sub-tabs no-print">
        <button class="sub-tab ${sub === "data" ? "active" : ""}" onclick="window.InventoryModule.setSubTab('consumables','data')">
          <i data-lucide="boxes"></i> Data Barang Habis Pakai (${state.consumables.length})
        </button>
        <button class="sub-tab ${sub === "recap" ? "active" : ""}" onclick="window.InventoryModule.setSubTab('consumables','recap')">
          <i data-lucide="calendar-check"></i> Rekapan Harian Pemakaian (${logs.length})
        </button>
      </div>

      ${
        sub === "data"
          ? `
        <div class="card">
          <div class="toolbar no-print">
            <div class="toolbar-left">
              <div class="search-box">
                <i data-lucide="search"></i>
                <input type="text" placeholder="Cari nama, kategori, lokasi..." value="${escapeHtml(state.filters.consumablesSearch)}"
                  oninput="window.InventoryModule.updateFilter('consumablesSearch', this.value)" />
              </div>
              <select class="select-sm" onchange="window.InventoryModule.updateFilter('consumablesStatus', this.value)">
                <option value="">Semua Status</option>
                <option value="Aman" ${state.filters.consumablesStatus === "Aman" ? "selected" : ""}>Aman</option>
                <option value="Menipis" ${state.filters.consumablesStatus === "Menipis" ? "selected" : ""}>Menipis</option>
                <option value="Habis" ${state.filters.consumablesStatus === "Habis" ? "selected" : ""}>Habis</option>
              </select>
            </div>
            <div class="toolbar-right">
              <button class="btn btn-primary btn-sm" onclick="window.InventoryModule.openConsumableModal()">
                <i data-lucide="plus"></i> Tambah Barang
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.ExcelHelper.downloadTemplate('consumables')">
                <i data-lucide="file-spreadsheet"></i> Unduh Template Excel
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.InventoryModule.triggerImport('consumables')">
                <i data-lucide="upload"></i> Import Excel
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.InventoryModule.exportConsumables()">
                <i data-lucide="download"></i> Export Excel
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.InventoryModule.confirmDeleteAll('consumables')">
                <i data-lucide="trash-2"></i> Hapus Semua
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Barang</th>
                  <th>Satuan</th>
                  <th>Kategori</th>
                  <th class="num">Jml Awal</th>
                  <th class="num">Masuk</th>
                  <th class="num">Dipakai</th>
                  <th class="num">Sisa</th>
                  <th>Status</th>
                  <th>Lokasi Barang</th>
                  <th class="no-print">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filtered.length
                    ? filtered
                        .map(
                          (item, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${escapeHtml(item.nama_barang)}</strong></td>
                    <td>${escapeHtml(item.satuan)}</td>
                    <td><span class="tag">${escapeHtml(item.kategori)}</span></td>
                    <td class="num">${item.jumlah_awal}</td>
                    <td class="num">${item.barang_masuk}</td>
                    <td class="num">${item.barang_dipakai}</td>
                    <td class="num"><strong>${item.sisa_barang}</strong></td>
                    <td>${statusBadgeConsumable(item.status)}</td>
                    <td>${escapeHtml(item.lokasi_barang || "-")}</td>
                    <td class="actions-cell no-print">
                      <button class="icon-btn text-emerald" title="Catat Pemakaian Harian" onclick="window.InventoryModule.openConsumableLogModal(${item.id})"><i data-lucide="minus-circle"></i></button>
                      <button class="icon-btn text-blue" title="Edit" onclick="window.InventoryModule.openConsumableModal(${item.id})"><i data-lucide="pencil"></i></button>
                      <button class="icon-btn text-red" title="Hapus" onclick="window.InventoryModule.deleteItem('consumables', ${item.id}, '${escapeHtml(item.nama_barang)}')"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="11" class="empty-cell">Belum ada data barang habis pakai.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      `
          : `
        <div class="card print-area">
          ${renderPrintHeader("REKAPAN HARIAN PEMAKAIAN BARANG HABIS PAKAI", dateFilter || "Semua Tanggal")}
          <div class="toolbar no-print">
            <div class="toolbar-left">
              <label class="inline-label">Tanggal Rekapan:
                <input type="date" class="input-sm" value="${escapeHtml(dateFilter)}"
                  onchange="window.InventoryModule.updateFilter('consumablesDate', this.value)" />
              </label>
              <button class="btn btn-ghost btn-sm" onclick="window.InventoryModule.updateFilter('consumablesDate', '')">Semua Tanggal</button>
            </div>
            <div class="toolbar-right">
              <button class="btn btn-primary btn-sm" onclick="window.InventoryModule.openConsumableLogModal()">
                <i data-lucide="plus"></i> Catat Pemakaian Harian
              </button>
              <button class="btn btn-amber btn-sm" onclick="window.InventoryModule.printRecap()">
                <i data-lucide="printer"></i> Cetak Rekapan Harian
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Nama Barang</th>
                  <th>Kategori</th>
                  <th class="num">Jumlah Terpakai</th>
                  <th>Satuan</th>
                  <th>Pengguna / Unit</th>
                  <th>Keterangan</th>
                  <th class="no-print">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${
                  logs.length
                    ? logs
                        .map(
                          (l, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${escapeHtml(l.tanggal)}</td>
                    <td><strong>${escapeHtml(l.nama_barang)}</strong></td>
                    <td>${escapeHtml(l.kategori)}</td>
                    <td class="num"><strong>${l.jumlah_dipakai}</strong></td>
                    <td>${escapeHtml(l.satuan)}</td>
                    <td>${escapeHtml(l.pengguna || "-")}</td>
                    <td>${escapeHtml(l.keterangan || "-")}</td>
                    <td class="actions-cell no-print">
                      <button class="icon-btn text-red" title="Hapus Catatan" onclick="window.InventoryModule.deleteLog('consumables', ${l.id})"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="9" class="empty-cell">Tidak ada catatan pemakaian barang pada tanggal ini.</td></tr>`
                }
              </tbody>
            </table>
          </div>
          ${renderPrintFooter()}
        </div>
      `
      }
    `;
  }

  // -------------------------------------------------------------------------
  // 1b. Buku (2 Kategori Pelajaran + Jenjang Kelas 1 - 12)
  // -------------------------------------------------------------------------

  function renderBooks() {
    const sub = state.subTab.books;
    const filtered = state.books.filter((b) => {
      const q = state.filters.booksSearch.toLowerCase();
      const matchQ =
        !q ||
        b.nama_barang.toLowerCase().includes(q) ||
        b.lokasi_buku.toLowerCase().includes(q) ||
        b.tahun_terbit.toLowerCase().includes(q);
      const matchK = !state.filters.booksKategori || b.kategori_buku === state.filters.booksKategori;
      const matchC = !state.filters.booksKelas || String(b.jenjang_kelas) === String(state.filters.booksKelas);
      return matchQ && matchK && matchC;
    });

    const dateFilter = state.filters.booksDate;
    const logs = state.bookLogs.filter((l) => !dateFilter || l.tanggal_pinjam === dateFilter);

    return `
      <div class="sub-tabs no-print">
        <button class="sub-tab ${sub === "data" ? "active" : ""}" onclick="window.InventoryModule.setSubTab('books','data')">
          <i data-lucide="library"></i> Data Buku Pelajaran (${state.books.length})
        </button>
        <button class="sub-tab ${sub === "recap" ? "active" : ""}" onclick="window.InventoryModule.setSubTab('books','recap')">
          <i data-lucide="calendar-clock"></i> Rekapan Harian Buku Dipinjam (${logs.length})
        </button>
      </div>

      ${
        sub === "data"
          ? `
        <div class="card">
          <div class="toolbar no-print">
            <div class="toolbar-left">
              <div class="search-box">
                <i data-lucide="search"></i>
                <input type="text" placeholder="Cari judul buku, tahun, lokasi..." value="${escapeHtml(state.filters.booksSearch)}"
                  oninput="window.InventoryModule.updateFilter('booksSearch', this.value)" />
              </div>
              <select class="select-sm" onchange="window.InventoryModule.updateFilter('booksKategori', this.value)">
                <option value="">Semua Kategori (2 Kategori)</option>
                <option value="Buku Pelajaran Utama" ${state.filters.booksKategori === "Buku Pelajaran Utama" ? "selected" : ""}>Buku Pelajaran Utama</option>
                <option value="Buku Pelajaran Penunjang" ${state.filters.booksKategori === "Buku Pelajaran Penunjang" ? "selected" : ""}>Buku Pelajaran Penunjang</option>
              </select>
              <select class="select-sm" onchange="window.InventoryModule.updateFilter('booksKelas', this.value)">
                <option value="">Semua Kelas (1–12)</option>
                ${Array.from({ length: 12 }, (_, i) => i + 1)
                  .map((k) => `<option value="${k}" ${String(state.filters.booksKelas) === String(k) ? "selected" : ""}>Kelas ${k}</option>`)
                  .join("")}
              </select>
            </div>
            <div class="toolbar-right">
              <button class="btn btn-primary btn-sm" onclick="window.InventoryModule.openBookModal()">
                <i data-lucide="plus"></i> Tambah Buku
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.ExcelHelper.downloadTemplate('books')">
                <i data-lucide="file-spreadsheet"></i> Unduh Template Excel
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.InventoryModule.triggerImport('books')">
                <i data-lucide="upload"></i> Import Excel
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.InventoryModule.exportBooks()">
                <i data-lucide="download"></i> Export Excel
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.InventoryModule.confirmDeleteAll('books')">
                <i data-lucide="trash-2"></i> Hapus Semua
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table data-table-compact">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Barang (Judul Buku)</th>
                  <th>Kategori & Kelas</th>
                  <th>Thn Terbit</th>
                  <th>Tgl Masuk</th>
                  <th class="num">Jml Masuk</th>
                  <th>Tgl Keluar (Pinjam)</th>
                  <th class="num">Jml Keluar</th>
                  <th>Tgl Kembali</th>
                  <th class="num">Jml Kembali</th>
                  <th class="num">Sisa Buku</th>
                  <th>Kelayakan</th>
                  <th>Lokasi Buku</th>
                  <th class="no-print">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filtered.length
                    ? filtered
                        .map(
                          (b, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${escapeHtml(b.nama_barang)}</strong></td>
                    <td>
                      <span class="tag">${escapeHtml(b.kategori_buku)}</span>
                      <span class="tag tag-amber">Kelas ${b.jenjang_kelas}</span>
                    </td>
                    <td>${escapeHtml(b.tahun_terbit || "-")}</td>
                    <td>${escapeHtml(b.tanggal_masuk || "-")}</td>
                    <td class="num">${b.jumlah_masuk}</td>
                    <td>${escapeHtml(b.tanggal_keluar || "-")}</td>
                    <td class="num">${b.jumlah_keluar}</td>
                    <td>${escapeHtml(b.tanggal_pengembalian || "-")}</td>
                    <td class="num">${b.jumlah_dikembalikan}</td>
                    <td class="num"><strong>${b.sisa_buku}</strong></td>
                    <td>${badgeKelayakan(b.kelayakan)}</td>
                    <td>${escapeHtml(b.lokasi_buku || "-")}</td>
                    <td class="actions-cell no-print">
                      <button class="icon-btn text-emerald" title="Catat Peminjaman Buku" onclick="window.InventoryModule.openBookLogModal(${b.id})"><i data-lucide="book-up"></i></button>
                      <button class="icon-btn text-blue" title="Edit" onclick="window.InventoryModule.openBookModal(${b.id})"><i data-lucide="pencil"></i></button>
                      <button class="icon-btn text-red" title="Hapus" onclick="window.InventoryModule.deleteItem('books', ${b.id}, '${escapeHtml(b.nama_barang)}')"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="14" class="empty-cell">Belum ada data buku.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      `
          : `
        <div class="card print-area">
          ${renderPrintHeader("REKAPAN HARIAN PEMINJAMAN & PENGEMBALIAN BUKU", dateFilter || "Semua Tanggal")}
          <div class="toolbar no-print">
            <div class="toolbar-left">
              <label class="inline-label">Tanggal Pinjam:
                <input type="date" class="input-sm" value="${escapeHtml(dateFilter)}"
                  onchange="window.InventoryModule.updateFilter('booksDate', this.value)" />
              </label>
              <button class="btn btn-ghost btn-sm" onclick="window.InventoryModule.updateFilter('booksDate', '')">Semua Tanggal</button>
            </div>
            <div class="toolbar-right">
              <button class="btn btn-primary btn-sm" onclick="window.InventoryModule.openBookLogModal()">
                <i data-lucide="plus"></i> Catat Peminjaman Buku
              </button>
              <button class="btn btn-amber btn-sm" onclick="window.InventoryModule.printRecap()">
                <i data-lucide="printer"></i> Cetak Rekapan Harian
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tgl Pinjam</th>
                  <th>Judul Buku</th>
                  <th>Kategori & Kelas</th>
                  <th>Peminjam</th>
                  <th class="num">Jml Dipinjam</th>
                  <th>Tgl Pengembalian</th>
                  <th class="num">Jml Dikembalikan</th>
                  <th>Keterangan</th>
                  <th class="no-print">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${
                  logs.length
                    ? logs
                        .map((l, idx) => {
                          const sisaPinjam = l.jumlah_dipinjam - l.jumlah_dikembalikan;
                          return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${escapeHtml(l.tanggal_pinjam)}</td>
                    <td><strong>${escapeHtml(l.nama_barang)}</strong></td>
                    <td>${escapeHtml(l.kategori_buku)} (Kls ${l.jenjang_kelas})</td>
                    <td>${escapeHtml(l.peminjam || "-")}</td>
                    <td class="num"><strong>${l.jumlah_dipinjam}</strong></td>
                    <td>${escapeHtml(l.tanggal_pengembalian || "-")}</td>
                    <td class="num">${l.jumlah_dikembalikan}</td>
                    <td>${escapeHtml(l.keterangan || "-")}</td>
                    <td class="actions-cell no-print">
                      ${
                        sisaPinjam > 0
                          ? `<button class="icon-btn text-emerald" title="Catat Pengembalian" onclick="window.InventoryModule.openBookReturnModal(${l.id}, ${sisaPinjam})"><i data-lucide="rotate-ccw"></i></button>`
                          : `<span class="badge badge-success">Kembali</span>`
                      }
                      <button class="icon-btn text-red" title="Hapus" onclick="window.InventoryModule.deleteLog('books', ${l.id})"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`;
                        })
                        .join("")
                    : `<tr><td colspan="10" class="empty-cell">Tidak ada catatan peminjaman buku pada tanggal ini.</td></tr>`
                }
              </tbody>
            </table>
          </div>
          ${renderPrintFooter()}
        </div>
      `
      }
    `;
  }

  // -------------------------------------------------------------------------
  // 1c. Perlengkapan Sekolah
  // -------------------------------------------------------------------------

  function renderEquipment() {
    const sub = state.subTab.equipment;
    const filtered = state.equipment.filter((e) => {
      const q = state.filters.equipmentSearch.toLowerCase();
      const matchQ =
        !q ||
        e.nama_barang.toLowerCase().includes(q) ||
        e.kategori.toLowerCase().includes(q) ||
        e.lokasi_barang.toLowerCase().includes(q);
      const matchK = !state.filters.equipmentKelayakan || e.kelayakan === state.filters.equipmentKelayakan;
      const matchS = !state.filters.equipmentStatus || e.status === state.filters.equipmentStatus;
      return matchQ && matchK && matchS;
    });

    const dateFilter = state.filters.equipmentDate;
    const logs = state.equipmentLogs.filter((l) => !dateFilter || l.tanggal === dateFilter);

    return `
      <div class="sub-tabs no-print">
        <button class="sub-tab ${sub === "data" ? "active" : ""}" onclick="window.InventoryModule.setSubTab('equipment','data')">
          <i data-lucide="armchair"></i> Data Perlengkapan Sekolah (${state.equipment.length})
        </button>
        <button class="sub-tab ${sub === "recap" ? "active" : ""}" onclick="window.InventoryModule.setSubTab('equipment','recap')">
          <i data-lucide="truck"></i> Rekapan Harian Distribusi Perlengkapan (${logs.length})
        </button>
      </div>

      ${
        sub === "data"
          ? `
        <div class="card">
          <div class="toolbar no-print">
            <div class="toolbar-left">
              <div class="search-box">
                <i data-lucide="search"></i>
                <input type="text" placeholder="Cari perlengkapan, kategori, lokasi..." value="${escapeHtml(state.filters.equipmentSearch)}"
                  oninput="window.InventoryModule.updateFilter('equipmentSearch', this.value)" />
              </div>
              <select class="select-sm" onchange="window.InventoryModule.updateFilter('equipmentKelayakan', this.value)">
                <option value="">Semua Kelayakan</option>
                <option value="Layak" ${state.filters.equipmentKelayakan === "Layak" ? "selected" : ""}>Layak</option>
                <option value="Perlu Perbaikan" ${state.filters.equipmentKelayakan === "Perlu Perbaikan" ? "selected" : ""}>Perlu Perbaikan</option>
                <option value="Rusak" ${state.filters.equipmentKelayakan === "Rusak" ? "selected" : ""}>Rusak</option>
              </select>
              <select class="select-sm" onchange="window.InventoryModule.updateFilter('equipmentStatus', this.value)">
                <option value="">Semua Status</option>
                <option value="Ada" ${state.filters.equipmentStatus === "Ada" ? "selected" : ""}>Ada</option>
                <option value="Sedang Diperbaiki" ${state.filters.equipmentStatus === "Sedang Diperbaiki" ? "selected" : ""}>Sedang Diperbaiki</option>
                <option value="Hilang" ${state.filters.equipmentStatus === "Hilang" ? "selected" : ""}>Hilang</option>
              </select>
            </div>
            <div class="toolbar-right">
              <button class="btn btn-primary btn-sm" onclick="window.InventoryModule.openEquipmentModal()">
                <i data-lucide="plus"></i> Tambah Perlengkapan
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.ExcelHelper.downloadTemplate('equipment')">
                <i data-lucide="file-spreadsheet"></i> Unduh Template Excel
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.InventoryModule.triggerImport('equipment')">
                <i data-lucide="upload"></i> Import Excel
              </button>
              <button class="btn btn-outline btn-sm" onclick="window.InventoryModule.exportEquipment()">
                <i data-lucide="download"></i> Export Excel
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.InventoryModule.confirmDeleteAll('equipment')">
                <i data-lucide="trash-2"></i> Hapus Semua
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Barang</th>
                  <th>Kategori</th>
                  <th class="num">Stok Awal</th>
                  <th class="num">Stok Masuk</th>
                  <th class="num">Stok Keluar</th>
                  <th class="num">Sisa Stok</th>
                  <th>Kelayakan</th>
                  <th>Status</th>
                  <th>Lokasi Barang</th>
                  <th class="no-print">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filtered.length
                    ? filtered
                        .map(
                          (item, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${escapeHtml(item.nama_barang)}</strong></td>
                    <td><span class="tag">${escapeHtml(item.kategori)}</span></td>
                    <td class="num">${item.stok_awal}</td>
                    <td class="num">${item.stok_masuk}</td>
                    <td class="num">${item.stok_keluar}</td>
                    <td class="num"><strong>${item.sisa_stok}</strong></td>
                    <td>${badgeKelayakan(item.kelayakan)}</td>
                    <td>${badgeEquipmentStatus(item.status)}</td>
                    <td>${escapeHtml(item.lokasi_barang || "-")}</td>
                    <td class="actions-cell no-print">
                      <button class="icon-btn text-emerald" title="Catat Pengeluaran / Distribusi" onclick="window.InventoryModule.openEquipmentLogModal(${item.id})"><i data-lucide="send"></i></button>
                      <button class="icon-btn text-blue" title="Edit" onclick="window.InventoryModule.openEquipmentModal(${item.id})"><i data-lucide="pencil"></i></button>
                      <button class="icon-btn text-red" title="Hapus" onclick="window.InventoryModule.deleteItem('equipment', ${item.id}, '${escapeHtml(item.nama_barang)}')"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="11" class="empty-cell">Belum ada data perlengkapan sekolah.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      `
          : `
        <div class="card print-area">
          ${renderPrintHeader("REKAPAN HARIAN PERLENGKAPAN KELUAR / DIDISTRIBUSIKAN", dateFilter || "Semua Tanggal")}
          <div class="toolbar no-print">
            <div class="toolbar-left">
              <label class="inline-label">Tanggal Distribusi:
                <input type="date" class="input-sm" value="${escapeHtml(dateFilter)}"
                  onchange="window.InventoryModule.updateFilter('equipmentDate', this.value)" />
              </label>
              <button class="btn btn-ghost btn-sm" onclick="window.InventoryModule.updateFilter('equipmentDate', '')">Semua Tanggal</button>
            </div>
            <div class="toolbar-right">
              <button class="btn btn-primary btn-sm" onclick="window.InventoryModule.openEquipmentLogModal()">
                <i data-lucide="plus"></i> Catat Distribusi Perlengkapan
              </button>
              <button class="btn btn-amber btn-sm" onclick="window.InventoryModule.printRecap()">
                <i data-lucide="printer"></i> Cetak Rekapan Harian
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Nama Perlengkapan</th>
                  <th>Kategori</th>
                  <th class="num">Jumlah Keluar</th>
                  <th>Penerima / Lokasi Tujuan</th>
                  <th>Keterangan</th>
                  <th class="no-print">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${
                  logs.length
                    ? logs
                        .map(
                          (l, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${escapeHtml(l.tanggal)}</td>
                    <td><strong>${escapeHtml(l.nama_barang)}</strong></td>
                    <td>${escapeHtml(l.kategori)}</td>
                    <td class="num"><strong>${l.jumlah_keluar}</strong></td>
                    <td>${escapeHtml(l.penerima_lokasi || "-")}</td>
                    <td>${escapeHtml(l.keterangan || "-")}</td>
                    <td class="actions-cell no-print">
                      <button class="icon-btn text-red" title="Hapus Catatan" onclick="window.InventoryModule.deleteLog('equipment', ${l.id})"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="8" class="empty-cell">Tidak ada catatan distribusi perlengkapan pada tanggal ini.</td></tr>`
                }
              </tbody>
            </table>
          </div>
          ${renderPrintFooter()}
        </div>
      `
      }
    `;
  }

  function renderPrintHeader(title, dateLabel) {
    return `
      <div class="print-only print-header">
        <div class="print-kop">
          <h2>YPI BIDAYATUL HIDAYAH</h2>
          <p>SISTEM INVENTARIS SARANA & PRASARANA SEKOLAH</p>
          <hr />
          <h3>${escapeHtml(title)}</h3>
          <p>Periode / Tanggal: <strong>${escapeHtml(dateLabel)}</strong></p>
        </div>
      </div>
    `;
  }

  function renderPrintFooter() {
    return `
      <div class="print-only print-footer">
        <div class="print-signatures">
          <div>
            <p>Petugas Inventaris,</p>
            <br /><br /><br />
            <p>_______________________</p>
          </div>
          <div>
            <p>Mengetahui, Kepala Sekolah</p>
            <br /><br /><br />
            <p>_______________________</p>
          </div>
        </div>
        <div class="print-promo">
          YouTube Resmi: https://www.youtube.com/@POJOK_BELAJAR-ID — <em>jangan lupa subscribe</em>
        </div>
      </div>
    `;
  }

  function updateFilter(key, value) {
    state.filters[key] = value;
    render();
  }

  function printRecap() {
    window.print();
  }

  // -------------------------------------------------------------------------
  // Modals: Add/Edit & Daily Logs
  // -------------------------------------------------------------------------

  function openConsumableModal(id = null) {
    const existing = id ? state.consumables.find((c) => c.id === id) : null;
    window.App.openModal(
      existing ? "Edit Barang Habis Pakai" : "Tambah Barang Habis Pakai",
      `
      <form id="consumable-form" class="form-grid">
        <div class="form-group col-span-2">
          <label>Nama Barang *</label>
          <input name="nama_barang" required value="${escapeHtml(existing?.nama_barang || "")}" placeholder="Contoh: Kertas HVS A4" />
        </div>
        <div class="form-group">
          <label>Satuan *</label>
          <input name="satuan" required value="${escapeHtml(existing?.satuan || "Pcs")}" placeholder="Pcs / Rim / Botol" />
        </div>
        <div class="form-group">
          <label>Kategori *</label>
          <input name="kategori" required value="${escapeHtml(existing?.kategori || "ATK")}" placeholder="ATK / Kebersihan / UKS" />
        </div>
        <div class="form-group">
          <label>Jumlah Barang Awal</label>
          <input type="number" min="0" name="jumlah_awal" value="${existing?.jumlah_awal ?? 0}" />
        </div>
        <div class="form-group">
          <label>Barang Masuk</label>
          <input type="number" min="0" name="barang_masuk" value="${existing?.barang_masuk ?? 0}" />
        </div>
        <div class="form-group">
          <label>Barang yang Dipakai</label>
          <input type="number" min="0" name="barang_dipakai" value="${existing?.barang_dipakai ?? 0}" />
        </div>
        <div class="form-group">
          <label>Batas Status Menipis</label>
          <input type="number" min="0" name="batas_menipis" value="${existing?.batas_menipis ?? 5}" />
        </div>
        <div class="form-group col-span-2">
          <label>Lokasi Barang</label>
          <input name="lokasi_barang" value="${escapeHtml(existing?.lokasi_barang || "")}" placeholder="Contoh: Lemari Tata Usaha" />
        </div>
        <div class="modal-actions col-span-2">
          <button type="button" class="btn btn-outline" onclick="window.App.closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Data</button>
        </div>
      </form>
      `
    );

    document.getElementById("consumable-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        nama_barang: fd.get("nama_barang"),
        satuan: fd.get("satuan"),
        kategori: fd.get("kategori"),
        jumlah_awal: Number(fd.get("jumlah_awal") || 0),
        barang_masuk: Number(fd.get("barang_masuk") || 0),
        barang_dipakai: Number(fd.get("barang_dipakai") || 0),
        batas_menipis: Number(fd.get("batas_menipis") || 5),
        lokasi_barang: fd.get("lokasi_barang"),
      };
      try {
        if (existing) {
          await window.App.api(`/api/inventory/consumables/${existing.id}`, { method: "PUT", body: payload });
        } else {
          await window.App.api("/api/inventory/consumables", { method: "POST", body: payload });
        }
        window.App.closeModal();
        window.App.toast("Data barang habis pakai berhasil disimpan.");
        await loadAll();
        render();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  function openConsumableLogModal(preselectId = null) {
    const today = new Date().toISOString().slice(0, 10);
    window.App.openModal(
      "Catat Pemakaian Harian Barang Habis Pakai",
      `
      <form id="consumable-log-form" class="form-grid">
        <div class="form-group col-span-2">
          <label>Pilih Barang *</label>
          <select name="consumable_id" required>
            <option value="">-- Pilih Barang Habis Pakai --</option>
            ${state.consumables
              .map(
                (c) => `<option value="${c.id}" ${c.id === preselectId ? "selected" : ""}>${escapeHtml(c.nama_barang)} (Sisa: ${c.sisa_barang} ${escapeHtml(c.satuan)})</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Tanggal *</label>
          <input type="date" name="tanggal" required value="${today}" />
        </div>
        <div class="form-group">
          <label>Jumlah Dipakai *</label>
          <input type="number" min="1" name="jumlah_dipakai" required value="1" />
        </div>
        <div class="form-group col-span-2">
          <label>Pengguna / Bagian</label>
          <input name="pengguna" placeholder="Contoh: Ruang Guru / Bagian Kurikulum" />
        </div>
        <div class="form-group col-span-2">
          <label>Keterangan</label>
          <input name="keterangan" placeholder="Contoh: Cetak soal ujian" />
        </div>
        <div class="modal-actions col-span-2">
          <button type="button" class="btn btn-outline" onclick="window.App.closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Rekapan</button>
        </div>
      </form>
      `
    );

    document.getElementById("consumable-log-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await window.App.api("/api/inventory/consumables/logs", {
          method: "POST",
          body: {
            consumable_id: Number(fd.get("consumable_id")),
            tanggal: fd.get("tanggal"),
            jumlah_dipakai: Number(fd.get("jumlah_dipakai")),
            pengguna: fd.get("pengguna"),
            keterangan: fd.get("keterangan"),
          },
        });
        window.App.closeModal();
        window.App.toast("Pemakaian harian berhasil dicatat.");
        await loadAll();
        render();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  function openBookModal(id = null) {
    const existing = id ? state.books.find((b) => b.id === id) : null;
    const today = new Date().toISOString().slice(0, 10);
    window.App.openModal(
      existing ? "Edit Data Buku" : "Tambah Buku Pelajaran",
      `
      <form id="book-form" class="form-grid">
        <div class="form-group col-span-2">
          <label>Nama Barang (Judul Buku) *</label>
          <input name="nama_barang" required value="${escapeHtml(existing?.nama_barang || "")}" placeholder="Contoh: Matematika Wajib Kelas XII" />
        </div>
        <div class="form-group">
          <label>Kategori Buku (2 Kategori) *</label>
          <select name="kategori_buku" required>
            <option value="Buku Pelajaran Utama" ${existing?.kategori_buku === "Buku Pelajaran Utama" ? "selected" : ""}>Buku Pelajaran Utama</option>
            <option value="Buku Pelajaran Penunjang" ${existing?.kategori_buku === "Buku Pelajaran Penunjang" ? "selected" : ""}>Buku Pelajaran Penunjang</option>
          </select>
        </div>
        <div class="form-group">
          <label>Jenjang Kelas (1–12) *</label>
          <select name="jenjang_kelas" required>
            ${Array.from({ length: 12 }, (_, i) => i + 1)
              .map((k) => `<option value="${k}" ${(existing?.jenjang_kelas || 1) === k ? "selected" : ""}>Kelas ${k}</option>`)
              .join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Tahun Terbit</label>
          <input name="tahun_terbit" value="${escapeHtml(existing?.tahun_terbit || "2025")}" />
        </div>
        <div class="form-group">
          <label>Kelayakan</label>
          <select name="kelayakan">
            <option value="Layak" ${existing?.kelayakan === "Layak" ? "selected" : ""}>Layak</option>
            <option value="Tidak Layak" ${existing?.kelayakan === "Tidak Layak" ? "selected" : ""}>Tidak Layak</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tanggal Masuk Buku</label>
          <input type="date" name="tanggal_masuk" value="${escapeHtml(existing?.tanggal_masuk || today)}" />
        </div>
        <div class="form-group">
          <label>Jumlah Buku Masuk</label>
          <input type="number" min="0" name="jumlah_masuk" value="${existing?.jumlah_masuk ?? 0}" />
        </div>
        <div class="form-group">
          <label>Tgl Keluar (Dipinjam)</label>
          <input type="date" name="tanggal_keluar" value="${escapeHtml(existing?.tanggal_keluar || "")}" />
        </div>
        <div class="form-group">
          <label>Jumlah Keluar (Dipinjam)</label>
          <input type="number" min="0" name="jumlah_keluar" value="${existing?.jumlah_keluar ?? 0}" />
        </div>
        <div class="form-group">
          <label>Tanggal Pengembalian</label>
          <input type="date" name="tanggal_pengembalian" value="${escapeHtml(existing?.tanggal_pengembalian || "")}" />
        </div>
        <div class="form-group">
          <label>Jumlah Dikembalikan</label>
          <input type="number" min="0" name="jumlah_dikembalikan" value="${existing?.jumlah_dikembalikan ?? 0}" />
        </div>
        <div class="form-group col-span-2">
          <label>Lokasi Buku</label>
          <input name="lokasi_buku" value="${escapeHtml(existing?.lokasi_buku || "")}" placeholder="Contoh: Rak A1 Perpustakaan" />
        </div>
        <div class="modal-actions col-span-2">
          <button type="button" class="btn btn-outline" onclick="window.App.closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Data</button>
        </div>
      </form>
      `
    );

    document.getElementById("book-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        nama_barang: fd.get("nama_barang"),
        kategori_buku: fd.get("kategori_buku"),
        jenjang_kelas: Number(fd.get("jenjang_kelas")),
        tahun_terbit: fd.get("tahun_terbit"),
        tanggal_masuk: fd.get("tanggal_masuk"),
        jumlah_masuk: Number(fd.get("jumlah_masuk") || 0),
        tanggal_keluar: fd.get("tanggal_keluar"),
        jumlah_keluar: Number(fd.get("jumlah_keluar") || 0),
        tanggal_pengembalian: fd.get("tanggal_pengembalian"),
        jumlah_dikembalikan: Number(fd.get("jumlah_dikembalikan") || 0),
        kelayakan: fd.get("kelayakan"),
        lokasi_buku: fd.get("lokasi_buku"),
      };
      try {
        if (existing) {
          await window.App.api(`/api/inventory/books/${existing.id}`, { method: "PUT", body: payload });
        } else {
          await window.App.api("/api/inventory/books", { method: "POST", body: payload });
        }
        window.App.closeModal();
        window.App.toast("Data buku berhasil disimpan.");
        await loadAll();
        render();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  function openBookLogModal(preselectId = null) {
    const today = new Date().toISOString().slice(0, 10);
    window.App.openModal(
      "Catat Peminjaman Buku Harian",
      `
      <form id="book-log-form" class="form-grid">
        <div class="form-group col-span-2">
          <label>Pilih Buku *</label>
          <select name="book_id" required>
            <option value="">-- Pilih Buku --</option>
            ${state.books
              .map(
                (b) => `<option value="${b.id}" ${b.id === preselectId ? "selected" : ""}>${escapeHtml(b.nama_barang)} (Kls ${b.jenjang_kelas} • Sisa: ${b.sisa_buku})</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Tanggal Pinjam *</label>
          <input type="date" name="tanggal_pinjam" required value="${today}" />
        </div>
        <div class="form-group">
          <label>Jumlah Dipinjam *</label>
          <input type="number" min="1" name="jumlah_dipinjam" required value="1" />
        </div>
        <div class="form-group col-span-2">
          <label>Nama Peminjam / Kelas *</label>
          <input name="peminjam" required placeholder="Contoh: Ahmad Zaki / Kelas 12 IPA" />
        </div>
        <div class="form-group col-span-2">
          <label>Keterangan</label>
          <input name="keterangan" placeholder="Keperluan peminjaman" />
        </div>
        <div class="modal-actions col-span-2">
          <button type="button" class="btn btn-outline" onclick="window.App.closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Peminjaman</button>
        </div>
      </form>
      `
    );

    document.getElementById("book-log-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await window.App.api("/api/inventory/books/logs", {
          method: "POST",
          body: {
            book_id: Number(fd.get("book_id")),
            tanggal_pinjam: fd.get("tanggal_pinjam"),
            jumlah_dipinjam: Number(fd.get("jumlah_dipinjam")),
            peminjam: fd.get("peminjam"),
            keterangan: fd.get("keterangan"),
          },
        });
        window.App.closeModal();
        window.App.toast("Peminjaman buku berhasil dicatat.");
        await loadAll();
        render();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  function openBookReturnModal(logId, maxSisa) {
    const today = new Date().toISOString().slice(0, 10);
    window.App.openModal(
      "Catat Pengembalian Buku",
      `
      <form id="book-return-form" class="form-grid">
        <div class="form-group">
          <label>Tanggal Pengembalian *</label>
          <input type="date" name="tanggal_pengembalian" required value="${today}" />
        </div>
        <div class="form-group">
          <label>Jumlah Dikembalikan (Maks: ${maxSisa}) *</label>
          <input type="number" min="1" max="${maxSisa}" name="jumlah_dikembalikan" required value="${maxSisa}" />
        </div>
        <div class="modal-actions col-span-2">
          <button type="button" class="btn btn-outline" onclick="window.App.closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Pengembalian</button>
        </div>
      </form>
      `
    );

    document.getElementById("book-return-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await window.App.api(`/api/inventory/books/logs/${logId}/return`, {
          method: "POST",
          body: {
            tanggal_pengembalian: fd.get("tanggal_pengembalian"),
            jumlah_dikembalikan: Number(fd.get("jumlah_dikembalikan")),
          },
        });
        window.App.closeModal();
        window.App.toast("Pengembalian buku berhasil dicatat.");
        await loadAll();
        render();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  function openEquipmentModal(id = null) {
    const existing = id ? state.equipment.find((e) => e.id === id) : null;
    window.App.openModal(
      existing ? "Edit Perlengkapan Sekolah" : "Tambah Perlengkapan Sekolah",
      `
      <form id="equipment-form" class="form-grid">
        <div class="form-group col-span-2">
          <label>Nama Barang *</label>
          <input name="nama_barang" required value="${escapeHtml(existing?.nama_barang || "")}" placeholder="Contoh: Proyektor LCD Epson" />
        </div>
        <div class="form-group">
          <label>Kategori *</label>
          <input name="kategori" required value="${escapeHtml(existing?.kategori || "Elektronik")}" placeholder="Elektronik / Mebel / Olahraga / Lab" />
        </div>
        <div class="form-group">
          <label>Lokasi Barang</label>
          <input name="lokasi_barang" value="${escapeHtml(existing?.lokasi_barang || "")}" placeholder="Contoh: Ruang Kelas 12" />
        </div>
        <div class="form-group">
          <label>Jumlah Stok Awal</label>
          <input type="number" min="0" name="stok_awal" value="${existing?.stok_awal ?? 0}" />
        </div>
        <div class="form-group">
          <label>Stok Masuk</label>
          <input type="number" min="0" name="stok_masuk" value="${existing?.stok_masuk ?? 0}" />
        </div>
        <div class="form-group">
          <label>Stok yang Keluar</label>
          <input type="number" min="0" name="stok_keluar" value="${existing?.stok_keluar ?? 0}" />
        </div>
        <div class="form-group">
          <label>Kelayakan</label>
          <select name="kelayakan">
            <option value="Layak" ${existing?.kelayakan === "Layak" ? "selected" : ""}>Layak</option>
            <option value="Perlu Perbaikan" ${existing?.kelayakan === "Perlu Perbaikan" ? "selected" : ""}>Perlu Perbaikan</option>
            <option value="Rusak" ${existing?.kelayakan === "Rusak" ? "selected" : ""}>Rusak</option>
          </select>
        </div>
        <div class="form-group col-span-2">
          <label>Status</label>
          <select name="status">
            <option value="Ada" ${existing?.status === "Ada" ? "selected" : ""}>Ada</option>
            <option value="Sedang Diperbaiki" ${existing?.status === "Sedang Diperbaiki" ? "selected" : ""}>Sedang Diperbaiki</option>
            <option value="Hilang" ${existing?.status === "Hilang" ? "selected" : ""}>Hilang</option>
          </select>
        </div>
        <div class="modal-actions col-span-2">
          <button type="button" class="btn btn-outline" onclick="window.App.closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Data</button>
        </div>
      </form>
      `
    );

    document.getElementById("equipment-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        nama_barang: fd.get("nama_barang"),
        kategori: fd.get("kategori"),
        stok_awal: Number(fd.get("stok_awal") || 0),
        stok_masuk: Number(fd.get("stok_masuk") || 0),
        stok_keluar: Number(fd.get("stok_keluar") || 0),
        kelayakan: fd.get("kelayakan"),
        status: fd.get("status"),
        lokasi_barang: fd.get("lokasi_barang"),
      };
      try {
        if (existing) {
          await window.App.api(`/api/inventory/equipment/${existing.id}`, { method: "PUT", body: payload });
        } else {
          await window.App.api("/api/inventory/equipment", { method: "POST", body: payload });
        }
        window.App.closeModal();
        window.App.toast("Data perlengkapan berhasil disimpan.");
        await loadAll();
        render();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  function openEquipmentLogModal(preselectId = null) {
    const today = new Date().toISOString().slice(0, 10);
    window.App.openModal(
      "Catat Pengeluaran / Distribusi Perlengkapan",
      `
      <form id="equipment-log-form" class="form-grid">
        <div class="form-group col-span-2">
          <label>Pilih Perlengkapan *</label>
          <select name="equipment_id" required>
            <option value="">-- Pilih Perlengkapan --</option>
            ${state.equipment
              .map(
                (e) => `<option value="${e.id}" ${e.id === preselectId ? "selected" : ""}>${escapeHtml(e.nama_barang)} (Sisa Stok: ${e.sisa_stok})</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Tanggal *</label>
          <input type="date" name="tanggal" required value="${today}" />
        </div>
        <div class="form-group">
          <label>Jumlah Keluar *</label>
          <input type="number" min="1" name="jumlah_keluar" required value="1" />
        </div>
        <div class="form-group col-span-2">
          <label>Penerima / Lokasi Tujuan *</label>
          <input name="penerima_lokasi" required placeholder="Contoh: Ruang Kelas 11 IPA / Lab Komputer" />
        </div>
        <div class="form-group col-span-2">
          <label>Keterangan</label>
          <input name="keterangan" placeholder="Keperluan distribusi" />
        </div>
        <div class="modal-actions col-span-2">
          <button type="button" class="btn btn-outline" onclick="window.App.closeModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Rekapan</button>
        </div>
      </form>
      `
    );

    document.getElementById("equipment-log-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await window.App.api("/api/inventory/equipment/logs", {
          method: "POST",
          body: {
            equipment_id: Number(fd.get("equipment_id")),
            tanggal: fd.get("tanggal"),
            jumlah_keluar: Number(fd.get("jumlah_keluar")),
            penerima_lokasi: fd.get("penerima_lokasi"),
            keterangan: fd.get("keterangan"),
          },
        });
        window.App.closeModal();
        window.App.toast("Distribusi perlengkapan berhasil dicatat.");
        await loadAll();
        render();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  // -------------------------------------------------------------------------
  // Delete, Delete All, Excel Import & Export
  // -------------------------------------------------------------------------

  async function deleteItem(type, id, label) {
    if (!confirm(`Hapus "${label}"?`)) return;
    try {
      await window.App.api(`/api/inventory/${type}/${id}`, { method: "DELETE" });
      window.App.toast("Data berhasil dihapus.");
      await loadAll();
      render();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  async function confirmDeleteAll(type) {
    const names = {
      consumables: "SEMUA data Barang Habis Pakai",
      books: "SEMUA data Inventaris Buku",
      equipment: "SEMUA data Perlengkapan Sekolah",
    };
    if (!confirm(`Peringatan! Anda yakin ingin menghapus ${names[type]}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      await window.App.api(`/api/inventory/${type}`, { method: "DELETE" });
      window.App.toast("Semua data kategori berhasil dihapus.");
      await loadAll();
      render();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  async function deleteLog(type, logId) {
    if (!confirm("Hapus catatan rekapan harian ini? Stok akan disesuaikan kembali.")) return;
    try {
      await window.App.api(`/api/inventory/${type}/logs/${logId}`, { method: "DELETE" });
      window.App.toast("Catatan rekapan berhasil dihapus.");
      await loadAll();
      render();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  function triggerImport(type) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const rows = await window.ExcelHelper.parseFile(file, type);
        if (!rows.length) {
          window.App.toast("Tidak ada baris valid yang ditemukan pada file Excel.", "error");
          return;
        }
        const res = await window.App.api(`/api/inventory/${type}/import`, {
          method: "POST",
          body: rows,
        });
        window.App.toast(`Berhasil mengimpor ${res.imported} data dari Excel.`);
        await loadAll();
        render();
      } catch (err) {
        window.App.toast(`Gagal import Excel: ${err.message}`, "error");
      }
    };
    input.click();
  }

  function exportConsumables() {
    window.ExcelHelper.exportRows(
      state.consumables,
      [
        { key: "nama_barang", label: "Nama Barang" },
        { key: "satuan", label: "Satuan" },
        { key: "kategori", label: "Kategori" },
        { key: "jumlah_awal", label: "Jumlah Barang Awal" },
        { key: "barang_masuk", label: "Barang Masuk" },
        { key: "barang_dipakai", label: "Barang yang Dipakai" },
        { key: "sisa_barang", label: "Sisa Barang" },
        { key: "status", label: "Status" },
        { key: "lokasi_barang", label: "Lokasi Barang" },
      ],
      "Barang Habis Pakai",
      "Export_Barang_Habis_Pakai_YPI_BH.xlsx"
    );
  }

  function exportBooks() {
    window.ExcelHelper.exportRows(
      state.books,
      [
        { key: "nama_barang", label: "Nama Barang (Judul Buku)" },
        { key: "kategori_buku", label: "Kategori Buku" },
        { key: "jenjang_kelas", label: "Jenjang Kelas" },
        { key: "tahun_terbit", label: "Tahun Terbit" },
        { key: "tanggal_masuk", label: "Tanggal Masuk Buku" },
        { key: "jumlah_masuk", label: "Jumlah Buku Masuk" },
        { key: "tanggal_keluar", label: "Tanggal Keluar (Dipinjam)" },
        { key: "jumlah_keluar", label: "Jumlah Keluar (Dipinjam)" },
        { key: "tanggal_pengembalian", label: "Tanggal Pengembalian" },
        { key: "jumlah_dikembalikan", label: "Jumlah Dikembalikan" },
        { key: "sisa_buku", label: "Sisa Buku" },
        { key: "kelayakan", label: "Kelayakan" },
        { key: "lokasi_buku", label: "Lokasi Buku" },
      ],
      "Inventaris Buku",
      "Export_Inventaris_Buku_YPI_BH.xlsx"
    );
  }

  function exportEquipment() {
    window.ExcelHelper.exportRows(
      state.equipment,
      [
        { key: "nama_barang", label: "Nama Barang" },
        { key: "kategori", label: "Kategori" },
        { key: "stok_awal", label: "Jumlah Stok Awal" },
        { key: "stok_masuk", label: "Stok Masuk" },
        { key: "stok_keluar", label: "Stok yang Keluar" },
        { key: "sisa_stok", label: "Sisa Stok" },
        { key: "kelayakan", label: "Kelayakan" },
        { key: "status", label: "Status" },
        { key: "lokasi_barang", label: "Lokasi Barang" },
      ],
      "Perlengkapan Sekolah",
      "Export_Perlengkapan_Sekolah_YPI_BH.xlsx"
    );
  }

  return {
    initAndRender,
    setTab,
    setSubTab,
    updateFilter,
    printRecap,
    openConsumableModal,
    openConsumableLogModal,
    openBookModal,
    openBookLogModal,
    openBookReturnModal,
    openEquipmentModal,
    openEquipmentLogModal,
    deleteItem,
    confirmDeleteAll,
    deleteLog,
    triggerImport,
    exportConsumables,
    exportBooks,
    exportEquipment,
    getActiveTab: () => state.tab,
  };
})();
