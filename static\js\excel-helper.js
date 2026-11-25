/**
 * Excel (.xlsx) Template, Import, and Export helper powered by SheetJS.
 */
window.ExcelHelper = (() => {
  function assertXlsx() {
    if (typeof window.XLSX === "undefined") {
      throw new Error("Library Excel (SheetJS) belum termuat.");
    }
  }

  function downloadWorkbook(wb, filename) {
    assertXlsx();
    window.XLSX.writeFile(wb, filename);
  }

  function exportRows(rows, headers, sheetName, filename) {
    assertXlsx();
    const aoa = [headers.map((h) => h.label)];
    rows.forEach((row) => {
      aoa.push(headers.map((h) => (row[h.key] !== undefined && row[h.key] !== null ? row[h.key] : "")));
    });
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(16, h.label.length + 4) }));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    downloadWorkbook(wb, filename);
  }

  function downloadTemplate(type) {
    assertXlsx();
    const wb = window.XLSX.utils.book_new();
    let headers = [];
    let sample = [];
    let notes = [];
    let filename = "";

    if (type === "consumables") {
      headers = [
        "Nama Barang",
        "Satuan",
        "Kategori",
        "Jumlah Barang Awal",
        "Barang Masuk",
        "Barang yang Dipakai",
        "Batas Menipis",
        "Lokasi Barang",
      ];
      sample = ["Kertas F4 70gr", "Rim", "ATK", 15, 10, 5, 5, "Lemari TU"];
      notes = [
        ["PETUNJUK PENGISIAN TEMPLATE BARANG HABIS PAKAI - YPI BIDAYATUL HIDAYAH"],
        ["1. Jangan ubah baris header pada sheet Data."],
        ["2. Jumlah Barang Awal, Barang Masuk, Barang yang Dipakai, dan Batas Menipis diisi angka (>= 0)."],
        ["3. Sisa Barang dan Status (Aman / Menipis / Habis) dihitung otomatis oleh sistem."],
        ["4. Contoh Kategori: ATK, Kebersihan, Kesehatan / UKS, Laboratorium, Lainnya."],
      ];
      filename = "Template_Barang_Habis_Pakai_YPI_BH.xlsx";
    } else if (type === "books") {
      headers = [
        "Nama Barang (Judul Buku)",
        "Kategori Buku",
        "Jenjang Kelas (1-12)",
        "Tahun Terbit",
        "Tanggal Masuk Buku",
        "Jumlah Buku Masuk",
        "Tanggal Keluar (Dipinjam)",
        "Jumlah Keluar (Dipinjam)",
        "Tanggal Pengembalian",
        "Jumlah Dikembalikan",
        "Kelayakan",
        "Lokasi Buku",
      ];
      sample = [
        "Matematika Wajib Kelas XI",
        "Buku Pelajaran Utama",
        11,
        "2024",
        "2026-11-01",
        40,
        "2026-11-10",
        10,
        "2026-11-20",
        5,
        "Layak",
        "Rak A3 Perpustakaan",
      ];
      notes = [
        ["PETUNJUK PENGISIAN TEMPLATE BUKU - YPI BIDAYATUL HIDAYAH"],
        ["1. Kategori Buku tersedia 2 pilihan: 'Buku Pelajaran Utama' atau 'Buku Pelajaran Penunjang'."],
        ["2. Jenjang Kelas diisi angka 1 sampai 12."],
        ["3. Format tanggal gunakan YYYY-MM-DD (contoh: 2026-11-25)."],
        ["4. Kelayakan diisi 'Layak' atau 'Tidak Layak'."],
        ["5. Sisa Buku dihitung otomatis: Jumlah Masuk - Jumlah Keluar + Jumlah Dikembalikan."],
      ];
      filename = "Template_Inventaris_Buku_YPI_BH.xlsx";
    } else if (type === "equipment") {
      headers = [
        "Nama Barang",
        "Kategori",
        "Jumlah Stok Awal",
        "Stok Masuk",
        "Stok yang Keluar",
        "Kelayakan",
        "Status",
        "Lokasi Barang",
      ];
      sample = [
        "Papan Tulis Whiteboard 120x240",
        "Mebel / Furnitur",
        12,
        4,
        1,
        "Layak",
        "Ada",
        "Ruang Kelas 8A",
      ];
      notes = [
        ["PETUNJUK PENGISIAN TEMPLATE PERLENGKAPAN SEKOLAH - YPI BIDAYATUL HIDAYAH"],
        ["1. Kelayakan diisi salah satu: 'Layak', 'Rusak', atau 'Perlu Perbaikan'."],
        ["2. Status diisi salah satu: 'Ada', 'Sedang Diperbaiki', atau 'Hilang'."],
        ["3. Sisa Stok dihitung otomatis: Stok Awal + Stok Masuk - Stok Keluar."],
      ];
      filename = "Template_Perlengkapan_Sekolah_YPI_BH.xlsx";
    }

    const wsData = window.XLSX.utils.aoa_to_sheet([headers, sample]);
    wsData["!cols"] = headers.map((h) => ({ wch: Math.max(18, h.length + 4) }));
    const wsNotes = window.XLSX.utils.aoa_to_sheet(notes);
    wsNotes["!cols"] = [{ wch: 80 }];

    window.XLSX.utils.book_append_sheet(wb, wsData, "Data");
    window.XLSX.utils.book_append_sheet(wb, wsNotes, "Petunjuk");
    downloadWorkbook(wb, filename);
  }

  function normKey(k) {
    return String(k || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function toInt(val, fallback = 0) {
    if (val === undefined || val === null || val === "") return fallback;
    const n = parseInt(String(val).replace(/[^\d-]/g, ""), 10);
    return Number.isNaN(n) ? fallback : Math.max(0, n);
  }

  function formatDateCell(val) {
    if (val === undefined || val === null || val === "") return "";
    if (typeof val === "number") {
      const parsed = window.XLSX.SSF.parse_date_code(val);
      if (parsed) {
        const m = String(parsed.m).padStart(2, "0");
        const d = String(parsed.d).padStart(2, "0");
        return `${parsed.y}-${m}-${d}`;
      }
    }
    return String(val).trim();
  }

  async function parseFile(file, type) {
    assertXlsx();
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames.includes("Data") ? "Data" : wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rawRows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rawRows.length) {
      throw new Error("File Excel kosong atau tidak memiliki baris data.");
    }

    return rawRows.map((raw) => {
      const m = {};
      Object.keys(raw).forEach((k) => {
        m[normKey(k)] = raw[k];
      });

      const pick = (...keys) => {
        for (const k of keys) {
          if (m[k] !== undefined && m[k] !== "") return m[k];
        }
        return "";
      };

      if (type === "consumables") {
        return {
          nama_barang: String(pick("namabarang", "nama", "barang")).trim(),
          satuan: String(pick("satuan", "unit") || "Pcs").trim(),
          kategori: String(pick("kategori", "jenis") || "ATK").trim(),
          jumlah_awal: toInt(pick("jumlahbarangawal", "jumlahawal", "stokawal", "awal"), 0),
          barang_masuk: toInt(pick("barangmasuk", "masuk"), 0),
          barang_dipakai: toInt(pick("barangyangdipakai", "barangdipakai", "dipakai", "keluar"), 0),
          batas_menipis: toInt(pick("batasmenipis", "minimal", "min"), 5),
          lokasi_barang: String(pick("lokasibarang", "lokasi")).trim(),
        };
      }

      if (type === "books") {
        const rawKategori = String(pick("kategoribuku", "kategori")).trim();
        const kategoriBuku = rawKategori.toLowerCase().includes("penunjang")
          ? "Buku Pelajaran Penunjang"
          : "Buku Pelajaran Utama";
        const kelas = Math.min(12, Math.max(1, toInt(pick("jenjangkelas112", "jenjangkelas", "kelas"), 1)));
        const rawKelayakan = String(pick("kelayakan", "kondisi") || "Layak").trim();
        const kelayakan = rawKelayakan.toLowerCase().includes("tidak") ? "Tidak Layak" : "Layak";

        return {
          nama_barang: String(pick("namabarangjudulbuku", "namabarang", "judulbuku", "judul")).trim(),
          kategori_buku: kategoriBuku,
          jenjang_kelas: kelas,
          tahun_terbit: String(pick("tahunterbit", "tahun")).trim(),
          tanggal_masuk: formatDateCell(pick("tanggalmasukbuku", "tanggalmasuk", "tglmasuk")),
          jumlah_masuk: toInt(pick("jumlahbukumasuk", "jumlahmasuk", "masuk"), 0),
          tanggal_keluar: formatDateCell(pick("tanggalkeluardipinjam", "tanggalkeluar", "tglkeluar")),
          jumlah_keluar: toInt(pick("jumlahkeluardipinjam", "jumlahkeluar", "keluar"), 0),
          tanggal_pengembalian: formatDateCell(pick("tanggalpengembalian", "tglpengembalian", "tglkembali")),
          jumlah_dikembalikan: toInt(pick("jumlahdikembalikansetelahdipinjam", "jumlahdikembalikan", "dikembalikan"), 0),
          kelayakan,
          lokasi_buku: String(pick("lokasibuku", "lokasi")).trim(),
        };
      }

      // equipment
      const rawKelayakan = String(pick("kelayakan", "kondisi") || "Layak").trim().toLowerCase();
      let kelayakan = "Layak";
      if (rawKelayakan.includes("perbaikan")) kelayakan = "Perlu Perbaikan";
      else if (rawKelayakan.includes("rusak")) kelayakan = "Rusak";

      const rawStatus = String(pick("status") || "Ada").trim().toLowerCase();
      let status = "Ada";
      if (rawStatus.includes("perbaiki") || rawStatus.includes("servis")) status = "Sedang Diperbaiki";
      else if (rawStatus.includes("hilang")) status = "Hilang";

      return {
        nama_barang: String(pick("namabarang", "nama")).trim(),
        kategori: String(pick("kategori", "jenis") || "Lainnya").trim(),
        stok_awal: toInt(pick("jumlahstokawal", "stokawal", "awal"), 0),
        stok_masuk: toInt(pick("stokmasuk", "masuk"), 0),
        stok_keluar: toInt(pick("stokyangkeluar", "stokkeluar", "keluar"), 0),
        kelayakan,
        status,
        lokasi_barang: String(pick("lokasibarang", "lokasi")).trim(),
      };
    }).filter((item) => item.nama_barang.length > 0);
  }

  return {
    exportRows,
    downloadTemplate,
    parseFile,
  };
})();
