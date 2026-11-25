/**
 * Main Application Controller, Router, Right-Side Autohide Menu, and Persistent UI
 * for YPI BIDAYATUL HIDAYAH.
 */
window.App = (() => {
  const { escapeHtml } = window.MathHelper;

  let currentPage = "portal"; // portal | inventory | exam-portal
  let token = localStorage.getItem("ypi_bh_token") || "";
  let currentUser = null;
  let menuPinned = false;
  let hideTimer = null;

  function getUser() {
    return currentUser;
  }

  function setSession(newToken, userObj) {
    token = newToken;
    currentUser = userObj;
    localStorage.setItem("ypi_bh_token", newToken);
    refreshTopbarUser();
    refreshRightMenu();
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (_) {
      // ignore network error on logout
    }
    token = "";
    currentUser = null;
    localStorage.removeItem("ypi_bh_token");
    refreshTopbarUser();
    navigate("exam-portal");
    toast("Anda telah keluar dari akun.");
  }

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let body = options.body;
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }

    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body,
    });

    if (res.status === 401 && token) {
      token = "";
      currentUser = null;
      localStorage.removeItem("ypi_bh_token");
      refreshTopbarUser();
    }

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { detail: text };
    }

    if (!res.ok) {
      throw new Error(data?.detail || `Error HTTP ${res.status}`);
    }
    return data;
  }

  function toast(message, type = "success") {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("toast-hide");
      setTimeout(() => el.remove(), 300);
    }, 3400);
  }

  function openModal(title, bodyHtml, sizeClass = "") {
    const backdrop = document.getElementById("modal-backdrop");
    const box = document.getElementById("modal-box");
    const titleEl = document.getElementById("modal-title");
    const bodyEl = document.getElementById("modal-body");
    if (!backdrop || !box) return;

    box.className = `modal-box ${sizeClass}`;
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    backdrop.classList.add("open");
    if (window.lucide) window.lucide.createIcons();
  }

  function closeModal() {
    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.classList.remove("open");
  }

  // -------------------------------------------------------------------------
  // Navigation & Portal Landing Page
  // -------------------------------------------------------------------------

  async function navigate(page, subSection = null) {
    currentPage = page;
    closeRightMenuIfNotPinned();

    if (page === "portal") {
      renderPortal();
    } else if (page === "inventory") {
      await window.InventoryModule.initAndRender(subSection);
    } else if (page === "exam-portal") {
      await window.ExamModule.initAndRender(subSection);
    }
    refreshRightMenu();
  }

  function renderPortal() {
    const container = document.getElementById("main-content");
    if (!container) return;
    container.innerHTML = `
      <section class="hero-portal">
        <div class="hero-content">
          <span class="hero-pill"><i data-lucide="school"></i> SISTEM INFORMASI TERPADU SEKOLAH</span>
          <h1>YPI BIDAYATUL HIDAYAH</h1>
          <p class="hero-desc">
            Platform digital terpadu untuk pengelolaan <strong>Inventaris Barang Sekolah</strong> (Barang Habis Pakai, Buku Kelas 1–12, Perlengkapan) serta <strong>Inventaris Soal & Ujian Sistem UTBK</strong> bagi Guru dan Siswa.
          </p>
          <div class="hero-cta-row">
            <button class="btn btn-primary btn-lg" onclick="window.App.navigate('inventory')">
              <i data-lucide="boxes"></i> Dashboard Inventaris Sekolah
            </button>
            <button class="btn btn-amber btn-lg" onclick="window.App.navigate('exam-portal')">
              <i data-lucide="graduation-cap"></i> Dashboard Soal & Ujian UTBK
            </button>
          </div>
        </div>
      </section>

      <section class="portal-cards">
        <div class="portal-card" onclick="window.App.navigate('inventory')">
          <div class="portal-card-icon bg-emerald"><i data-lucide="warehouse"></i></div>
          <span class="eyebrow">DASHBOARD 1</span>
          <h2>Inventaris Barang Sekolah</h2>
          <ul class="feature-list">
            <li><i data-lucide="check"></i> Barang Habis Pakai (Stok Awal, Masuk, Dipakai, Sisa & Status)</li>
            <li><i data-lucide="check"></i> Inventaris Buku (2 Kategori Pelajaran • Kelas 1 – 12, Peminjaman & Pengembalian)</li>
            <li><i data-lucide="check"></i> Perlengkapan Sekolah (Kelayakan, Status & Distribusi)</li>
            <li><i data-lucide="check"></i> Unduh Template, Import & Export Excel, Hapus Semua, serta Cetak Rekapan Harian</li>
          </ul>
          <span class="portal-link">Buka Dashboard Inventaris <i data-lucide="arrow-right"></i></span>
        </div>

        <div class="portal-card" onclick="window.App.navigate('exam-portal')">
          <div class="portal-card-icon bg-amber"><i data-lucide="monitor-check"></i></div>
          <span class="eyebrow">DASHBOARD 2</span>
          <h2>Inventaris Soal & Ujian UTBK</h2>
          <ul class="feature-list">
            <li><i data-lucide="check"></i> Login Khusus Akun Guru & Akun Siswa</li>
            <li><i data-lucide="check"></i> Input Soal Mudah via Prompt JSON + Tampilan Matematika Rapi (KaTeX)</li>
            <li><i data-lucide="check"></i> Ujian Gaya UTBK dengan Panel Nomor Soal di Kanan + Tombol Sebelum & Sesudah</li>
            <li><i data-lucide="check"></i> Kunci Akses 1x Mengerjakan, Buka Akses oleh Guru & Grafik Perkembangan Siswa</li>
          </ul>
          <span class="portal-link">Buka Portal Ujian UTBK <i data-lucide="arrow-right"></i></span>
        </div>
      </section>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  // -------------------------------------------------------------------------
  // Right-Side Autohide Menu
  // -------------------------------------------------------------------------

  function setupRightAutohideMenu() {
    const triggerZone = document.getElementById("right-edge-trigger");
    const drawer = document.getElementById("right-autohide-drawer");
    if (!triggerZone || !drawer) return;

    const showDrawer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      drawer.classList.add("open");
    };

    const scheduleHide = () => {
      if (menuPinned) return;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        drawer.classList.remove("open");
      }, 260);
    };

    triggerZone.addEventListener("mouseenter", showDrawer);
    triggerZone.addEventListener("click", () => {
      if (drawer.classList.contains("open") && !menuPinned) {
        drawer.classList.remove("open");
      } else {
        showDrawer();
      }
    });

    drawer.addEventListener("mouseenter", showDrawer);
    drawer.addEventListener("mouseleave", scheduleHide);
  }

  function closeRightMenuIfNotPinned() {
    if (menuPinned) return;
    const drawer = document.getElementById("right-autohide-drawer");
    if (drawer) drawer.classList.remove("open");
  }

  function togglePinMenu() {
    menuPinned = !menuPinned;
    const drawer = document.getElementById("right-autohide-drawer");
    if (drawer) {
      drawer.classList.toggle("pinned", menuPinned);
      if (menuPinned) drawer.classList.add("open");
    }
    refreshRightMenu();
  }

  function refreshRightMenu() {
    const navBody = document.getElementById("right-menu-items");
    const pinBtn = document.getElementById("pin-menu-btn");
    if (!navBody) return;

    if (pinBtn) {
      pinBtn.innerHTML = menuPinned
        ? `<i data-lucide="pin-off"></i><span>Lepas Sematan</span>`
        : `<i data-lucide="pin"></i><span>Sematkan Menu</span>`;
    }

    let contextItems = [];
    if (currentPage === "inventory") {
      const t = window.InventoryModule.getActiveTab();
      contextItems = [
        { label: "Ringkasan Inventaris", icon: "layout-dashboard", action: "window.InventoryModule.setTab('overview')", active: t === "overview" },
        { label: "Barang Habis Pakai", icon: "package-open", action: "window.InventoryModule.setTab('consumables')", active: t === "consumables" },
        { label: "Inventaris Buku (Kls 1–12)", icon: "book-open", action: "window.InventoryModule.setTab('books')", active: t === "books" },
        { label: "Perlengkapan Sekolah", icon: "armchair", action: "window.InventoryModule.setTab('equipment')", active: t === "equipment" },
      ];
    } else if (currentPage === "exam-portal") {
      contextItems = window.ExamModule.getContextMenuItems();
    }

    navBody.innerHTML = `
      <div class="drawer-section-label">DASHBOARD UTAMA</div>
      <button class="drawer-item ${currentPage === "portal" ? "active" : ""}" onclick="window.App.navigate('portal')">
        <i data-lucide="home"></i> <span>Beranda YPI Bidayatul Hidayah</span>
      </button>
      <button class="drawer-item ${currentPage === "inventory" ? "active" : ""}" onclick="window.App.navigate('inventory')">
        <i data-lucide="boxes"></i> <span>Dashboard Inventaris Sekolah</span>
      </button>
      <button class="drawer-item ${currentPage === "exam-portal" ? "active" : ""}" onclick="window.App.navigate('exam-portal')">
        <i data-lucide="graduation-cap"></i> <span>Dashboard Soal & Ujian UTBK</span>
      </button>

      ${
        contextItems.length
          ? `
        <div class="drawer-divider"></div>
        <div class="drawer-section-label">${currentPage === "inventory" ? "MENU INVENTARIS" : "MENU PORTAL UJIAN"}</div>
        ${contextItems
          .map(
            (item) => `
          <button class="drawer-item ${item.active ? "active" : ""}" onclick="${item.action}; window.App.closeRightMenuIfNotPinned(); window.App.refreshRightMenu();">
            <i data-lucide="${item.icon}"></i> <span>${escapeHtml(item.label)}</span>
          </button>`
          )
          .join("")}
      `
          : ""
      }

      ${
        currentUser
          ? `
        <div class="drawer-divider"></div>
        <div class="drawer-user-box">
          <strong>${escapeHtml(currentUser.full_name)}</strong>
          <small>${currentUser.role === "guru" ? "Akun Guru" : `Siswa Kelas ${currentUser.kelas}`}</small>
          <button class="btn btn-danger btn-xs btn-block" style="margin-top:0.5rem;" onclick="window.App.logout()">
            <i data-lucide="log-out"></i> Keluar
          </button>
        </div>
      `
          : ""
      }
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  function refreshTopbarUser() {
    const slot = document.getElementById("topbar-user-slot");
    if (!slot) return;
    if (currentUser) {
      slot.innerHTML = `
        <span class="user-pill">
          <i data-lucide="${currentUser.role === "guru" ? "user-check" : "user"}"></i>
          <span>${escapeHtml(currentUser.full_name)}</span>
          <small>(${currentUser.role === "guru" ? "Guru" : `Kls ${currentUser.kelas}`})</small>
        </span>
      `;
    } else {
      slot.innerHTML = `
        <button class="btn btn-outline btn-xs" onclick="window.App.navigate('exam-portal')">
          <i data-lucide="log-in"></i> Login Ujian
        </button>
      `;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  async function init() {
    setupRightAutohideMenu();

    // Restore session if token exists
    if (token) {
      try {
        const res = await api("/api/auth/me");
        currentUser = res.user;
      } catch (_) {
        token = "";
        currentUser = null;
        localStorage.removeItem("ypi_bh_token");
      }
    }

    refreshTopbarUser();
    refreshRightMenu();
    renderPortal();

    // Close modal on backdrop click or Escape key
    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeModal();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    navigate,
    api,
    toast,
    openModal,
    closeModal,
    getUser,
    setSession,
    logout,
    togglePinMenu,
    closeRightMenuIfNotPinned,
    refreshRightMenu,
  };
})();
