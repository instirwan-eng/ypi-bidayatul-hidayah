"""SQLite database initialization, helpers, and realistic seed data for YPI BIDAYATUL HIDAYAH."""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    ).hex()
    return digest, salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    digest, _ = hash_password(password, salt)
    return secrets.compare_digest(digest, stored_hash)


def today_str(offset_days: int = 0) -> str:
    return (datetime.now() + timedelta(days=offset_days)).strftime("%Y-%m-%d")


def now_iso(offset_days: int = 0) -> str:
    return (datetime.now() + timedelta(days=offset_days)).strftime("%Y-%m-%d %H:%M:%S")


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('guru', 'siswa')),
            full_name TEXT NOT NULL,
            kelas INTEGER,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS consumables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama_barang TEXT NOT NULL,
            satuan TEXT NOT NULL,
            kategori TEXT NOT NULL,
            jumlah_awal INTEGER NOT NULL DEFAULT 0,
            barang_masuk INTEGER NOT NULL DEFAULT 0,
            barang_dipakai INTEGER NOT NULL DEFAULT 0,
            batas_menipis INTEGER NOT NULL DEFAULT 5,
            lokasi_barang TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS consumable_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            consumable_id INTEGER REFERENCES consumables(id) ON DELETE SET NULL,
            tanggal TEXT NOT NULL,
            nama_barang TEXT NOT NULL,
            satuan TEXT NOT NULL,
            kategori TEXT NOT NULL,
            jumlah_dipakai INTEGER NOT NULL,
            pengguna TEXT NOT NULL DEFAULT '',
            keterangan TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama_barang TEXT NOT NULL,
            kategori_buku TEXT NOT NULL,
            jenjang_kelas INTEGER NOT NULL CHECK(jenjang_kelas BETWEEN 1 AND 12),
            tahun_terbit TEXT NOT NULL DEFAULT '',
            tanggal_masuk TEXT NOT NULL DEFAULT '',
            jumlah_masuk INTEGER NOT NULL DEFAULT 0,
            tanggal_keluar TEXT NOT NULL DEFAULT '',
            jumlah_keluar INTEGER NOT NULL DEFAULT 0,
            tanggal_pengembalian TEXT NOT NULL DEFAULT '',
            jumlah_dikembalikan INTEGER NOT NULL DEFAULT 0,
            kelayakan TEXT NOT NULL DEFAULT 'Layak',
            lokasi_buku TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS book_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
            tanggal_pinjam TEXT NOT NULL,
            nama_barang TEXT NOT NULL,
            kategori_buku TEXT NOT NULL,
            jenjang_kelas INTEGER NOT NULL,
            peminjam TEXT NOT NULL DEFAULT '',
            jumlah_dipinjam INTEGER NOT NULL DEFAULT 0,
            tanggal_pengembalian TEXT NOT NULL DEFAULT '',
            jumlah_dikembalikan INTEGER NOT NULL DEFAULT 0,
            keterangan TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama_barang TEXT NOT NULL,
            kategori TEXT NOT NULL,
            stok_awal INTEGER NOT NULL DEFAULT 0,
            stok_masuk INTEGER NOT NULL DEFAULT 0,
            stok_keluar INTEGER NOT NULL DEFAULT 0,
            kelayakan TEXT NOT NULL DEFAULT 'Layak',
            status TEXT NOT NULL DEFAULT 'Ada',
            lokasi_barang TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS equipment_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
            tanggal TEXT NOT NULL,
            nama_barang TEXT NOT NULL,
            kategori TEXT NOT NULL,
            jumlah_keluar INTEGER NOT NULL DEFAULT 0,
            penerima_lokasi TEXT NOT NULL DEFAULT '',
            keterangan TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            judul TEXT NOT NULL,
            pelajaran TEXT NOT NULL,
            kelas INTEGER NOT NULL CHECK(kelas BETWEEN 1 AND 12),
            durasi_menit INTEGER NOT NULL DEFAULT 60,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            nomor_urut INTEGER NOT NULL,
            pertanyaan TEXT NOT NULL,
            opsi_a TEXT NOT NULL,
            opsi_b TEXT NOT NULL,
            opsi_c TEXT NOT NULL,
            opsi_d TEXT NOT NULL,
            opsi_e TEXT NOT NULL DEFAULT '',
            kunci_jawaban TEXT NOT NULL CHECK(kunci_jawaban IN ('A', 'B', 'C', 'D', 'E')),
            pembahasan TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            answers_json TEXT NOT NULL,
            benar INTEGER NOT NULL,
            total_soal INTEGER NOT NULL,
            nilai REAL NOT NULL,
            durasi_detik INTEGER NOT NULL DEFAULT 0,
            submitted_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exam_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            is_locked INTEGER NOT NULL DEFAULT 0,
            retake_requested INTEGER NOT NULL DEFAULT 0,
            request_note TEXT NOT NULL DEFAULT '',
            unlocked_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            UNIQUE(exam_id, student_id)
        );
        """
    )
    conn.commit()

    # Seed only if users table is empty
    existing_users = cur.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if existing_users == 0:
        _seed_initial_data(conn)

    conn.close()


def _seed_initial_data(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    ts = now_iso()
    today = today_str()
    yesterday = today_str(-1)

    # 1. Users (1 Guru + 3 Siswa)
    guru_hash, guru_salt = hash_password("guru123")
    cur.execute(
        "INSERT INTO users (username, password_hash, salt, role, full_name, kelas, created_at) VALUES (?, ?, ?, 'guru', ?, NULL, ?)",
        ("guru", guru_hash, guru_salt, "Ust. H. Ahmad Fauzi, S.Pd.", ts),
    )
    guru_id = cur.lastrowid

    students = [
        ("siswa1", "siswa123", "Ahmad Zaki Pratama", 12),
        ("siswa2", "siswa123", "Siti Nurhaliza", 12),
        ("siswa3", "siswa123", "Muhammad Rizky", 10),
    ]
    student_ids = []
    for uname, pwd, fname, kls in students:
        h, s = hash_password(pwd)
        cur.execute(
            "INSERT INTO users (username, password_hash, salt, role, full_name, kelas, created_at) VALUES (?, ?, ?, 'siswa', ?, ?, ?)",
            (uname, h, s, fname, kls, ts),
        )
        student_ids.append(cur.lastrowid)

    # 2. Barang Habis Pakai
    consumables_seed = [
        ("Kertas HVS A4 80gr", "Rim", "ATK", 20, 15, 12, 5, "Lemari Tata Usaha", ts),
        ("Spidol Whiteboard Hitam", "Pcs", "ATK", 30, 12, 38, 6, "Ruang Guru", ts),
        ("Tinta Printer Epson 003", "Botol", "ATK", 8, 4, 9, 3, "Ruang TU", ts),
        ("Sabun Cuci Tangan", "Botol", "Kebersihan", 15, 10, 25, 4, "Gudang Kebersihan", ts),
        ("Kapur Barus & Pewangi", "Pak", "Kebersihan", 12, 6, 8, 4, "Gudang Kebersihan", ts),
        ("Plester & Kasa Steril", "Kotak", "Kesehatan / UKS", 10, 5, 4, 3, "Ruang UKS", ts),
    ]
    c_ids = []
    for row in consumables_seed:
        cur.execute(
            """INSERT INTO consumables
            (nama_barang, satuan, kategori, jumlah_awal, barang_masuk, barang_dipakai, batas_menipis, lokasi_barang, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            row,
        )
        c_ids.append(cur.lastrowid)

    consumable_logs_seed = [
        (c_ids[0], today, "Kertas HVS A4 80gr", "Rim", "ATK", 2, "Bagian Kurikulum", "Cetak soal ulangan harian", ts),
        (c_ids[1], today, "Spidol Whiteboard Hitam", "Pcs", "ATK", 4, "Guru Kelas 10-12", "Kebutuhan KBM kelas", ts),
        (c_ids[2], today, "Tinta Printer Epson 003", "Botol", "ATK", 1, "Staff TU", "Cetak administrasi sekolah", ts),
        (c_ids[3], yesterday, "Sabun Cuci Tangan", "Botol", "Kebersihan", 3, "Petugas Kebersihan", "Pengisian wastafel lantai 1 & 2", ts),
    ]
    for row in consumable_logs_seed:
        cur.execute(
            """INSERT INTO consumable_logs
            (consumable_id, tanggal, nama_barang, satuan, kategori, jumlah_dipakai, pengguna, keterangan, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            row,
        )

    # 3. Buku (2 kategori buku pelajaran: Buku Pelajaran Utama & Buku Pelajaran Penunjang, jenjang kelas 1-12)
    books_seed = [
        ("Matematika Tingkat Lanjut Kelas XII", "Buku Pelajaran Utama", 12, "2024", today_str(-30), 60, today, 18, today_str(-2), 5, "Layak", "Rak A1 Perpustakaan", ts),
        ("Bahasa Indonesia Kelas X Kurikulum Merdeka", "Buku Pelajaran Utama", 10, "2024", today_str(-25), 50, today, 10, "", 0, "Layak", "Rak A2 Perpustakaan", ts),
        ("Modul Latihan Soal UTBK SNBT Penalaran Matematika", "Buku Pelajaran Penunjang", 12, "2025", today_str(-15), 40, today, 12, today_str(-1), 4, "Layak", "Rak B1 Ruang Referensi", ts),
        ("Ilmu Pengetahuan Alam (IPA) Terpadu Kelas VII", "Buku Pelajaran Utama", 7, "2023", today_str(-45), 45, yesterday, 15, today, 10, "Layak", "Rak C1 Perpustakaan", ts),
        ("Pendidikan Agama Islam & Budi Pekerti Kelas IV", "Buku Pelajaran Utama", 4, "2024", today_str(-20), 35, today, 8, "", 0, "Layak", "Rak D1 Perpustakaan SD", ts),
        ("Atlas & Ensiklopedia Sains Dasar Kelas V", "Buku Pelajaran Penunjang", 5, "2021", today_str(-90), 20, today_str(-10), 6, today_str(-3), 4, "Tidak Layak", "Rak Arsip Perpustakaan", ts),
    ]
    b_ids = []
    for row in books_seed:
        cur.execute(
            """INSERT INTO books
            (nama_barang, kategori_buku, jenjang_kelas, tahun_terbit, tanggal_masuk, jumlah_masuk, tanggal_keluar, jumlah_keluar, tanggal_pengembalian, jumlah_dikembalikan, kelayakan, lokasi_buku, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            row,
        )
        b_ids.append(cur.lastrowid)

    book_logs_seed = [
        (b_ids[0], today, "Matematika Tingkat Lanjut Kelas XII", "Buku Pelajaran Utama", 12, "Siswa Kelas 12 IPA", 18, today_str(-2), 5, "Dipinjam untuk persiapan ujian", ts),
        (b_ids[2], today, "Modul Latihan Soal UTBK SNBT Penalaran Matematika", "Buku Pelajaran Penunjang", 12, "Ahmad Zaki & Kelompok Belajar", 12, today_str(-1), 4, "Sesi bimbingan intensif UTBK", ts),
        (b_ids[1], today, "Bahasa Indonesia Kelas X Kurikulum Merdeka", "Buku Pelajaran Utama", 10, "Muhammad Rizky & Kelas 10A", 10, "", 0, "Peminjaman pembelajaran semester ganjil", ts),
    ]
    for row in book_logs_seed:
        cur.execute(
            """INSERT INTO book_logs
            (book_id, tanggal_pinjam, nama_barang, kategori_buku, jenjang_kelas, peminjam, jumlah_dipinjam, tanggal_pengembalian, jumlah_dikembalikan, keterangan, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            row,
        )

    # 4. Perlengkapan Sekolah
    equipment_seed = [
        ("Proyektor LCD Epson EB-X500", "Elektronik", 8, 2, 1, "Layak", "Ada", "Ruang Multimedia & Kelas", ts),
        ("Meja Belajar Siswa Kayu Jati", "Mebel / Furnitur", 120, 20, 5, "Layak", "Ada", "Ruang Kelas 1 - 12", ts),
        ("Kursi Guru Ergonomis", "Mebel / Furnitur", 24, 4, 2, "Perlu Perbaikan", "Sedang Diperbaiki", "Bengkel Sarpras", ts),
        ("Mikroskop Binokuler Lab", "Laboratorium", 10, 2, 1, "Layak", "Ada", "Lab IPA Terpadu", ts),
        ("Bola Basket Molten Original", "Olahraga", 10, 4, 2, "Rusak", "Hilang", "Gudang Olahraga", ts),
        ("Sound System Portable Masjid", "Ibadah", 3, 1, 0, "Layak", "Ada", "Musholla YPI Bidayatul Hidayah", ts),
    ]
    e_ids = []
    for row in equipment_seed:
        cur.execute(
            """INSERT INTO equipment
            (nama_barang, kategori, stok_awal, stok_masuk, stok_keluar, kelayakan, status, lokasi_barang, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            row,
        )
        e_ids.append(cur.lastrowid)

    equipment_logs_seed = [
        (e_ids[0], today, "Proyektor LCD Epson EB-X500", "Elektronik", 1, "Ruang Kelas 12 IPA", "Digunakan untuk presentasi materi & simulasi UTBK", ts),
        (e_ids[3], today, "Mikroskop Binokuler Lab", "Laboratorium", 1, "Lab Biologi", "Praktikum pengamatan sel tumbuhan", ts),
        (e_ids[1], yesterday, "Meja Belajar Siswa Kayu Jati", "Mebel / Furnitur", 5, "Ruang Kelas 7B", "Penggantian meja tambahan siswa baru", ts),
    ]
    for row in equipment_logs_seed:
        cur.execute(
            """INSERT INTO equipment_logs
            (equipment_id, tanggal, nama_barang, kategori, jumlah_keluar, penerima_lokasi, keterangan, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            row,
        )

    # 5. Exams & Questions (with clean LaTeX math + Pembahasan for Guru)
    cur.execute(
        "INSERT INTO exams (judul, pelajaran, kelas, durasi_menit, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("Tryout UTBK SNBT: Penalaran Matematika", "Matematika", 12, 45, guru_id, now_iso(-5)),
    )
    exam1_id = cur.lastrowid

    exam1_questions = [
        (
            1,
            "Diketahui fungsi kuadrat $f(x) = 2x^2 - 8x + 6$. Nilai minimum dari fungsi $f(x)$ adalah ...",
            "$-4$",
            "$-2$",
            "$0$",
            "$2$",
            "$6$",
            "B",
            "Sumbu simetri $x_p = -\\frac{b}{2a} = -\\frac{-8}{2(2)} = 2$. Substitusikan $x = 2$ ke $f(x)$: $$f(2) = 2(2)^2 - 8(2) + 6 = 8 - 16 + 6 = -2.$$ Jadi nilai minimumnya adalah $-2$.",
        ),
        (
            2,
            "Hasil dari $\\int_{1}^{3} (3x^2 - 2x + 1)\\,dx$ adalah ...",
            "$16$",
            "$18$",
            "$20$",
            "$22$",
            "$24$",
            "C",
            "Hitung antiturunannya terlebih dahulu: $$\\int (3x^2 - 2x + 1)\\,dx = x^3 - x^2 + x.$$ Evaluasi batas $1$ sampai $3$: $$(3^3 - 3^2 + 3) - (1^3 - 1^2 + 1) = (27 - 9 + 3) - (1 - 1 + 1) = 21 - 1 = 20.$$",
        ),
        (
            3,
            "Jika matriks $A = \\begin{pmatrix} 2 & 1 \\\\ 5 & 3 \\end{pmatrix}$, maka determinan dari matriks $A^{-1}$ adalah ...",
            "$1$",
            "$2$",
            "$\\frac{1}{2}$",
            "$-1$",
            "$0$",
            "A",
            "Determinan $A$ adalah $\\det(A) = (2)(3) - (1)(5) = 6 - 5 = 1$. Berdasarkan sifat determinan invers, $\\det(A^{-1}) = \\frac{1}{\\det(A)} = \\frac{1}{1} = 1$.",
        ),
        (
            4,
            "Diketahui barisan aritmetika dengan suku ke-3 adalah $11$ dan suku ke-7 adalah $23$. Jumlah $10$ suku pertama barisan tersebut adalah ...",
            "$165$",
            "$175$",
            "$185$",
            "$195$",
            "$205$",
            "C",
            "Beda barisan: $b = \\frac{U_7 - U_3}{7 - 3} = \\frac{23 - 11}{4} = 3$. Suku pertama: $a = U_3 - 2b = 11 - 6 = 5$. Jumlah $10$ suku pertama: $$S_{10} = \\frac{10}{2}\\bigl(2a + 9b\\bigr) = 5(10 + 27) = 5 \\times 37 = 185.$$",
        ),
        (
            5,
            "Nilai dari $\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2}$ adalah ...",
            "$0$",
            "$2$",
            "$4$",
            "$6$",
            "$8$",
            "C",
            "Faktorkan pembilang: $$\\lim_{x \\to 2} \\frac{(x - 2)(x + 2)}{x - 2} = \\lim_{x \\to 2} (x + 2) = 2 + 2 = 4.$$",
        ),
    ]
    for q in exam1_questions:
        cur.execute(
            """INSERT INTO questions
            (exam_id, nomor_urut, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, kunci_jawaban, pembahasan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (exam1_id, *q),
        )

    cur.execute(
        "INSERT INTO exams (judul, pelajaran, kelas, durasi_menit, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("Evaluasi UTBK: Literasi Bahasa Indonesia", "Bahasa Indonesia", 12, 30, guru_id, now_iso(-3)),
    )
    exam2_id = cur.lastrowid

    exam2_questions = [
        (
            1,
            "Kalimat berikut yang menggunakan ejaan sesuai dengan EYD Edisi V secara tepat adalah ...",
            "Diantara para peserta ujian, hanya lima orang yang membawa kartu tanda penduduk.",
            "Semua siswa diwajibkan hadir tepat waktu, namun demikian beberapa masih terlambat.",
            "Penelitian tersebut dilakukan di laboratorium biologi pada pukul 08.00 WIB.",
            "Aktifitas belajar mengajar di YPI Bidayatul Hidayah berjalan sangat kondusif.",
            "Para siswa-siswa kelas XII mengikuti tryout UTBK secara serentak.",
            "C",
            "Penulisan kata baku dan tanda baca yang tepat terdapat pada opsi C: 'di laboratorium' dipisah karena menunjukkan tempat, 'pukul 08.00 WIB' menggunakan tanda titik sebagai pemisah jam dan menit. Pada opsi A 'di antara' harus dipisah; opsi D 'aktivitas' bukan 'aktifitas'; opsi E pleonasme ('para siswa-siswa').",
        ),
        (
            2,
            "Ide pokok paragraf deduktif biasanya terletak pada bagian ...",
            "Akhir paragraf sebagai simpulan",
            "Tengah paragraf sebagai penjelas",
            "Awal paragraf pada kalimat utama",
            "Seluruh kalimat secara tersirat",
            "Judul bacaan saja",
            "C",
            "Paragraf deduktif menempatkan kalimat utama yang memuat ide pokok di awal paragraf, kemudian diikuti kalimat-kalimat penjelas yang bersifat khusus.",
        ),
        (
            3,
            "Manakah kata baku yang tepat untuk melengkapi kalimat: 'Sekolah melakukan ... data inventaris secara berkala'?",
            "sistimatisasi",
            "sinkronisasi",
            "standarisasi",
            "analisa",
            "kordinasi",
            "B",
            "Kata baku menurut KBBI adalah 'sinkronisasi'. Bentuk baku kata lainnya: sistematisasi, standardisasi, analisis, dan koordinasi.",
        ),
        (
            4,
            "Makna ungkapan 'banting tulang' dalam teks biografi tokoh pendidikan adalah ...",
            "Mengalami patah tulang akibat kecelakaan",
            "Menyerah sebelum berusaha",
            "Bekerja keras dengan penuh semangat",
            "Menghindari tanggung jawab pekerjaan",
            "Mengutamakan istirahat di atas segalanya",
            "C",
            "Idiom 'banting tulang' bermakna bekerja keras atau berusaha sekuat tenaga demi mencapai tujuan.",
        ),
    ]
    for q in exam2_questions:
        cur.execute(
            """INSERT INTO questions
            (exam_id, nomor_urut, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, kunci_jawaban, pembahasan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (exam2_id, *q),
        )

    cur.execute(
        "INSERT INTO exams (judul, pelajaran, kelas, durasi_menit, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("Latihan Soal Fisika: Hukum Newton & Usaha Energi", "Fisika", 12, 40, guru_id, now_iso(-1)),
    )
    exam3_id = cur.lastrowid

    exam3_questions = [
        (
            1,
            "Sebuah benda bermassa $m = 4\\text{ kg}$ ditarik dengan gaya mendatar $F = 20\\text{ N}$ di atas lantai licin. Percepatan benda tersebut adalah ...",
            "$2\\text{ m/s}^2$",
            "$4\\text{ m/s}^2$",
            "$5\\text{ m/s}^2$",
            "$8\\text{ m/s}^2$",
            "$10\\text{ m/s}^2$",
            "C",
            "Berdasarkan Hukum II Newton: $$a = \\frac{F}{m} = \\frac{20\\text{ N}}{4\\text{ kg}} = 5\\text{ m/s}^2.$$",
        ),
        (
            2,
            "Benda bermassa $2\\text{ kg}$ bergerak dengan kecepatan $6\\text{ m/s}$. Energi kinetik benda tersebut adalah ...",
            "$12\\text{ J}$",
            "$18\\text{ J}$",
            "$24\\text{ J}$",
            "$36\\text{ J}$",
            "$72\\text{ J}$",
            "D",
            "Rumus energi kinetik: $$E_k = \\frac{1}{2} m v^2 = \\frac{1}{2}(2)(6)^2 = 36\\text{ Joule}.$$",
        ),
    ]
    for q in exam3_questions:
        cur.execute(
            """INSERT INTO questions
            (exam_id, nomor_urut, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, kunci_jawaban, pembahasan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (exam3_id, *q),
        )

    # 6. Historical Attempts so progress charts render immediately on Guru & Siswa dashboards
    # Ahmad (student_ids[0]) took Exam 2 (locked) & earlier practice on Exam 1 (unlocked for demo so he can also try taking Exam 1 right away, OR let's keep Exam 1 unlocked for siswa1 so user can immediately test UTBK exam!)
    # Let's give Ahmad 2 historical attempts on Exam 2 (first unlocked previously, second locked) + Siti took Exam 1 & Exam 2!
    s1, s2, s3 = student_ids
    cur.execute(
        """INSERT INTO attempts (exam_id, student_id, answers_json, benar, total_soal, nilai, durasi_detik, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (exam2_id, s1, json.dumps({"1": "C", "2": "C", "3": "A", "4": "C"}), 3, 4, 75.0, 820, now_iso(-2)),
    )
    cur.execute(
        """INSERT INTO attempts (exam_id, student_id, answers_json, benar, total_soal, nilai, durasi_detik, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (exam2_id, s1, json.dumps({"1": "C", "2": "C", "3": "B", "4": "C"}), 4, 4, 100.0, 690, now_iso(-1)),
    )
    cur.execute(
        """INSERT INTO exam_access (exam_id, student_id, is_locked, retake_requested, request_note, unlocked_at, updated_at)
        VALUES (?, ?, 1, 0, '', '', ?)""",
        (exam2_id, s1, now_iso(-1)),
    )

    cur.execute(
        """INSERT INTO attempts (exam_id, student_id, answers_json, benar, total_soal, nilai, durasi_detik, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (exam1_id, s2, json.dumps({"1": "B", "2": "C", "3": "A", "4": "C", "5": "B"}), 4, 5, 80.0, 1250, now_iso(-2)),
    )
    cur.execute(
        """INSERT INTO exam_access (exam_id, student_id, is_locked, retake_requested, request_note, unlocked_at, updated_at)
        VALUES (?, ?, 1, 1, 'Ingin memperbaiki nilai Matematika ke 100', '', ?)""",
        (exam1_id, s2, now_iso(-1)),
    )
    cur.execute(
        """INSERT INTO attempts (exam_id, student_id, answers_json, benar, total_soal, nilai, durasi_detik, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (exam2_id, s2, json.dumps({"1": "C", "2": "C", "3": "B", "4": "A"}), 3, 4, 75.0, 740, now_iso(-1)),
    )
    cur.execute(
        """INSERT INTO exam_access (exam_id, student_id, is_locked, retake_requested, request_note, unlocked_at, updated_at)
        VALUES (?, ?, 1, 0, '', '', ?)""",
        (exam2_id, s2, now_iso(-1)),
    )

    conn.commit()
