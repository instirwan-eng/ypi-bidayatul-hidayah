/**
 * Question Bank, Teacher & Student Dashboards, and UTBK Exam Runner
 * for YPI BIDAYATUL HIDAYAH.
 */
window.ExamModule = (() => {
  const { escapeHtml, setMathHtml, renderAllIn } = window.MathHelper;

  let state = {
    view: "login", // login | guru | siswa | utbk | result
    guruTab: "overview", // overview | bank-soal | input-json | rekap-nilai | kelola-siswa | ubah-password
    siswaTab: "overview", // overview | ujian-list
    loginRole: "guru",
    exams: [],
    students: [],
    guruRecap: { attempts: [], access_list: [] },
    siswaRecap: [],
    filters: {
      guruChartStudentId: "",
      guruChartPelajaran: "",
      recapNama: "",
      recapKelas: "",
      recapPelajaran: "",
      recapMinNilai: "",
      recapMaxNilai: "",
      siswaChartPelajaran: "",
      siswaExamPelajaran: "",
      siswaExamKelas: "",
    },
    editingExamId: null,
    activeExam: null,
    utbk: {
      currentIndex: 0,
      answers: {}, // { nomor_urut: 'A' }
      flagged: {}, // { nomor_urut: true }
      remainingSec: 0,
      totalSec: 0,
      timerId: null,
    },
    lastResult: null,
    jsonDraft: "",
    jsonPreviewQuestions: [],
  };

  let guruChart = null;
  let siswaChart = null;

  const SUBJECT_OPTIONS = [
    "Matematika",
    "Bahasa Indonesia",
    "Bahasa Inggris",
    "Fisika",
    "Kimia",
    "Biologi",
    "Ekonomi",
    "Geografi",
    "Sosiologi",
    "Sejarah",
    "IPA",
    "IPS",
    "Pendidikan Agama Islam",
    "PKn",
  ];

  const AI_JSON_PROMPT = `Buatkan soal pilihan ganda format UTBK dalam format JSON murni (tanpa teks tambahan di luar JSON).
Aturan penting:
1. Semua rumus matematika wajib menggunakan format LaTeX yang rapi di dalam tanda $...$ (inline) atau $$...$$ (blok), jangan gunakan simbol aneh seperti ^ mentah di luar LaTeX atau karakter rusak.
2. Kembalikan array JSON dengan struktur persis seperti berikut:
[
  {
    "pertanyaan": "Jika $f(x) = 2x^2 - 4x + 5$, maka nilai minimum $f(x)$ adalah ...",
    "opsi_a": "$1$",
    "opsi_b": "$2$",
    "opsi_c": "$3$",
    "opsi_d": "$4$",
    "opsi_e": "$5$",
    "kunci_jawaban": "C",
    "pembahasan": "Nilai sumbu simetri $x_p = -\\\\frac{-4}{2(2)} = 1$. Maka $f(1) = 2(1)^2 - 4(1) + 5 = 3$."
  }
]
Jumlah soal: [ISI JUMLAH SOAL, misal 25]
Mata Pelajaran: [ISI PELAJARAN]
Jenjang Kelas: [ISI KELAS 1-12]
Topik / Materi: [ISI TOPIK]`;

  const SAMPLE_JSON = JSON.stringify(
    [
      {
        pertanyaan:
          "Diketahui persamaan kuadrat $x^2 - 5x + 6 = 0$ memiliki akar-akar $x_1$ dan $x_2$. Nilai dari $x_1^2 + x_2^2$ adalah ...",
        opsi_a: "$11$",
        opsi_b: "$12$",
        opsi_c: "$13$",
        opsi_d: "$15$",
        opsi_e: "$17$",
        kunci_jawaban: "C",
        pembahasan:
          "Dari rumus Vieta, $x_1 + x_2 = 5$ dan $x_1 \\cdot x_2 = 6$. Maka: $$x_1^2 + x_2^2 = (x_1 + x_2)^2 - 2x_1 x_2 = 5^2 - 2(6) = 25 - 12 = 13.$$",
      },
      {
        pertanyaan:
          "Jika $\\log_2(x - 1) = 3$, maka nilai $x$ yang memenuhi adalah ...",
        opsi_a: "$7$",
        opsi_b: "$8$",
        opsi_c: "$9$",
        opsi_d: "$10$",
        opsi_e: "$11$",
        kunci_jawaban: "C",
        pembahasan:
          "Ubah ke bentuk eksponen: $$x - 1 = 2^3 \\implies x - 1 = 8 \\implies x = 9.$$",
      },
    ],
    null,
    2
  );

  // -------------------------------------------------------------------------
  // Lifecycle & Navigation
  // -------------------------------------------------------------------------

  async function initAndRender(requestedSubTab = null) {
    stopTimer();
    const user = window.App.getUser();
    if (!user) {
      state.view = "login";
      render();
      return;
    }

    if (user.role === "guru") {
      state.view = "guru";
      if (requestedSubTab) state.guruTab = requestedSubTab;
      await loadGuruData();
    } else {
      state.view = "siswa";
      if (requestedSubTab) state.siswaTab = requestedSubTab;
      await loadSiswaData();
    }
    render();
  }

  function setGuruTab(tab) {
    stopTimer();
    state.view = "guru";
    state.guruTab = tab;
    render();
  }

  function setSiswaTab(tab) {
    stopTimer();
    state.view = "siswa";
    state.siswaTab = tab;
    render();
  }

  async function loadGuruData() {
    const [exams, students, recap] = await Promise.all([
      window.App.api("/api/exams"),
      window.App.api("/api/guru/students"),
      window.App.api("/api/guru/recap"),
    ]);
    state.exams = exams;
    state.students = students;
    state.guruRecap = recap;
  }

  async function loadSiswaData() {
    const [exams, recap] = await Promise.all([
      window.App.api("/api/exams"),
      window.App.api("/api/siswa/recap"),
    ]);
    state.exams = exams;
    state.siswaRecap = recap;
  }

  function stopTimer() {
    if (state.utbk.timerId) {
      clearInterval(state.utbk.timerId);
      state.utbk.timerId = null;
    }
  }

  function render() {
    const container = document.getElementById("main-content");
    if (!container) return;

    if (state.view === "login") {
      container.innerHTML = renderLogin();
      bindLoginEvents();
    } else if (state.view === "guru") {
      container.innerHTML = renderGuruDashboard();
      renderGuruDynamic();
    } else if (state.view === "siswa") {
      container.innerHTML = renderSiswaDashboard();
      renderSiswaDynamic();
    } else if (state.view === "utbk") {
      container.innerHTML = renderUtbkView();
      renderAllIn(container);
    } else if (state.view === "result") {
      container.innerHTML = renderResultView();
    }

    if (window.lucide) window.lucide.createIcons();
    window.App.refreshRightMenu();
  }

  // -------------------------------------------------------------------------
  // Login Page (Guru & Siswa)
  // -------------------------------------------------------------------------

  function renderLogin() {
    return `
      <div class="login-wrapper">
        <div class="login-card">
          <div class="login-brand">
            <div class="brand-badge"><i data-lucide="graduation-cap"></i></div>
            <div>
              <span class="eyebrow">YPI BIDAYATUL HIDAYAH</span>
              <h2>Portal Inventaris Soal & Ujian UTBK</h2>
            </div>
          </div>

          <div class="role-switch">
            <button type="button" class="role-btn ${state.loginRole === "guru" ? "active" : ""}" onclick="window.ExamModule.switchLoginRole('guru')">
              <i data-lucide="user-check"></i> Login Guru
            </button>
            <button type="button" class="role-btn ${state.loginRole === "siswa" ? "active" : ""}" onclick="window.ExamModule.switchLoginRole('siswa')">
              <i data-lucide="users"></i> Login Siswa
            </button>
          </div>

          <form id="exam-login-form" class="login-form">
            <div class="form-group">
              <label>Username / NIS / NIP</label>
              <input name="username" required autocomplete="username" placeholder="${
                state.loginRole === "guru" ? "Masukkan username guru (cth: guru)" : "Masukkan username siswa (cth: siswa1)"
              }" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" name="password" required autocomplete="current-password" placeholder="Masukkan password" />
            </div>
            <button type="submit" class="btn btn-primary btn-block">
              <i data-lucide="log-in"></i> Masuk sebagai ${state.loginRole === "guru" ? "Guru" : "Siswa"}
            </button>
          </form>

          <div class="demo-box">
            <strong>Akun Demo Siap Pakai:</strong>
            <div class="demo-grid">
              <button type="button" class="demo-chip" onclick="window.ExamModule.quickFillLogin('guru','guru','guru123')">
                <span>Guru</span><code>guru / guru123</code>
              </button>
              <button type="button" class="demo-chip" onclick="window.ExamModule.quickFillLogin('siswa','siswa1','siswa123')">
                <span>Siswa (Ahmad Kls 12)</span><code>siswa1 / siswa123</code>
              </button>
              <button type="button" class="demo-chip" onclick="window.ExamModule.quickFillLogin('siswa','siswa2','siswa123')">
                <span>Siswa (Siti Kls 12)</span><code>siswa2 / siswa123</code>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function switchLoginRole(role) {
    state.loginRole = role;
    render();
  }

  function quickFillLogin(role, username, password) {
    state.loginRole = role;
    render();
    const form = document.getElementById("exam-login-form");
    if (form) {
      form.username.value = username;
      form.password.value = password;
    }
  }

  function bindLoginEvents() {
    const form = document.getElementById("exam-login-form");
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        const res = await window.App.api("/api/auth/login", {
          method: "POST",
          body: {
            username: fd.get("username"),
            password: fd.get("password"),
            expected_role: state.loginRole,
          },
        });
        window.App.setSession(res.token, res.user);
        window.App.toast(`Selamat datang, ${res.user.full_name}!`);
        await initAndRender();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  // -------------------------------------------------------------------------
  // Guru Dashboard
  // -------------------------------------------------------------------------

  function renderGuruDashboard() {
    const user = window.App.getUser();
    const pendingRequests = state.guruRecap.access_list.filter((a) => a.retake_requested === 1).length;

    const tabs = [
      { id: "overview", label: "Grafik Perkembangan Siswa", icon: "trending-up" },
      { id: "bank-soal", label: "Bank Soal & Pembahasan", icon: "book-open-check" },
      { id: "input-json", label: state.editingExamId ? "Edit Soal (JSON)" : "Tambah Soal (Prompt JSON)", icon: "file-json" },
      {
        id: "rekap-nilai",
        label: `Rekap Nilai & Buka Akses${pendingRequests ? ` (${pendingRequests})` : ""}`,
        icon: "unlock",
      },
      { id: "kelola-siswa", label: "Akun Siswa", icon: "user-plus" },
      { id: "ubah-password", label: "Ubah Password", icon: "key-round" },
    ];

    let bodyHtml = "";
    if (state.guruTab === "overview") bodyHtml = renderGuruOverview();
    else if (state.guruTab === "bank-soal") bodyHtml = renderGuruBankSoal();
    else if (state.guruTab === "input-json") bodyHtml = renderGuruJsonInput();
    else if (state.guruTab === "rekap-nilai") bodyHtml = renderGuruRekap();
    else if (state.guruTab === "kelola-siswa") bodyHtml = renderGuruStudents();
    else if (state.guruTab === "ubah-password") bodyHtml = renderChangePassword();

    return `
      <div class="dashboard-header">
        <div>
          <span class="eyebrow">PORTAL GURU • YPI BIDAYATUL HIDAYAH</span>
          <h1>Dashboard Inventaris Soal & Ujian</h1>
          <p class="subtitle">Masuk sebagai <strong>${escapeHtml(user.full_name)}</strong> (${escapeHtml(user.username)})</p>
        </div>
        <div class="header-actions no-print">
          <button class="btn btn-outline" onclick="window.App.navigate('inventory')">
            <i data-lucide="boxes"></i> Ke Inventaris Sekolah
          </button>
          <button class="btn btn-danger btn-sm" onclick="window.App.logout()">
            <i data-lucide="log-out"></i> Keluar
          </button>
        </div>
      </div>

      <div class="pill-tabs no-print">
        ${tabs
          .map(
            (t) => `
          <button class="pill-tab ${state.guruTab === t.id ? "active" : ""}" onclick="window.ExamModule.setGuruTab('${t.id}')">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
          </button>`
          )
          .join("")}
      </div>

      <div class="dashboard-body">${bodyHtml}</div>
    `;
  }

  function getAllSubjects() {
    const fromExams = state.exams.map((e) => e.pelajaran);
    return Array.from(new Set([...SUBJECT_OPTIONS, ...fromExams])).sort();
  }

  function renderGuruOverview() {
    const attempts = state.guruRecap.attempts;
    const avgAll = attempts.length
      ? (attempts.reduce((s, a) => s + a.nilai, 0) / attempts.length).toFixed(1)
      : "0";
    const pendingReq = state.guruRecap.access_list.filter((a) => a.retake_requested === 1).length;

    // Filter chart data
    const filteredChartAttempts = attempts.filter((a) => {
      const mS =
        !state.filters.guruChartStudentId ||
        String(a.student_id) === String(state.filters.guruChartStudentId);
      const mP =
        !state.filters.guruChartPelajaran ||
        a.pelajaran.toLowerCase() === state.filters.guruChartPelajaran.toLowerCase();
      return mS && mP;
    });

    return `
      <div class="kpi-grid">
        <div class="kpi-card kpi-emerald">
          <div class="kpi-icon"><i data-lucide="file-text"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Total Paket Soal UTBK</span>
            <strong class="kpi-value">${state.exams.length} Paket</strong>
            <span class="kpi-sub">Jenjang Kelas 1 – 12</span>
          </div>
        </div>
        <div class="kpi-card kpi-blue">
          <div class="kpi-icon"><i data-lucide="users"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Total Akun Siswa</span>
            <strong class="kpi-value">${state.students.length} Siswa</strong>
            <span class="kpi-sub">${attempts.length} total pengerjaan tercatat</span>
          </div>
        </div>
        <div class="kpi-card kpi-amber">
          <div class="kpi-icon"><i data-lucide="award"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Rata-Rata Nilai Seluruhnya</span>
            <strong class="kpi-value">${avgAll}</strong>
            <span class="kpi-sub">Skala maksimal 100</span>
          </div>
        </div>
        <div class="kpi-card kpi-teal" onclick="window.ExamModule.setGuruTab('rekap-nilai')" style="cursor:pointer">
          <div class="kpi-icon"><i data-lucide="bell-ring"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Permintaan Buka Akses</span>
            <strong class="kpi-value">${pendingReq} Siswa</strong>
            <span class="kpi-sub">Klik untuk kelola akses ujian</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header-wrap">
          <div>
            <h3><i data-lucide="trending-up"></i> Grafik Perkembangan Nilai Siswa Seluruhnya</h3>
            <p class="muted">Filter berdasarkan Nama Siswa dan Pelajaran untuk memantau perkembangan nilai masing-masing.</p>
          </div>
          <div class="filter-inline">
            <select class="select-sm" onchange="window.ExamModule.updateFilter('guruChartStudentId', this.value)">
              <option value="">Semua Siswa (${state.students.length})</option>
              ${state.students
                .map(
                  (s) =>
                    `<option value="${s.id}" ${
                      String(state.filters.guruChartStudentId) === String(s.id) ? "selected" : ""
                    }>${escapeHtml(s.full_name)} (Kls ${s.kelas})</option>`
                )
                .join("")}
            </select>
            <select class="select-sm" onchange="window.ExamModule.updateFilter('guruChartPelajaran', this.value)">
              <option value="">Semua Pelajaran</option>
              ${getAllSubjects()
                .map(
                  (p) =>
                    `<option value="${escapeHtml(p)}" ${
                      state.filters.guruChartPelajaran === p ? "selected" : ""
                    }>${escapeHtml(p)}</option>`
                )
                .join("")}
            </select>
          </div>
        </div>
        <div class="chart-wrapper chart-tall">
          <canvas id="guruProgressChart"></canvas>
        </div>

        <div class="table-responsive" style="margin-top: 1rem;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nama Siswa</th>
                <th>Kelas</th>
                <th>Pelajaran</th>
                <th>Paket Soal</th>
                <th class="num">Benar / Total</th>
                <th class="num">Nilai</th>
                <th>Tanggal</th>
              </tr>
            </thead>
            <tbody>
              ${
                filteredChartAttempts.length
                  ? [...filteredChartAttempts]
                      .reverse()
                      .map(
                        (a) => `
                  <tr>
                    <td><strong>${escapeHtml(a.student_name)}</strong></td>
                    <td>Kelas ${a.student_kelas}</td>
                    <td><span class="tag">${escapeHtml(a.pelajaran)}</span></td>
                    <td>${escapeHtml(a.exam_judul)}</td>
                    <td class="num">${a.benar} / ${a.total_soal}</td>
                    <td class="num"><strong class="score-pill ${a.nilai >= 75 ? "score-good" : "score-mid"}">${a.nilai}</strong></td>
                    <td>${escapeHtml(a.submitted_at)}</td>
                  </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="7" class="empty-cell">Belum ada data nilai untuk filter yang dipilih.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderGuruBankSoal() {
    return `
      <div class="card">
        <div class="toolbar">
          <div>
            <h3><i data-lucide="book-open-check"></i> Bank Soal UTBK & Pembahasan (Khusus Guru)</h3>
            <p class="muted">Pembahasan soal bersifat rahasia dan hanya dapat dilihat oleh Guru.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.ExamModule.startNewJsonExam()">
            <i data-lucide="plus"></i> Tambah Soal via Prompt JSON
          </button>
        </div>

        <div class="exam-grid">
          ${
            state.exams.length
              ? state.exams
                  .map((e) => {
                    const poin = e.total_soal > 0 ? (100 / e.total_soal).toFixed(2).replace(/\.00$/, "") : 0;
                    return `
              <div class="exam-card">
                <div class="exam-card-top">
                  <span class="tag">${escapeHtml(e.pelajaran)}</span>
                  <span class="tag tag-amber">Kelas ${e.kelas}</span>
                </div>
                <h4>${escapeHtml(e.judul)}</h4>
                <div class="exam-meta">
                  <span><i data-lucide="list-checks"></i> ${e.total_soal} Soal (${poin} poin/soal)</span>
                  <span><i data-lucide="clock"></i> ${e.durasi_menit} Menit</span>
                  <span><i data-lucide="users"></i> ${e.attempt_count}x Dikerjakan</span>
                </div>
                <div class="exam-card-actions">
                  <button class="btn btn-primary btn-sm" onclick="window.ExamModule.viewExamPembahasan(${e.id})">
                    <i data-lucide="eye"></i> Soal & Pembahasan
                  </button>
                  <button class="btn btn-outline btn-sm" onclick="window.ExamModule.editExamJson(${e.id})">
                    <i data-lucide="pencil"></i> Edit
                  </button>
                  <button class="btn btn-danger btn-sm" onclick="window.ExamModule.deleteExam(${e.id}, '${escapeHtml(e.judul)}')">
                    <i data-lucide="trash-2"></i>
                  </button>
                </div>
              </div>`;
                  })
                  .join("")
              : `<div class="empty-cell">Belum ada paket soal. Silakan tambahkan menggunakan Prompt JSON.</div>`
          }
        </div>
      </div>
    `;
  }

  async function viewExamPembahasan(examId) {
    try {
      const detail = await window.App.api(`/api/exams/${examId}`);
      const poin = detail.questions.length ? (100 / detail.questions.length).toFixed(2).replace(/\.00$/, "") : 0;
      const html = `
        <div class="pembahasan-header-info">
          <span class="tag">${escapeHtml(detail.pelajaran)}</span>
          <span class="tag tag-amber">Kelas ${detail.kelas}</span>
          <span class="tag">${detail.durasi_menit} Menit</span>
          <span class="tag">${detail.questions.length} Soal (${poin} poin/soal, Maks 100)</span>
        </div>
        <div class="pembahasan-list" id="guru-pembahasan-container">
          ${detail.questions
            .map(
              (q) => `
            <div class="pembahasan-item">
              <div class="pembahasan-q-num">Soal Nomor ${q.nomor_urut} <span class="badge badge-success">Kunci: ${escapeHtml(q.kunci_jawaban)}</span></div>
              <div class="math-content q-text" data-math-raw="${escapeHtml(q.pertanyaan)}"></div>
              <div class="options-preview">
                <div><strong>A.</strong> <span data-math-raw="${escapeHtml(q.opsi_a)}"></span></div>
                <div><strong>B.</strong> <span data-math-raw="${escapeHtml(q.opsi_b)}"></span></div>
                <div><strong>C.</strong> <span data-math-raw="${escapeHtml(q.opsi_c)}"></span></div>
                <div><strong>D.</strong> <span data-math-raw="${escapeHtml(q.opsi_d)}"></span></div>
                ${q.opsi_e ? `<div><strong>E.</strong> <span data-math-raw="${escapeHtml(q.opsi_e)}"></span></div>` : ""}
              </div>
              <div class="pembahasan-box">
                <div class="pembahasan-label"><i data-lucide="lightbulb"></i> Pembahasan Guru:</div>
                <div class="math-content" data-math-raw="${escapeHtml(q.pembahasan || "Belum ada pembahasan.")}"></div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
      window.App.openModal(`Pembahasan Soal: ${detail.judul}`, html, "modal-lg");
      const container = document.getElementById("guru-pembahasan-container");
      renderAllIn(container);
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  function startNewJsonExam() {
    state.editingExamId = null;
    state.jsonDraft = SAMPLE_JSON;
    state.jsonPreviewQuestions = [];
    setGuruTab("input-json");
  }

  async function editExamJson(examId) {
    try {
      const detail = await window.App.api(`/api/exams/${examId}`);
      state.editingExamId = examId;
      const mapped = detail.questions.map((q) => ({
        pertanyaan: q.pertanyaan,
        opsi_a: q.opsi_a,
        opsi_b: q.opsi_b,
        opsi_c: q.opsi_c,
        opsi_d: q.opsi_d,
        opsi_e: q.opsi_e,
        kunci_jawaban: q.kunci_jawaban,
        pembahasan: q.pembahasan,
      }));
      state.jsonDraft = JSON.stringify(mapped, null, 2);
      state.jsonPreviewQuestions = mapped;
      state.guruTab = "input-json";
      render();
      const form = document.getElementById("exam-json-form");
      if (form) {
        form.judul.value = detail.judul;
        form.pelajaran.value = detail.pelajaran;
        form.kelas.value = String(detail.kelas);
        form.durasi_menit.value = String(detail.durasi_menit);
      }
      previewJsonQuestions();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  function renderGuruJsonInput() {
    const draft = state.jsonDraft || SAMPLE_JSON;
    return `
      <div class="grid-2-asym">
        <div class="card">
          <div class="card-header">
            <h3><i data-lucide="file-json"></i> ${state.editingExamId ? "Edit Paket Soal" : "Input Soal Menggunakan Prompt JSON"}</h3>
          </div>

          <div class="prompt-helper-box">
            <div class="prompt-helper-head">
              <strong><i data-lucide="sparkles"></i> Prompt AI Siap Pakai (ChatGPT / Gemini)</strong>
              <button type="button" class="btn btn-amber btn-sm" onclick="window.ExamModule.copyAiPrompt()">
                <i data-lucide="copy"></i> Salin Prompt JSON
              </button>
            </div>
            <p class="muted">Salin prompt ini ke AI agar menghasilkan JSON soal dengan format LaTeX matematika yang rapi & pembahasan lengkap.</p>
          </div>

          <form id="exam-json-form" class="form-grid" style="margin-top:1rem;">
            <div class="form-group col-span-2">
              <label>Judul Paket Soal *</label>
              <input name="judul" required placeholder="Contoh: Tryout UTBK Matematika Wajib Bab Matriks" />
            </div>
            <div class="form-group">
              <label>Pelajaran *</label>
              <input name="pelajaran" list="subject-datalist" required placeholder="Pilih atau ketik pelajaran..." value="Matematika" />
              <datalist id="subject-datalist">
                ${SUBJECT_OPTIONS.map((s) => `<option value="${escapeHtml(s)}"></option>`).join("")}
              </datalist>
            </div>
            <div class="form-group">
              <label>Tingkat Kelas (1–12) *</label>
              <select name="kelas" required>
                ${Array.from({ length: 12 }, (_, i) => i + 1)
                  .map((k) => `<option value="${k}" ${k === 12 ? "selected" : ""}>Kelas ${k}</option>`)
                  .join("")}
              </select>
            </div>
            <div class="form-group">
              <label>Waktu Pengerjaan (Menit) *</label>
              <input type="number" name="durasi_menit" min="1" max="300" required value="45" />
            </div>
            <div class="form-group" style="justify-content: flex-end; display:flex; flex-direction:column;">
              <label>Impor File .json</label>
              <input type="file" accept=".json,application/json" onchange="window.ExamModule.loadJsonFile(event)" />
            </div>

            <div class="form-group col-span-2">
              <div class="json-label-row">
                <label>Data Soal JSON *</label>
                <div class="json-mini-actions">
                  <button type="button" class="btn btn-ghost btn-sm" onclick="window.ExamModule.fillSampleJson()">Isi Contoh JSON</button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="window.ExamModule.previewJsonQuestions()">
                    <i data-lucide="eye"></i> Preview Tampilan Soal & Matematika
                  </button>
                </div>
              </div>
              <textarea id="json-questions-textarea" name="questions_json" rows="13" class="code-textarea" required>${escapeHtml(draft)}</textarea>
            </div>

            <div class="modal-actions col-span-2">
              ${
                state.editingExamId
                  ? `<button type="button" class="btn btn-outline" onclick="window.ExamModule.startNewJsonExam()">Batal Edit</button>`
                  : ""
              }
              <button type="submit" class="btn btn-primary">
                <i data-lucide="save"></i> ${state.editingExamId ? "Perbarui Paket Soal" : "Simpan Paket Soal"}
              </button>
            </div>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <h3><i data-lucide="calculator"></i> Preview Tampilan Rapi (Matematika & Pembahasan)</h3>
          </div>
          <div id="json-preview-container" class="preview-scroll">
            <div class="empty-note">Klik <strong>"Preview Tampilan Soal & Matematika"</strong> untuk memeriksa kerapian rumus matematika sebelum disimpan.</div>
          </div>
        </div>
      </div>
    `;
  }

  function copyAiPrompt() {
    navigator.clipboard.writeText(AI_JSON_PROMPT).then(
      () => window.App.toast("Prompt JSON AI berhasil disalin ke clipboard!"),
      () => {
        window.App.openModal(
          "Salin Prompt JSON AI",
          `<textarea rows="14" class="code-textarea" readonly>${escapeHtml(AI_JSON_PROMPT)}</textarea>`
        );
      }
    );
  }

  function fillSampleJson() {
    const ta = document.getElementById("json-questions-textarea");
    if (ta) {
      ta.value = SAMPLE_JSON;
      previewJsonQuestions();
    }
  }

  function loadJsonFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ta = document.getElementById("json-questions-textarea");
      if (ta) {
        ta.value = String(reader.result || "");
        previewJsonQuestions();
      }
    };
    reader.readAsText(file);
  }

  function parseJsonInput(rawText) {
    let cleaned = rawText.trim();
    // Strip markdown fences if user pasted ```json ... ```
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : parsed.questions || parsed.soal;
    if (!Array.isArray(arr) || !arr.length) {
      throw new Error("JSON harus berupa array soal [...].");
    }
    return arr.map((q, idx) => {
      if (!q.pertanyaan || !q.opsi_a || !q.opsi_b || !q.opsi_c || !q.opsi_d || !q.kunci_jawaban) {
        throw new Error(`Soal ke-${idx + 1} wajib memiliki pertanyaan, opsi_a..opsi_d, dan kunci_jawaban.`);
      }
      return {
        pertanyaan: String(q.pertanyaan),
        opsi_a: String(q.opsi_a),
        opsi_b: String(q.opsi_b),
        opsi_c: String(q.opsi_c),
        opsi_d: String(q.opsi_d),
        opsi_e: q.opsi_e ? String(q.opsi_e) : "",
        kunci_jawaban: String(q.kunci_jawaban).trim().toUpperCase(),
        pembahasan: q.pembahasan ? String(q.pembahasan) : "",
      };
    });
  }

  function previewJsonQuestions() {
    const ta = document.getElementById("json-questions-textarea");
    const box = document.getElementById("json-preview-container");
    if (!ta || !box) return;
    try {
      const questions = parseJsonInput(ta.value);
      const poin = (100 / questions.length).toFixed(2).replace(/\.00$/, "");
      box.innerHTML = `
        <div class="preview-summary">Total <strong>${questions.length} soal</strong> • Bobot per soal: <strong>${poin} poin</strong> (Maks 100)</div>
        ${questions
          .map(
            (q, i) => `
          <div class="pembahasan-item">
            <div class="pembahasan-q-num">No. ${i + 1} <span class="badge badge-success">Kunci: ${escapeHtml(q.kunci_jawaban)}</span></div>
            <div class="math-content" data-math-raw="${escapeHtml(q.pertanyaan)}"></div>
            <div class="options-preview">
              <div><strong>A.</strong> <span data-math-raw="${escapeHtml(q.opsi_a)}"></span></div>
              <div><strong>B.</strong> <span data-math-raw="${escapeHtml(q.opsi_b)}"></span></div>
              <div><strong>C.</strong> <span data-math-raw="${escapeHtml(q.opsi_c)}"></span></div>
              <div><strong>D.</strong> <span data-math-raw="${escapeHtml(q.opsi_d)}"></span></div>
              ${q.opsi_e ? `<div><strong>E.</strong> <span data-math-raw="${escapeHtml(q.opsi_e)}"></span></div>` : ""}
            </div>
            <div class="pembahasan-box">
              <div class="pembahasan-label">Pembahasan:</div>
              <div class="math-content" data-math-raw="${escapeHtml(q.pembahasan || "-")}"></div>
            </div>
          </div>`
          )
          .join("")}
      `;
      renderAllIn(box);
    } catch (err) {
      box.innerHTML = `<div class="error-box">JSON belum valid: ${escapeHtml(err.message)}</div>`;
    }
  }

  function bindJsonForm() {
    const form = document.getElementById("exam-json-form");
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      let questions;
      try {
        questions = parseJsonInput(String(fd.get("questions_json") || ""));
      } catch (err) {
        window.App.toast(`Format JSON salah: ${err.message}`, "error");
        return;
      }

      const payload = {
        judul: String(fd.get("judul")),
        pelajaran: String(fd.get("pelajaran")),
        kelas: Number(fd.get("kelas")),
        durasi_menit: Number(fd.get("durasi_menit")),
        questions,
      };

      try {
        if (state.editingExamId) {
          await window.App.api(`/api/exams/${state.editingExamId}`, { method: "PUT", body: payload });
          window.App.toast("Paket soal berhasil diperbarui.");
        } else {
          await window.App.api("/api/exams", { method: "POST", body: payload });
          window.App.toast("Paket soal baru berhasil ditambahkan.");
        }
        state.editingExamId = null;
        await loadGuruData();
        setGuruTab("bank-soal");
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  async function deleteExam(examId, title) {
    if (!confirm(`Hapus paket soal "${title}" beserta seluruh riwayat pengerjaannya?`)) return;
    try {
      await window.App.api(`/api/exams/${examId}`, { method: "DELETE" });
      window.App.toast("Paket soal berhasil dihapus.");
      await loadGuruData();
      render();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  // -------------------------------------------------------------------------
  // Guru: Rekapitulasi Nilai & Buka Akses Siswa
  // -------------------------------------------------------------------------

  function renderGuruRekap() {
    const filteredAttempts = state.guruRecap.attempts.filter((a) => {
      const mN =
        !state.filters.recapNama ||
        a.student_name.toLowerCase().includes(state.filters.recapNama.toLowerCase());
      const mK =
        !state.filters.recapKelas || String(a.student_kelas) === String(state.filters.recapKelas);
      const mP =
        !state.filters.recapPelajaran ||
        a.pelajaran.toLowerCase() === state.filters.recapPelajaran.toLowerCase();
      const minV = state.filters.recapMinNilai !== "" ? Number(state.filters.recapMinNilai) : null;
      const maxV = state.filters.recapMaxNilai !== "" ? Number(state.filters.recapMaxNilai) : null;
      const mMin = minV === null || a.nilai >= minV;
      const mMax = maxV === null || a.nilai <= maxV;
      return mN && mK && mP && mMin && mMax;
    });

    const lockedOrRequested = state.guruRecap.access_list.filter((x) => x.is_locked === 1);

    return `
      <div class="card" style="margin-bottom:1.25rem;">
        <div class="card-header">
          <h3><i data-lucide="unlock"></i> Kelola Kunci & Buka Akses Soal Siswa (${lockedOrRequested.length} Terkunci)</h3>
        </div>
        <p class="muted" style="margin-bottom:0.75rem;">Siswa hanya dapat mengerjakan soal 1 kali sebelum terkunci otomatis. Klik <strong>Buka Akses</strong> untuk mengizinkan siswa mengerjakan ulang.</p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nama Siswa</th>
                <th>Kelas</th>
                <th>Pelajaran & Paket Soal</th>
                <th>Status</th>
                <th>Catatan Siswa</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${
                lockedOrRequested.length
                  ? lockedOrRequested
                      .map(
                        (x) => `
                  <tr>
                    <td><strong>${escapeHtml(x.student_name)}</strong> <small class="muted">(${escapeHtml(x.username)})</small></td>
                    <td>Kelas ${x.student_kelas}</td>
                    <td><strong>${escapeHtml(x.exam_judul)}</strong><br><small class="muted">${escapeHtml(x.pelajaran)} • Kls ${x.exam_kelas}</small></td>
                    <td>
                      ${
                        x.retake_requested
                          ? `<span class="badge badge-warning">Minta Buka Akses</span>`
                          : `<span class="badge badge-danger">Terkunci</span>`
                      }
                    </td>
                    <td>${escapeHtml(x.request_note || "-")}</td>
                    <td>
                      <button class="btn btn-primary btn-sm" onclick="window.ExamModule.unlockStudentAccess(${x.exam_id}, ${x.student_id})">
                        <i data-lucide="unlock"></i> Buka Akses
                      </button>
                    </td>
                  </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="6" class="empty-cell">Tidak ada ujian siswa yang terkunci saat ini.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card print-area">
        <div class="toolbar no-print">
          <div class="toolbar-left">
            <div class="search-box">
              <i data-lucide="search"></i>
              <input type="text" placeholder="Filter Nama Siswa..." value="${escapeHtml(state.filters.recapNama)}"
                oninput="window.ExamModule.updateFilter('recapNama', this.value)" />
            </div>
            <select class="select-sm" onchange="window.ExamModule.updateFilter('recapKelas', this.value)">
              <option value="">Semua Kelas (1–12)</option>
              ${Array.from({ length: 12 }, (_, i) => i + 1)
                .map((k) => `<option value="${k}" ${String(state.filters.recapKelas) === String(k) ? "selected" : ""}>Kelas ${k}</option>`)
                .join("")}
            </select>
            <select class="select-sm" onchange="window.ExamModule.updateFilter('recapPelajaran', this.value)">
              <option value="">Semua Pelajaran</option>
              ${getAllSubjects()
                .map((p) => `<option value="${escapeHtml(p)}" ${state.filters.recapPelajaran === p ? "selected" : ""}>${escapeHtml(p)}</option>`)
                .join("")}
            </select>
            <input type="number" class="input-sm input-xs" placeholder="Nilai Min" min="0" max="100" value="${escapeHtml(state.filters.recapMinNilai)}"
              oninput="window.ExamModule.updateFilter('recapMinNilai', this.value)" />
            <input type="number" class="input-sm input-xs" placeholder="Nilai Maks" min="0" max="100" value="${escapeHtml(state.filters.recapMaxNilai)}"
              oninput="window.ExamModule.updateFilter('recapMaxNilai', this.value)" />
          </div>
          <div class="toolbar-right">
            <button class="btn btn-outline btn-sm" onclick="window.ExamModule.exportRecapExcel()">
              <i data-lucide="download"></i> Export Excel
            </button>
            <button class="btn btn-amber btn-sm" onclick="window.print()">
              <i data-lucide="printer"></i> Cetak Rekap Nilai
            </button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Siswa</th>
                <th>Kelas</th>
                <th>Pelajaran</th>
                <th>Paket Soal</th>
                <th class="num">Benar / Total</th>
                <th class="num">Nilai (0-100)</th>
                <th>Waktu Submit</th>
                <th>Status Akses</th>
              </tr>
            </thead>
            <tbody>
              ${
                filteredAttempts.length
                  ? [...filteredAttempts]
                      .reverse()
                      .map(
                        (a, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${escapeHtml(a.student_name)}</strong></td>
                    <td>Kelas ${a.student_kelas}</td>
                    <td><span class="tag">${escapeHtml(a.pelajaran)}</span></td>
                    <td>${escapeHtml(a.exam_judul)}</td>
                    <td class="num">${a.benar} / ${a.total_soal}</td>
                    <td class="num"><strong class="score-pill ${a.nilai >= 75 ? "score-good" : "score-mid"}">${a.nilai}</strong></td>
                    <td>${escapeHtml(a.submitted_at)}</td>
                    <td>
                      ${
                        a.is_locked
                          ? `<button class="btn btn-outline btn-xs" onclick="window.ExamModule.unlockStudentAccess(${a.exam_id}, ${a.student_id})"><i data-lucide="unlock"></i> Buka Akses</button>`
                          : `<span class="badge badge-success">Terbuka</span>`
                      }
                    </td>
                  </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="9" class="empty-cell">Belum ada data nilai sesuai filter.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function unlockStudentAccess(examId, studentId) {
    try {
      const res = await window.App.api("/api/guru/unlock-access", {
        method: "POST",
        body: { exam_id: examId, student_id: studentId },
      });
      window.App.toast(res.message);
      await loadGuruData();
      render();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  function exportRecapExcel() {
    window.ExcelHelper.exportRows(
      state.guruRecap.attempts,
      [
        { key: "student_name", label: "Nama Siswa" },
        { key: "student_kelas", label: "Kelas" },
        { key: "pelajaran", label: "Pelajaran" },
        { key: "exam_judul", label: "Paket Soal" },
        { key: "benar", label: "Benar" },
        { key: "total_soal", label: "Total Soal" },
        { key: "nilai", label: "Nilai" },
        { key: "submitted_at", label: "Waktu Submit" },
      ],
      "Rekapitulasi Nilai",
      "Rekap_Nilai_Siswa_YPI_BH.xlsx"
    );
  }

  // -------------------------------------------------------------------------
  // Guru: Manajemen Akun Siswa & Ubah Password
  // -------------------------------------------------------------------------

  function renderGuruStudents() {
    return `
      <div class="grid-2-asym">
        <div class="card">
          <div class="card-header">
            <h3><i data-lucide="user-plus"></i> Tambahkan Akun Siswa Baru</h3>
          </div>
          <form id="add-student-form" class="form-grid">
            <div class="form-group col-span-2">
              <label>Nama Lengkap Siswa *</label>
              <input name="full_name" required placeholder="Contoh: Fatimah Azzahra" />
            </div>
            <div class="form-group">
              <label>Username / NIS *</label>
              <input name="username" required minlength="2" placeholder="Contoh: siswa4" />
            </div>
            <div class="form-group">
              <label>Kelas (1–12) *</label>
              <select name="kelas" required>
                ${Array.from({ length: 12 }, (_, i) => i + 1)
                  .map((k) => `<option value="${k}" ${k === 12 ? "selected" : ""}>Kelas ${k}</option>`)
                  .join("")}
              </select>
            </div>
            <div class="form-group col-span-2">
              <label>Password Awal *</label>
              <input type="text" name="password" required minlength="4" value="siswa123" />
            </div>
            <div class="modal-actions col-span-2">
              <button type="submit" class="btn btn-primary btn-block">
                <i data-lucide="plus"></i> Daftarkan Akun Siswa
              </button>
            </div>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <h3><i data-lucide="users"></i> Daftar Akun Siswa (${state.students.length})</h3>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Lengkap</th>
                  <th>Username</th>
                  <th>Kelas</th>
                  <th>Dibuat</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${
                  state.students.length
                    ? state.students
                        .map(
                          (s, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${escapeHtml(s.full_name)}</strong></td>
                    <td><code>${escapeHtml(s.username)}</code></td>
                    <td><span class="tag tag-amber">Kelas ${s.kelas}</span></td>
                    <td>${escapeHtml(s.created_at)}</td>
                    <td>
                      <button class="icon-btn text-red" title="Hapus Akun Siswa" onclick="window.ExamModule.deleteStudent(${s.id}, '${escapeHtml(s.full_name)}')">
                        <i data-lucide="trash-2"></i>
                      </button>
                    </td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="6" class="empty-cell">Belum ada akun siswa.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function bindAddStudentForm() {
    const form = document.getElementById("add-student-form");
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await window.App.api("/api/guru/students", {
          method: "POST",
          body: {
            full_name: fd.get("full_name"),
            username: fd.get("username"),
            kelas: Number(fd.get("kelas")),
            password: fd.get("password"),
          },
        });
        window.App.toast("Akun siswa berhasil ditambahkan.");
        await loadGuruData();
        render();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  async function deleteStudent(id, name) {
    if (!confirm(`Hapus akun siswa "${name}" beserta riwayat nilainya?`)) return;
    try {
      await window.App.api(`/api/guru/students/${id}`, { method: "DELETE" });
      window.App.toast("Akun siswa dihapus.");
      await loadGuruData();
      render();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  function renderChangePassword() {
    return `
      <div class="card" style="max-width:520px;">
        <div class="card-header">
          <h3><i data-lucide="key-round"></i> Ubah Password Akun Guru</h3>
        </div>
        <form id="change-password-form" class="form-grid">
          <div class="form-group col-span-2">
            <label>Password Lama *</label>
            <input type="password" name="old_password" required />
          </div>
          <div class="form-group col-span-2">
            <label>Password Baru (min. 4 karakter) *</label>
            <input type="password" name="new_password" required minlength="4" />
          </div>
          <div class="form-group col-span-2">
            <label>Konfirmasi Password Baru *</label>
            <input type="password" name="confirm_password" required minlength="4" />
          </div>
          <div class="modal-actions col-span-2">
            <button type="submit" class="btn btn-primary">Simpan Password Baru</button>
          </div>
        </form>
      </div>
    `;
  }

  function bindChangePasswordForm() {
    const form = document.getElementById("change-password-form");
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      if (fd.get("new_password") !== fd.get("confirm_password")) {
        window.App.toast("Konfirmasi password baru tidak cocok.", "error");
        return;
      }
      try {
        const res = await window.App.api("/api/auth/change-password", {
          method: "POST",
          body: {
            old_password: fd.get("old_password"),
            new_password: fd.get("new_password"),
          },
        });
        window.App.toast(res.message);
        form.reset();
      } catch (err) {
        window.App.toast(err.message, "error");
      }
    };
  }

  function renderGuruDynamic() {
    if (state.guruTab === "overview") renderGuruChart();
    else if (state.guruTab === "input-json") {
      bindJsonForm();
      previewJsonQuestions();
    } else if (state.guruTab === "kelola-siswa") {
      bindAddStudentForm();
    } else if (state.guruTab === "ubah-password") {
      bindChangePasswordForm();
    }
  }

  function renderGuruChart() {
    const ctx = document.getElementById("guruProgressChart");
    if (!ctx || typeof window.Chart === "undefined") return;
    if (guruChart) guruChart.destroy();

    const filtered = state.guruRecap.attempts.filter((a) => {
      const mS =
        !state.filters.guruChartStudentId ||
        String(a.student_id) === String(state.filters.guruChartStudentId);
      const mP =
        !state.filters.guruChartPelajaran ||
        a.pelajaran.toLowerCase() === state.filters.guruChartPelajaran.toLowerCase();
      return mS && mP;
    });

    // Group by student so each student gets a distinct series when viewing all
    const byStudent = {};
    filtered.forEach((a) => {
      if (!byStudent[a.student_name]) byStudent[a.student_name] = [];
      byStudent[a.student_name].push(a);
    });

    const palette = ["#059669", "#d97706", "#2563eb", "#9333ea", "#e11d48", "#0d9488"];
    const labels = filtered.map(
      (a, idx) => `#${idx + 1} ${a.student_name.split(" ")[0]} (${a.pelajaran.slice(0, 10)})`
    );

    const datasets = Object.keys(byStudent).map((studentName, idx) => {
      const color = palette[idx % palette.length];
      return {
        label: studentName,
        data: filtered.map((a) => (a.student_name === studentName ? a.nilai : null)),
        borderColor: color,
        backgroundColor: color + "33",
        spanGaps: true,
        tension: 0.3,
        pointRadius: 5,
        borderWidth: 2.5,
      };
    });

    guruChart = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: labels.length ? labels : ["Belum ada data"],
        datasets: datasets.length
          ? datasets
          : [{ label: "Nilai", data: [0], borderColor: "#059669" }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100 } },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Siswa Dashboard
  // -------------------------------------------------------------------------

  function renderSiswaDashboard() {
    const user = window.App.getUser();
    const tabs = [
      { id: "overview", label: "Rekap Nilai & Grafik Perkembangan", icon: "trending-up" },
      { id: "ujian-list", label: "Pilih Materi & Kerjakan Ujian UTBK", icon: "pen-tool" },
    ];

    const bodyHtml =
      state.siswaTab === "overview" ? renderSiswaOverview() : renderSiswaExamsList();

    return `
      <div class="dashboard-header">
        <div>
          <span class="eyebrow">PORTAL SISWA • YPI BIDAYATUL HIDAYAH</span>
          <h1>Dashboard Ujian & Perkembangan Belajar</h1>
          <p class="subtitle">Siswa: <strong>${escapeHtml(user.full_name)}</strong> • Kelas ${user.kelas}</p>
        </div>
        <div class="header-actions no-print">
          <button class="btn btn-outline" onclick="window.App.navigate('inventory')">
            <i data-lucide="boxes"></i> Ke Inventaris Sekolah
          </button>
          <button class="btn btn-danger btn-sm" onclick="window.App.logout()">
            <i data-lucide="log-out"></i> Keluar
          </button>
        </div>
      </div>

      <div class="pill-tabs no-print">
        ${tabs
          .map(
            (t) => `
          <button class="pill-tab ${state.siswaTab === t.id ? "active" : ""}" onclick="window.ExamModule.setSiswaTab('${t.id}')">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
          </button>`
          )
          .join("")}
      </div>

      <div class="dashboard-body">${bodyHtml}</div>
    `;
  }

  function renderSiswaOverview() {
    const filtered = state.siswaRecap.filter(
      (a) =>
        !state.filters.siswaChartPelajaran ||
        a.pelajaran.toLowerCase() === state.filters.siswaChartPelajaran.toLowerCase()
    );
    const avg = filtered.length
      ? (filtered.reduce((s, a) => s + a.nilai, 0) / filtered.length).toFixed(1)
      : "0";
    const best = filtered.length ? Math.max(...filtered.map((a) => a.nilai)) : 0;
    const availableCount = state.exams.filter((e) => !e.is_locked).length;

    return `
      <div class="kpi-grid">
        <div class="kpi-card kpi-emerald">
          <div class="kpi-icon"><i data-lucide="check-circle-2"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Ujian Diselesaikan</span>
            <strong class="kpi-value">${filtered.length} Kali</strong>
            <span class="kpi-sub">Filter: ${escapeHtml(state.filters.siswaChartPelajaran || "Semua Pelajaran")}</span>
          </div>
        </div>
        <div class="kpi-card kpi-amber">
          <div class="kpi-icon"><i data-lucide="trending-up"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Rata-Rata Nilai</span>
            <strong class="kpi-value">${avg}</strong>
            <span class="kpi-sub">Skala maksimal 100</span>
          </div>
        </div>
        <div class="kpi-card kpi-blue">
          <div class="kpi-icon"><i data-lucide="trophy"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Nilai Tertinggi</span>
            <strong class="kpi-value">${best}</strong>
            <span class="kpi-sub">Terus tingkatkan belajarmu!</span>
          </div>
        </div>
        <div class="kpi-card kpi-teal" onclick="window.ExamModule.setSiswaTab('ujian-list')" style="cursor:pointer">
          <div class="kpi-icon"><i data-lucide="play-circle"></i></div>
          <div class="kpi-info">
            <span class="kpi-label">Ujian Siap Dikerjakan</span>
            <strong class="kpi-value">${availableCount} Paket</strong>
            <span class="kpi-sub">Klik untuk mulai ujian UTBK</span>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:1.25rem;">
        <div class="card-header-wrap">
          <div>
            <h3><i data-lucide="line-chart"></i> Grafik Perkembangan Nilai Saya</h3>
            <p class="muted">Pantau tren nilaimu dari setiap percobaan ujian.</p>
          </div>
          <div class="filter-inline">
            <label class="inline-label">Filter Pelajaran:
              <select class="select-sm" onchange="window.ExamModule.updateFilter('siswaChartPelajaran', this.value)">
                <option value="">Semua Pelajaran</option>
                ${getAllSubjects()
                  .map(
                    (p) =>
                      `<option value="${escapeHtml(p)}" ${
                        state.filters.siswaChartPelajaran === p ? "selected" : ""
                      }>${escapeHtml(p)}</option>`
                  )
                  .join("")}
              </select>
            </label>
          </div>
        </div>
        <div class="chart-wrapper chart-tall">
          <canvas id="siswaProgressChart"></canvas>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3><i data-lucide="clipboard-list"></i> Rekapitulasi Nilai Saya</h3>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Pelajaran</th>
                <th>Paket Ujian</th>
                <th>Kelas</th>
                <th class="num">Benar / Total</th>
                <th class="num">Nilai</th>
                <th>Waktu Submit</th>
              </tr>
            </thead>
            <tbody>
              ${
                filtered.length
                  ? [...filtered]
                      .reverse()
                      .map(
                        (a, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><span class="tag">${escapeHtml(a.pelajaran)}</span></td>
                    <td><strong>${escapeHtml(a.exam_judul)}</strong></td>
                    <td>Kelas ${a.kelas}</td>
                    <td class="num">${a.benar} / ${a.total_soal}</td>
                    <td class="num"><strong class="score-pill ${a.nilai >= 75 ? "score-good" : "score-mid"}">${a.nilai}</strong></td>
                    <td>${escapeHtml(a.submitted_at)}</td>
                  </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="7" class="empty-cell">Belum ada riwayat pengerjaan ujian untuk pelajaran ini.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSiswaExamsList() {
    const filtered = state.exams.filter((e) => {
      const mP =
        !state.filters.siswaExamPelajaran ||
        e.pelajaran.toLowerCase() === state.filters.siswaExamPelajaran.toLowerCase();
      const mK =
        !state.filters.siswaExamKelas ||
        String(e.kelas) === String(state.filters.siswaExamKelas);
      return mP && mK;
    });

    return `
      <div class="card">
        <div class="toolbar">
          <div class="toolbar-left">
            <select class="select-sm" onchange="window.ExamModule.updateFilter('siswaExamPelajaran', this.value)">
              <option value="">Semua Materi Pelajaran</option>
              ${getAllSubjects()
                .map((p) => `<option value="${escapeHtml(p)}" ${state.filters.siswaExamPelajaran === p ? "selected" : ""}>${escapeHtml(p)}</option>`)
                .join("")}
            </select>
            <select class="select-sm" onchange="window.ExamModule.updateFilter('siswaExamKelas', this.value)">
              <option value="">Semua Kelas (1–12)</option>
              ${Array.from({ length: 12 }, (_, i) => i + 1)
                .map((k) => `<option value="${k}" ${String(state.filters.siswaExamKelas) === String(k) ? "selected" : ""}>Kelas ${k}</option>`)
                .join("")}
            </select>
          </div>
          <div class="muted">Soal hanya dapat dikerjakan 1 kali. Jika terkunci, ajukan buka akses ke Guru.</div>
        </div>

        <div class="exam-grid">
          ${
            filtered.length
              ? filtered
                  .map((e) => {
                    const poin = e.total_soal > 0 ? (100 / e.total_soal).toFixed(2).replace(/\.00$/, "") : 0;
                    const locked = e.is_locked;
                    const requested = e.retake_requested;
                    const latest = e.latest_attempt;

                    let statusBadge = `<span class="badge badge-success">Tersedia</span>`;
                    if (locked && requested) statusBadge = `<span class="badge badge-warning">Menunggu Izin Guru</span>`;
                    else if (locked) statusBadge = `<span class="badge badge-danger">Terkunci (Sudah Dikerjakan)</span>`;
                    else if (e.attempt_count > 0) statusBadge = `<span class="badge badge-info">Akses Dibuka Ulang</span>`;

                    return `
                <div class="exam-card ${locked ? "exam-card-locked" : ""}">
                  <div class="exam-card-top">
                    <div>
                      <span class="tag">${escapeHtml(e.pelajaran)}</span>
                      <span class="tag tag-amber">Kelas ${e.kelas}</span>
                    </div>
                    ${statusBadge}
                  </div>
                  <h4>${escapeHtml(e.judul)}</h4>
                  <div class="exam-meta">
                    <span><i data-lucide="list-checks"></i> ${e.total_soal} Soal (${poin} poin/soal)</span>
                    <span><i data-lucide="clock"></i> ${e.durasi_menit} Menit</span>
                    ${latest ? `<span><i data-lucide="award"></i> Nilai Terakhir: <strong>${latest.nilai}</strong></span>` : ""}
                  </div>
                  <div class="exam-card-actions">
                    ${
                      !locked
                        ? `<button class="btn btn-primary btn-block" onclick="window.ExamModule.startUtbkExam(${e.id})">
                            <i data-lucide="play"></i> Kerjakan Ujian UTBK
                          </button>`
                        : requested
                        ? `<button class="btn btn-outline btn-block" disabled>
                            <i data-lucide="clock"></i> Menunggu Persetujuan Guru
                          </button>`
                        : `<button class="btn btn-amber btn-block" onclick="window.ExamModule.requestAccess(${e.id}, '${escapeHtml(e.judul)}')">
                            <i data-lucide="key"></i> Minta Akses ke Guru
                          </button>`
                    }
                  </div>
                </div>`;
                  })
                  .join("")
              : `<div class="empty-cell">Tidak ada paket soal untuk filter ini.</div>`
          }
        </div>
      </div>
    `;
  }

  function renderSiswaDynamic() {
    if (state.siswaTab === "overview") renderSiswaChart();
  }

  function renderSiswaChart() {
    const ctx = document.getElementById("siswaProgressChart");
    if (!ctx || typeof window.Chart === "undefined") return;
    if (siswaChart) siswaChart.destroy();

    const filtered = state.siswaRecap.filter(
      (a) =>
        !state.filters.siswaChartPelajaran ||
        a.pelajaran.toLowerCase() === state.filters.siswaChartPelajaran.toLowerCase()
    );

    siswaChart = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: filtered.length
          ? filtered.map((a, idx) => `#${idx + 1} ${a.pelajaran} (${a.submitted_at.slice(0, 10)})`)
          : ["Belum ada ujian"],
        datasets: [
          {
            label: "Nilai Ujian",
            data: filtered.length ? filtered.map((a) => a.nilai) : [0],
            borderColor: "#059669",
            backgroundColor: "rgba(5, 150, 105, 0.14)",
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            borderWidth: 2.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100 } },
      },
    });
  }

  async function requestAccess(examId, judul) {
    const note = prompt(`Ajukan permintaan buka akses ke Guru untuk "${judul}"?\nTuliskan alasan singkat (opsional):`, "Ingin mengerjakan ulang untuk memperbaiki nilai.");
    if (note === null) return;
    try {
      const res = await window.App.api(`/api/exams/${examId}/request-access`, {
        method: "POST",
        body: { note },
      });
      window.App.toast(res.message);
      await loadSiswaData();
      render();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  // -------------------------------------------------------------------------
  // UTBK Exam Interface (Right-Side Question Panel + Sebelum & Sesudah)
  // -------------------------------------------------------------------------

  async function startUtbkExam(examId) {
    try {
      const exam = await window.App.api(`/api/exams/${examId}/take`);
      if (!exam.questions || !exam.questions.length) {
        window.App.toast("Paket soal ini belum memiliki pertanyaan.", "error");
        return;
      }
      stopTimer();
      state.activeExam = exam;
      state.utbk = {
        currentIndex: 0,
        answers: {},
        flagged: {},
        remainingSec: exam.durasi_menit * 60,
        totalSec: exam.durasi_menit * 60,
        timerId: null,
      };
      state.view = "utbk";
      render();
      startCountdownTimer();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  function startCountdownTimer() {
    stopTimer();
    state.utbk.timerId = setInterval(() => {
      state.utbk.remainingSec -= 1;
      const timerEl = document.getElementById("utbk-timer-display");
      if (timerEl) {
        timerEl.textContent = formatSeconds(Math.max(0, state.utbk.remainingSec));
        if (state.utbk.remainingSec <= 300) timerEl.classList.add("timer-urgent");
      }
      if (state.utbk.remainingSec <= 0) {
        stopTimer();
        window.App.toast("Waktu habis! Jawaban otomatis dikumpulkan.", "warning");
        submitUtbkExam(true);
      }
    }, 1000);
  }

  function formatSeconds(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function renderUtbkView() {
    const exam = state.activeExam;
    const user = window.App.getUser();
    const qs = exam.questions;
    const idx = state.utbk.currentIndex;
    const q = qs[idx];
    const selected = state.utbk.answers[q.nomor_urut] || "";
    const isFlagged = Boolean(state.utbk.flagged[q.nomor_urut]);

    const answeredCount = Object.keys(state.utbk.answers).length;
    const flaggedCount = Object.keys(state.utbk.flagged).filter((k) => state.utbk.flagged[k]).length;

    const options = [
      { key: "A", text: q.opsi_a },
      { key: "B", text: q.opsi_b },
      { key: "C", text: q.opsi_c },
      { key: "D", text: q.opsi_d },
    ];
    if (q.opsi_e) options.push({ key: "E", text: q.opsi_e });

    return `
      <div class="utbk-shell">
        <div class="utbk-topbar">
          <div class="utbk-title-block">
            <span class="tag">${escapeHtml(exam.pelajaran)} • Kelas ${exam.kelas}</span>
            <h2>${escapeHtml(exam.judul)}</h2>
            <small>Peserta: <strong>${escapeHtml(user.full_name)}</strong></small>
          </div>
          <div class="utbk-topbar-right">
            <div class="utbk-timer-box">
              <span>Sisa Waktu</span>
              <strong id="utbk-timer-display" class="${state.utbk.remainingSec <= 300 ? "timer-urgent" : ""}">${formatSeconds(state.utbk.remainingSec)}</strong>
            </div>
            <button class="btn btn-amber" onclick="window.ExamModule.confirmSubmitUtbk()">
              <i data-lucide="send"></i> Selesai Ujian
            </button>
          </div>
        </div>

        <div class="utbk-workspace">
          <!-- Area Soal Kiri / Utama -->
          <div class="utbk-question-area">
            <div class="utbk-q-header">
              <div class="utbk-q-badge">Soal Nomor <strong>${idx + 1}</strong> dari ${qs.length}</div>
              ${isFlagged ? `<span class="badge badge-warning">Ditandai Ragu-ragu</span>` : ""}
            </div>

            <div class="utbk-q-body math-content" data-math-raw="${escapeHtml(q.pertanyaan)}"></div>

            <div class="utbk-options">
              ${options
                .map(
                  (opt) => `
                <button type="button" class="utbk-option ${selected === opt.key ? "selected" : ""}" onclick="window.ExamModule.selectAnswer(${q.nomor_urut}, '${opt.key}')">
                  <span class="opt-letter">${opt.key}</span>
                  <span class="opt-text math-content" data-math-raw="${escapeHtml(opt.text)}"></span>
                </button>`
                )
                .join("")}
            </div>

            <div class="utbk-bottom-nav">
              <button type="button" class="btn btn-outline" ${idx === 0 ? "disabled" : ""} onclick="window.ExamModule.goQuestion(${idx - 1})">
                <i data-lucide="chevron-left"></i> Sebelumnya
              </button>
              <button type="button" class="btn ${isFlagged ? "btn-amber" : "btn-outline"}" onclick="window.ExamModule.toggleFlag(${q.nomor_urut})">
                <i data-lucide="flag"></i> ${isFlagged ? "Hapus Ragu-ragu" : "Ragu-ragu"}
              </button>
              ${
                idx < qs.length - 1
                  ? `<button type="button" class="btn btn-primary" onclick="window.ExamModule.goQuestion(${idx + 1})">
                      Selanjutnya <i data-lucide="chevron-right"></i>
                    </button>`
                  : `<button type="button" class="btn btn-amber" onclick="window.ExamModule.confirmSubmitUtbk()">
                      Selesai & Kumpulkan <i data-lucide="check-circle"></i>
                    </button>`
              }
            </div>
          </div>

          <!-- Panel Soal di Sebelah Kanan (Navigasi Nomor Soal UTBK) -->
          <aside class="utbk-right-panel">
            <div class="utbk-panel-head">
              <h3><i data-lucide="grid"></i> Panel Navigasi Soal</h3>
              <p class="muted">Klik nomor untuk melompat atau melewati soal sulit dan mengerjakannya belakangan.</p>
            </div>

            <div class="utbk-number-grid">
              ${qs
                .map((item, i) => {
                  const ans = state.utbk.answers[item.nomor_urut];
                  const flg = state.utbk.flagged[item.nomor_urut];
                  let cls = "q-num-btn";
                  if (i === idx) cls += " q-current";
                  if (flg) cls += " q-flagged";
                  else if (ans) cls += " q-answered";
                  return `<button type="button" class="${cls}" onclick="window.ExamModule.goQuestion(${i})">${item.nomor_urut}${ans ? `<span class="q-mini-ans">${ans}</span>` : ""}</button>`;
                })
                .join("")}
            </div>

            <div class="utbk-legend">
              <div><span class="leg-box leg-answered"></span> Sudah Dijawab (${answeredCount})</div>
              <div><span class="leg-box leg-flagged"></span> Ragu-ragu (${flaggedCount})</div>
              <div><span class="leg-box leg-empty"></span> Belum Dijawab (${qs.length - answeredCount})</div>
            </div>

            <button type="button" class="btn btn-outline btn-sm btn-block" style="margin-top:0.75rem;" onclick="window.ExamModule.exitUtbkConfirm()">
              Kembali ke Dashboard
            </button>
          </aside>
        </div>
      </div>
    `;
  }

  function selectAnswer(nomorUrut, optionKey) {
    state.utbk.answers[nomorUrut] = optionKey;
    render();
  }

  function toggleFlag(nomorUrut) {
    state.utbk.flagged[nomorUrut] = !state.utbk.flagged[nomorUrut];
    render();
  }

  function goQuestion(newIdx) {
    if (!state.activeExam) return;
    const max = state.activeExam.questions.length - 1;
    state.utbk.currentIndex = Math.max(0, Math.min(max, newIdx));
    render();
  }

  function exitUtbkConfirm() {
    if (confirm("Keluar dari layar ujian tanpa mengumpulkan jawaban?")) {
      stopTimer();
      state.activeExam = null;
      initAndRender("ujian-list");
    }
  }

  function confirmSubmitUtbk() {
    const qs = state.activeExam.questions;
    const answered = Object.keys(state.utbk.answers).length;
    const unanswered = qs.length - answered;
    window.App.openModal(
      "Konfirmasi Pengumpulan Ujian UTBK",
      `
      <div class="confirm-submit-box">
        <p>Pastikan Anda telah memeriksa kembali soal yang ditandai ragu-ragu atau belum terjawab.</p>
        <div class="submit-stats">
          <div><span>Total Soal</span><strong>${qs.length}</strong></div>
          <div><span>Sudah Dijawab</span><strong class="text-emerald">${answered}</strong></div>
          <div><span>Belum Dijawab</span><strong class="text-red">${unanswered}</strong></div>
        </div>
        <p class="muted" style="margin-top:0.75rem;">Setelah dikumpulkan, akses ujian ini akan <strong>terkunci otomatis</strong>.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" onclick="window.App.closeModal()">Periksa Kembali</button>
          <button type="button" class="btn btn-primary" onclick="window.ExamModule.submitUtbkExam(false)">Ya, Kumpulkan Sekarang</button>
        </div>
      </div>
      `
    );
  }

  async function submitUtbkExam(isAuto = false) {
    if (!isAuto) window.App.closeModal();
    stopTimer();
    const elapsed = Math.max(0, state.utbk.totalSec - state.utbk.remainingSec);
    try {
      const res = await window.App.api(`/api/exams/${state.activeExam.id}/submit`, {
        method: "POST",
        body: {
          answers: state.utbk.answers,
          durasi_detik: elapsed,
        },
      });
      state.lastResult = res;
      state.activeExam = null;
      state.view = "result";
      await loadSiswaData();
      render();
    } catch (err) {
      window.App.toast(err.message, "error");
    }
  }

  function renderResultView() {
    const r = state.lastResult;
    if (!r) return "";
    return `
      <div class="result-wrapper">
        <div class="result-card">
          <div class="result-badge ${r.nilai >= 75 ? "res-good" : "res-mid"}">
            <i data-lucide="award"></i>
          </div>
          <span class="eyebrow">HASIL UJIAN UTBK • YPI BIDAYATUL HIDAYAH</span>
          <h2>${escapeHtml(r.exam_judul)}</h2>
          <p class="muted">${escapeHtml(r.pelajaran)} • Kelas ${r.kelas}</p>

          <div class="result-score-big">${r.nilai}<span>/100</span></div>

          <div class="result-stats-grid">
            <div><span>Jawaban Benar</span><strong class="text-emerald">${r.benar}</strong></div>
            <div><span>Jawaban Salah / Kosong</span><strong class="text-red">${r.salah}</strong></div>
            <div><span>Total Soal</span><strong>${r.total_soal}</strong></div>
            <div><span>Bobot per Soal</span><strong>${r.poin_per_soal}</strong></div>
          </div>

          <div class="lock-notice">
            <i data-lucide="lock"></i>
            <span>Akses ujian untuk paket ini sekarang <strong>Terkunci</strong>. Jika ingin mengerjakan lagi, ajukan permintaan buka akses ke Guru.</span>
          </div>

          <div class="result-actions">
            <button class="btn btn-primary" onclick="window.ExamModule.setSiswaTab('overview')">
              <i data-lucide="trending-up"></i> Lihat Grafik & Rekap Nilai
            </button>
            <button class="btn btn-outline" onclick="window.ExamModule.setSiswaTab('ujian-list')">
              <i data-lucide="list"></i> Daftar Ujian Lainnya
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function updateFilter(key, value) {
    state.filters[key] = value;
    render();
  }

  function getContextMenuItems() {
    const user = window.App.getUser();
    if (!user) {
      return [
        { label: "Login Guru / Siswa", icon: "log-in", action: "window.ExamModule.initAndRender()" },
      ];
    }
    if (user.role === "guru") {
      return [
        { label: "Grafik Perkembangan Siswa", icon: "trending-up", action: "window.ExamModule.setGuruTab('overview')", active: state.guruTab === "overview" },
        { label: "Bank Soal & Pembahasan", icon: "book-open-check", action: "window.ExamModule.setGuruTab('bank-soal')", active: state.guruTab === "bank-soal" },
        { label: "Tambah Soal (Prompt JSON)", icon: "file-json", action: "window.ExamModule.startNewJsonExam()", active: state.guruTab === "input-json" },
        { label: "Rekap Nilai & Buka Akses", icon: "unlock", action: "window.ExamModule.setGuruTab('rekap-nilai')", active: state.guruTab === "rekap-nilai" },
        { label: "Tambah Akun Siswa", icon: "user-plus", action: "window.ExamModule.setGuruTab('kelola-siswa')", active: state.guruTab === "kelola-siswa" },
        { label: "Ubah Password Guru", icon: "key-round", action: "window.ExamModule.setGuruTab('ubah-password')", active: state.guruTab === "ubah-password" },
      ];
    }
    return [
      { label: "Rekap & Grafik Nilai Saya", icon: "trending-up", action: "window.ExamModule.setSiswaTab('overview')", active: state.siswaTab === "overview" },
      { label: "Pilih Materi & Kerjakan Ujian", icon: "pen-tool", action: "window.ExamModule.setSiswaTab('ujian-list')", active: state.siswaTab === "ujian-list" },
    ];
  }

  return {
    initAndRender,
    setGuruTab,
    setSiswaTab,
    switchLoginRole,
    quickFillLogin,
    updateFilter,
    viewExamPembahasan,
    startNewJsonExam,
    editExamJson,
    copyAiPrompt,
    fillSampleJson,
    loadJsonFile,
    previewJsonQuestions,
    deleteExam,
    unlockStudentAccess,
    exportRecapExcel,
    deleteStudent,
    requestAccess,
    startUtbkExam,
    selectAnswer,
    toggleFlag,
    goQuestion,
    exitUtbkConfirm,
    confirmSubmitUtbk,
    submitUtbkExam,
    getContextMenuItems,
  };
})();
