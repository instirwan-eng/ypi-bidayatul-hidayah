"""FastAPI backend for YPI BIDAYATUL HIDAYAH (Inventaris Sekolah & Ujian UTBK)."""

from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from database import (
    get_connection,
    hash_password,
    init_db,
    now_iso,
    today_str,
    verify_password,
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="YPI BIDAYATUL HIDAYAH - Sistem Terpadu")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


# ---------------------------------------------------------------------------
# Auth Helpers
# ---------------------------------------------------------------------------

def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Silakan login terlebih dahulu.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token tidak valid.")

    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT u.id, u.username, u.role, u.full_name, u.kelas
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Sesi login berakhir. Silakan login kembali.")
        return dict(row)
    finally:
        conn.close()


def require_guru(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user["role"] != "guru":
        raise HTTPException(status_code=403, detail="Akses khusus akun Guru.")
    return user


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class LoginPayload(BaseModel):
    username: str
    password: str
    expected_role: str | None = None


class ChangePasswordPayload(BaseModel):
    old_password: str
    new_password: str = Field(min_length=4)


class StudentCreatePayload(BaseModel):
    username: str = Field(min_length=2)
    full_name: str = Field(min_length=2)
    kelas: int = Field(ge=1, le=12)
    password: str = Field(min_length=4)


class ConsumablePayload(BaseModel):
    nama_barang: str
    satuan: str = "Pcs"
    kategori: str = "ATK"
    jumlah_awal: int = Field(default=0, ge=0)
    barang_masuk: int = Field(default=0, ge=0)
    barang_dipakai: int = Field(default=0, ge=0)
    batas_menipis: int = Field(default=5, ge=0)
    lokasi_barang: str = ""


class ConsumableLogPayload(BaseModel):
    consumable_id: int | None = None
    tanggal: str = ""
    nama_barang: str = ""
    satuan: str = "Pcs"
    kategori: str = "ATK"
    jumlah_dipakai: int = Field(ge=1)
    pengguna: str = ""
    keterangan: str = ""


class BookPayload(BaseModel):
    nama_barang: str
    kategori_buku: str = "Buku Pelajaran Utama"
    jenjang_kelas: int = Field(default=1, ge=1, le=12)
    tahun_terbit: str = ""
    tanggal_masuk: str = ""
    jumlah_masuk: int = Field(default=0, ge=0)
    tanggal_keluar: str = ""
    jumlah_keluar: int = Field(default=0, ge=0)
    tanggal_pengembalian: str = ""
    jumlah_dikembalikan: int = Field(default=0, ge=0)
    kelayakan: str = "Layak"
    lokasi_buku: str = ""


class BookBorrowLogPayload(BaseModel):
    book_id: int | None = None
    tanggal_pinjam: str = ""
    nama_barang: str = ""
    kategori_buku: str = "Buku Pelajaran Utama"
    jenjang_kelas: int = Field(default=1, ge=1, le=12)
    peminjam: str = ""
    jumlah_dipinjam: int = Field(ge=1)
    keterangan: str = ""


class BookReturnPayload(BaseModel):
    tanggal_pengembalian: str = ""
    jumlah_dikembalikan: int = Field(ge=1)


class EquipmentPayload(BaseModel):
    nama_barang: str
    kategori: str = "Elektronik"
    stok_awal: int = Field(default=0, ge=0)
    stok_masuk: int = Field(default=0, ge=0)
    stok_keluar: int = Field(default=0, ge=0)
    kelayakan: str = "Layak"
    status: str = "Ada"
    lokasi_barang: str = ""


class EquipmentLogPayload(BaseModel):
    equipment_id: int | None = None
    tanggal: str = ""
    nama_barang: str = ""
    kategori: str = "Elektronik"
    jumlah_keluar: int = Field(ge=1)
    penerima_lokasi: str = ""
    keterangan: str = ""


class QuestionInput(BaseModel):
    pertanyaan: str
    opsi_a: str
    opsi_b: str
    opsi_c: str
    opsi_d: str
    opsi_e: str = ""
    kunci_jawaban: str
    pembahasan: str = ""


class ExamCreatePayload(BaseModel):
    judul: str
    pelajaran: str
    kelas: int = Field(ge=1, le=12)
    durasi_menit: int = Field(default=60, ge=1, le=300)
    questions: list[QuestionInput]


class ExamSubmitPayload(BaseModel):
    answers: dict[str, str]
    durasi_detik: int = 0


class AccessRequestPayload(BaseModel):
    note: str = ""


class UnlockAccessPayload(BaseModel):
    exam_id: int
    student_id: int


# ---------------------------------------------------------------------------
# Computed Inventory Formatters
# ---------------------------------------------------------------------------

def enrich_consumable(row: dict[str, Any]) -> dict[str, Any]:
    sisa = max(0, int(row["jumlah_awal"]) + int(row["barang_masuk"]) - int(row["barang_dipakai"]))
    batas = int(row.get("batas_menipis", 5))
    if sisa <= 0:
        status = "Habis"
    elif sisa <= batas:
        status = "Menipis"
    else:
        status = "Aman"
    row["sisa_barang"] = sisa
    row["status"] = status
    return row


def enrich_book(row: dict[str, Any]) -> dict[str, Any]:
    sisa = max(
        0,
        int(row["jumlah_masuk"]) - int(row["jumlah_keluar"]) + int(row["jumlah_dikembalikan"]),
    )
    row["sisa_buku"] = sisa
    return row


def enrich_equipment(row: dict[str, Any]) -> dict[str, Any]:
    sisa = max(0, int(row["stok_awal"]) + int(row["stok_masuk"]) - int(row["stok_keluar"]))
    row["sisa_stok"] = sisa
    return row


# ---------------------------------------------------------------------------
# Auth Routes
# ---------------------------------------------------------------------------

@app.post("/api/auth/login")
def login(payload: LoginPayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT * FROM users WHERE username = ?",
            (payload.username.strip(),),
        ).fetchone()
        if not user or not verify_password(payload.password, user["password_hash"], user["salt"]):
            raise HTTPException(status_code=401, detail="Username atau password salah.")
        if payload.expected_role and user["role"] != payload.expected_role:
            role_label = "Guru" if payload.expected_role == "guru" else "Siswa"
            raise HTTPException(
                status_code=403,
                detail=f"Akun ini bukan akun {role_label}. Silakan pilih tab peran yang sesuai.",
            )

        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user["id"], now_iso()),
        )
        conn.commit()
        return {
            "token": token,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "full_name": user["full_name"],
                "kelas": user["kelas"],
            },
        }
    finally:
        conn.close()


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        conn = get_connection()
        try:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
        finally:
            conn.close()
    return {"message": "Logout berhasil."}


@app.get("/api/auth/me")
def auth_me(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {"user": user}


@app.post("/api/auth/change-password")
def change_password(
    payload: ChangePasswordPayload,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, str]:
    conn = get_connection()
    try:
        db_user = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not db_user or not verify_password(
            payload.old_password, db_user["password_hash"], db_user["salt"]
        ):
            raise HTTPException(status_code=400, detail="Password lama tidak sesuai.")
        new_hash, new_salt = hash_password(payload.new_password)
        conn.execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
            (new_hash, new_salt, user["id"]),
        )
        conn.commit()
        return {"message": "Password berhasil diubah."}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Inventory Summary
# ---------------------------------------------------------------------------

@app.get("/api/inventory/summary")
def inventory_summary() -> dict[str, Any]:
    conn = get_connection()
    try:
        consumables = [
            enrich_consumable(dict(r))
            for r in conn.execute("SELECT * FROM consumables").fetchall()
        ]
        books = [enrich_book(dict(r)) for r in conn.execute("SELECT * FROM books").fetchall()]
        equipment = [
            enrich_equipment(dict(r))
            for r in conn.execute("SELECT * FROM equipment").fetchall()
        ]
        today = today_str()
        today_c_logs = conn.execute(
            "SELECT COUNT(*) FROM consumable_logs WHERE tanggal = ?", (today,)
        ).fetchone()[0]
        today_b_logs = conn.execute(
            "SELECT COUNT(*) FROM book_logs WHERE tanggal_pinjam = ?", (today,)
        ).fetchone()[0]
        today_e_logs = conn.execute(
            "SELECT COUNT(*) FROM equipment_logs WHERE tanggal = ?", (today,)
        ).fetchone()[0]

        return {
            "consumables": {
                "total_items": len(consumables),
                "total_sisa": sum(c["sisa_barang"] for c in consumables),
                "aman": sum(1 for c in consumables if c["status"] == "Aman"),
                "menipis": sum(1 for c in consumables if c["status"] == "Menipis"),
                "habis": sum(1 for c in consumables if c["status"] == "Habis"),
                "today_logs": today_c_logs,
            },
            "books": {
                "total_titles": len(books),
                "total_masuk": sum(b["jumlah_masuk"] for b in books),
                "total_sisa": sum(b["sisa_buku"] for b in books),
                "sedang_dipinjam": sum(
                    max(0, b["jumlah_keluar"] - b["jumlah_dikembalikan"]) for b in books
                ),
                "layak": sum(1 for b in books if b["kelayakan"] == "Layak"),
                "tidak_layak": sum(1 for b in books if b["kelayakan"] != "Layak"),
                "utama": sum(1 for b in books if b["kategori_buku"] == "Buku Pelajaran Utama"),
                "penunjang": sum(1 for b in books if b["kategori_buku"] != "Buku Pelajaran Utama"),
                "today_logs": today_b_logs,
            },
            "equipment": {
                "total_items": len(equipment),
                "total_sisa": sum(e["sisa_stok"] for e in equipment),
                "layak": sum(1 for e in equipment if e["kelayakan"] == "Layak"),
                "perlu_perbaikan": sum(
                    1 for e in equipment if e["kelayakan"] == "Perlu Perbaikan"
                ),
                "rusak": sum(1 for e in equipment if e["kelayakan"] == "Rusak"),
                "ada": sum(1 for e in equipment if e["status"] == "Ada"),
                "sedang_diperbaiki": sum(
                    1 for e in equipment if e["status"] == "Sedang Diperbaiki"
                ),
                "hilang": sum(1 for e in equipment if e["status"] == "Hilang"),
                "today_logs": today_e_logs,
            },
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Inventory: Barang Habis Pakai
# ---------------------------------------------------------------------------

@app.get("/api/inventory/consumables")
def list_consumables() -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM consumables ORDER BY id DESC").fetchall()
        return [enrich_consumable(dict(r)) for r in rows]
    finally:
        conn.close()


@app.post("/api/inventory/consumables")
def create_consumable(payload: ConsumablePayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """INSERT INTO consumables
            (nama_barang, satuan, kategori, jumlah_awal, barang_masuk, barang_dipakai, batas_menipis, lokasi_barang, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload.nama_barang.strip(),
                payload.satuan.strip(),
                payload.kategori.strip(),
                payload.jumlah_awal,
                payload.barang_masuk,
                payload.barang_dipakai,
                payload.batas_menipis,
                payload.lokasi_barang.strip(),
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM consumables WHERE id = ?", (cur.lastrowid,)).fetchone()
        return enrich_consumable(dict(row))
    finally:
        conn.close()


@app.put("/api/inventory/consumables/{item_id}")
def update_consumable(item_id: int, payload: ConsumablePayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """UPDATE consumables SET
            nama_barang = ?, satuan = ?, kategori = ?, jumlah_awal = ?, barang_masuk = ?,
            barang_dipakai = ?, batas_menipis = ?, lokasi_barang = ?, updated_at = ?
            WHERE id = ?""",
            (
                payload.nama_barang.strip(),
                payload.satuan.strip(),
                payload.kategori.strip(),
                payload.jumlah_awal,
                payload.barang_masuk,
                payload.barang_dipakai,
                payload.batas_menipis,
                payload.lokasi_barang.strip(),
                now_iso(),
                item_id,
            ),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Barang tidak ditemukan.")
        conn.commit()
        row = conn.execute("SELECT * FROM consumables WHERE id = ?", (item_id,)).fetchone()
        return enrich_consumable(dict(row))
    finally:
        conn.close()


@app.delete("/api/inventory/consumables/{item_id}")
def delete_consumable(item_id: int) -> dict[str, str]:
    conn = get_connection()
    try:
        cur = conn.execute("DELETE FROM consumables WHERE id = ?", (item_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Barang tidak ditemukan.")
        conn.commit()
        return {"message": "Barang berhasil dihapus."}
    finally:
        conn.close()


@app.delete("/api/inventory/consumables")
def delete_all_consumables() -> dict[str, str]:
    conn = get_connection()
    try:
        conn.execute("DELETE FROM consumables")
        conn.commit()
        return {"message": "Semua data barang habis pakai berhasil dihapus."}
    finally:
        conn.close()


@app.post("/api/inventory/consumables/import")
def import_consumables(items: list[ConsumablePayload]) -> dict[str, Any]:
    conn = get_connection()
    try:
        ts = now_iso()
        count = 0
        for item in items:
            if not item.nama_barang.strip():
                continue
            conn.execute(
                """INSERT INTO consumables
                (nama_barang, satuan, kategori, jumlah_awal, barang_masuk, barang_dipakai, batas_menipis, lokasi_barang, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item.nama_barang.strip(),
                    item.satuan.strip() or "Pcs",
                    item.kategori.strip() or "ATK",
                    item.jumlah_awal,
                    item.barang_masuk,
                    item.barang_dipakai,
                    item.batas_menipis,
                    item.lokasi_barang.strip(),
                    ts,
                ),
            )
            count += 1
        conn.commit()
        return {"imported": count}
    finally:
        conn.close()


@app.get("/api/inventory/consumables/logs")
def list_consumable_logs(tanggal: str | None = None) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        if tanggal:
            rows = conn.execute(
                "SELECT * FROM consumable_logs WHERE tanggal = ? ORDER BY id DESC",
                (tanggal,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM consumable_logs ORDER BY tanggal DESC, id DESC").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/inventory/consumables/logs")
def create_consumable_log(payload: ConsumableLogPayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        tanggal = payload.tanggal.strip() or today_str()
        nama = payload.nama_barang.strip()
        satuan = payload.satuan.strip()
        kategori = payload.kategori.strip()

        if payload.consumable_id:
            item = conn.execute(
                "SELECT * FROM consumables WHERE id = ?", (payload.consumable_id,)
            ).fetchone()
            if not item:
                raise HTTPException(status_code=404, detail="Barang habis pakai tidak ditemukan.")
            sisa = item["jumlah_awal"] + item["barang_masuk"] - item["barang_dipakai"]
            if payload.jumlah_dipakai > sisa:
                raise HTTPException(
                    status_code=400,
                    detail=f"Stok tersisa hanya {sisa} {item['satuan']}.",
                )
            nama = item["nama_barang"]
            satuan = item["satuan"]
            kategori = item["kategori"]
            conn.execute(
                "UPDATE consumables SET barang_dipakai = barang_dipakai + ?, updated_at = ? WHERE id = ?",
                (payload.jumlah_dipakai, now_iso(), payload.consumable_id),
            )

        cur = conn.execute(
            """INSERT INTO consumable_logs
            (consumable_id, tanggal, nama_barang, satuan, kategori, jumlah_dipakai, pengguna, keterangan, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload.consumable_id,
                tanggal,
                nama,
                satuan,
                kategori,
                payload.jumlah_dipakai,
                payload.pengguna.strip(),
                payload.keterangan.strip(),
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM consumable_logs WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.delete("/api/inventory/consumables/logs/{log_id}")
def delete_consumable_log(log_id: int) -> dict[str, str]:
    conn = get_connection()
    try:
        log = conn.execute("SELECT * FROM consumable_logs WHERE id = ?", (log_id,)).fetchone()
        if not log:
            raise HTTPException(status_code=404, detail="Catatan rekapan tidak ditemukan.")
        if log["consumable_id"]:
            conn.execute(
                "UPDATE consumables SET barang_dipakai = MAX(0, barang_dipakai - ?), updated_at = ? WHERE id = ?",
                (log["jumlah_dipakai"], now_iso(), log["consumable_id"]),
            )
        conn.execute("DELETE FROM consumable_logs WHERE id = ?", (log_id,))
        conn.commit()
        return {"message": "Catatan rekapan berhasil dihapus."}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Inventory: Buku
# ---------------------------------------------------------------------------

@app.get("/api/inventory/books")
def list_books() -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM books ORDER BY jenjang_kelas ASC, id DESC").fetchall()
        return [enrich_book(dict(r)) for r in rows]
    finally:
        conn.close()


@app.post("/api/inventory/books")
def create_book(payload: BookPayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """INSERT INTO books
            (nama_barang, kategori_buku, jenjang_kelas, tahun_terbit, tanggal_masuk, jumlah_masuk,
             tanggal_keluar, jumlah_keluar, tanggal_pengembalian, jumlah_dikembalikan, kelayakan, lokasi_buku, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload.nama_barang.strip(),
                payload.kategori_buku.strip(),
                payload.jenjang_kelas,
                payload.tahun_terbit.strip(),
                payload.tanggal_masuk.strip(),
                payload.jumlah_masuk,
                payload.tanggal_keluar.strip(),
                payload.jumlah_keluar,
                payload.tanggal_pengembalian.strip(),
                payload.jumlah_dikembalikan,
                payload.kelayakan.strip() or "Layak",
                payload.lokasi_buku.strip(),
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM books WHERE id = ?", (cur.lastrowid,)).fetchone()
        return enrich_book(dict(row))
    finally:
        conn.close()


@app.put("/api/inventory/books/{book_id}")
def update_book(book_id: int, payload: BookPayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """UPDATE books SET
            nama_barang = ?, kategori_buku = ?, jenjang_kelas = ?, tahun_terbit = ?,
            tanggal_masuk = ?, jumlah_masuk = ?, tanggal_keluar = ?, jumlah_keluar = ?,
            tanggal_pengembalian = ?, jumlah_dikembalikan = ?, kelayakan = ?, lokasi_buku = ?, updated_at = ?
            WHERE id = ?""",
            (
                payload.nama_barang.strip(),
                payload.kategori_buku.strip(),
                payload.jenjang_kelas,
                payload.tahun_terbit.strip(),
                payload.tanggal_masuk.strip(),
                payload.jumlah_masuk,
                payload.tanggal_keluar.strip(),
                payload.jumlah_keluar,
                payload.tanggal_pengembalian.strip(),
                payload.jumlah_dikembalikan,
                payload.kelayakan.strip() or "Layak",
                payload.lokasi_buku.strip(),
                now_iso(),
                book_id,
            ),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Buku tidak ditemukan.")
        conn.commit()
        row = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
        return enrich_book(dict(row))
    finally:
        conn.close()


@app.delete("/api/inventory/books/{book_id}")
def delete_book(book_id: int) -> dict[str, str]:
    conn = get_connection()
    try:
        cur = conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Buku tidak ditemukan.")
        conn.commit()
        return {"message": "Data buku berhasil dihapus."}
    finally:
        conn.close()


@app.delete("/api/inventory/books")
def delete_all_books() -> dict[str, str]:
    conn = get_connection()
    try:
        conn.execute("DELETE FROM books")
        conn.commit()
        return {"message": "Semua data buku berhasil dihapus."}
    finally:
        conn.close()


@app.post("/api/inventory/books/import")
def import_books(items: list[BookPayload]) -> dict[str, Any]:
    conn = get_connection()
    try:
        ts = now_iso()
        count = 0
        for item in items:
            if not item.nama_barang.strip():
                continue
            conn.execute(
                """INSERT INTO books
                (nama_barang, kategori_buku, jenjang_kelas, tahun_terbit, tanggal_masuk, jumlah_masuk,
                 tanggal_keluar, jumlah_keluar, tanggal_pengembalian, jumlah_dikembalikan, kelayakan, lokasi_buku, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item.nama_barang.strip(),
                    item.kategori_buku.strip() or "Buku Pelajaran Utama",
                    item.jenjang_kelas,
                    item.tahun_terbit.strip(),
                    item.tanggal_masuk.strip(),
                    item.jumlah_masuk,
                    item.tanggal_keluar.strip(),
                    item.jumlah_keluar,
                    item.tanggal_pengembalian.strip(),
                    item.jumlah_dikembalikan,
                    item.kelayakan.strip() or "Layak",
                    item.lokasi_buku.strip(),
                    ts,
                ),
            )
            count += 1
        conn.commit()
        return {"imported": count}
    finally:
        conn.close()


@app.get("/api/inventory/books/logs")
def list_book_logs(tanggal: str | None = None) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        if tanggal:
            rows = conn.execute(
                "SELECT * FROM book_logs WHERE tanggal_pinjam = ? ORDER BY id DESC",
                (tanggal,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM book_logs ORDER BY tanggal_pinjam DESC, id DESC"
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/inventory/books/logs")
def create_book_log(payload: BookBorrowLogPayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        tanggal_pinjam = payload.tanggal_pinjam.strip() or today_str()
        nama = payload.nama_barang.strip()
        kategori = payload.kategori_buku.strip()
        kelas = payload.jenjang_kelas

        if payload.book_id:
            book = conn.execute("SELECT * FROM books WHERE id = ?", (payload.book_id,)).fetchone()
            if not book:
                raise HTTPException(status_code=404, detail="Buku tidak ditemukan.")
            sisa = book["jumlah_masuk"] - book["jumlah_keluar"] + book["jumlah_dikembalikan"]
            if payload.jumlah_dipinjam > sisa:
                raise HTTPException(
                    status_code=400, detail=f"Sisa buku tersedia hanya {sisa} eksemplar."
                )
            nama = book["nama_barang"]
            kategori = book["kategori_buku"]
            kelas = book["jenjang_kelas"]
            conn.execute(
                "UPDATE books SET tanggal_keluar = ?, jumlah_keluar = jumlah_keluar + ?, updated_at = ? WHERE id = ?",
                (tanggal_pinjam, payload.jumlah_dipinjam, now_iso(), payload.book_id),
            )

        cur = conn.execute(
            """INSERT INTO book_logs
            (book_id, tanggal_pinjam, nama_barang, kategori_buku, jenjang_kelas, peminjam,
             jumlah_dipinjam, tanggal_pengembalian, jumlah_dikembalikan, keterangan, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?)""",
            (
                payload.book_id,
                tanggal_pinjam,
                nama,
                kategori,
                kelas,
                payload.peminjam.strip(),
                payload.jumlah_dipinjam,
                payload.keterangan.strip(),
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM book_logs WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.post("/api/inventory/books/logs/{log_id}/return")
def return_book_log(log_id: int, payload: BookReturnPayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        log = conn.execute("SELECT * FROM book_logs WHERE id = ?", (log_id,)).fetchone()
        if not log:
            raise HTTPException(status_code=404, detail="Catatan peminjaman tidak ditemukan.")
        belum_kembali = log["jumlah_dipinjam"] - log["jumlah_dikembalikan"]
        if payload.jumlah_dikembalikan > belum_kembali:
            raise HTTPException(
                status_code=400,
                detail=f"Jumlah dikembalikan melebihi sisa pinjaman ({belum_kembali}).",
            )
        tgl_kembali = payload.tanggal_pengembalian.strip() or today_str()
        conn.execute(
            "UPDATE book_logs SET tanggal_pengembalian = ?, jumlah_dikembalikan = jumlah_dikembalikan + ? WHERE id = ?",
            (tgl_kembali, payload.jumlah_dikembalikan, log_id),
        )
        if log["book_id"]:
            conn.execute(
                "UPDATE books SET tanggal_pengembalian = ?, jumlah_dikembalikan = jumlah_dikembalikan + ?, updated_at = ? WHERE id = ?",
                (tgl_kembali, payload.jumlah_dikembalikan, now_iso(), log["book_id"]),
            )
        conn.commit()
        row = conn.execute("SELECT * FROM book_logs WHERE id = ?", (log_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.delete("/api/inventory/books/logs/{log_id}")
def delete_book_log(log_id: int) -> dict[str, str]:
    conn = get_connection()
    try:
        log = conn.execute("SELECT * FROM book_logs WHERE id = ?", (log_id,)).fetchone()
        if not log:
            raise HTTPException(status_code=404, detail="Catatan peminjaman tidak ditemukan.")
        if log["book_id"]:
            conn.execute(
                """UPDATE books SET
                jumlah_keluar = MAX(0, jumlah_keluar - ?),
                jumlah_dikembalikan = MAX(0, jumlah_dikembalikan - ?),
                updated_at = ?
                WHERE id = ?""",
                (log["jumlah_dipinjam"], log["jumlah_dikembalikan"], now_iso(), log["book_id"]),
            )
        conn.execute("DELETE FROM book_logs WHERE id = ?", (log_id,))
        conn.commit()
        return {"message": "Catatan peminjaman buku berhasil dihapus."}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Inventory: Perlengkapan Sekolah
# ---------------------------------------------------------------------------

@app.get("/api/inventory/equipment")
def list_equipment() -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM equipment ORDER BY id DESC").fetchall()
        return [enrich_equipment(dict(r)) for r in rows]
    finally:
        conn.close()


@app.post("/api/inventory/equipment")
def create_equipment(payload: EquipmentPayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """INSERT INTO equipment
            (nama_barang, kategori, stok_awal, stok_masuk, stok_keluar, kelayakan, status, lokasi_barang, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload.nama_barang.strip(),
                payload.kategori.strip(),
                payload.stok_awal,
                payload.stok_masuk,
                payload.stok_keluar,
                payload.kelayakan.strip() or "Layak",
                payload.status.strip() or "Ada",
                payload.lokasi_barang.strip(),
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM equipment WHERE id = ?", (cur.lastrowid,)).fetchone()
        return enrich_equipment(dict(row))
    finally:
        conn.close()


@app.put("/api/inventory/equipment/{item_id}")
def update_equipment(item_id: int, payload: EquipmentPayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        cur = conn.execute(
            """UPDATE equipment SET
            nama_barang = ?, kategori = ?, stok_awal = ?, stok_masuk = ?, stok_keluar = ?,
            kelayakan = ?, status = ?, lokasi_barang = ?, updated_at = ?
            WHERE id = ?""",
            (
                payload.nama_barang.strip(),
                payload.kategori.strip(),
                payload.stok_awal,
                payload.stok_masuk,
                payload.stok_keluar,
                payload.kelayakan.strip() or "Layak",
                payload.status.strip() or "Ada",
                payload.lokasi_barang.strip(),
                now_iso(),
                item_id,
            ),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Perlengkapan tidak ditemukan.")
        conn.commit()
        row = conn.execute("SELECT * FROM equipment WHERE id = ?", (item_id,)).fetchone()
        return enrich_equipment(dict(row))
    finally:
        conn.close()


@app.delete("/api/inventory/equipment/{item_id}")
def delete_equipment(item_id: int) -> dict[str, str]:
    conn = get_connection()
    try:
        cur = conn.execute("DELETE FROM equipment WHERE id = ?", (item_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Perlengkapan tidak ditemukan.")
        conn.commit()
        return {"message": "Perlengkapan berhasil dihapus."}
    finally:
        conn.close()


@app.delete("/api/inventory/equipment")
def delete_all_equipment() -> dict[str, str]:
    conn = get_connection()
    try:
        conn.execute("DELETE FROM equipment")
        conn.commit()
        return {"message": "Semua data perlengkapan sekolah berhasil dihapus."}
    finally:
        conn.close()


@app.post("/api/inventory/equipment/import")
def import_equipment(items: list[EquipmentPayload]) -> dict[str, Any]:
    conn = get_connection()
    try:
        ts = now_iso()
        count = 0
        for item in items:
            if not item.nama_barang.strip():
                continue
            conn.execute(
                """INSERT INTO equipment
                (nama_barang, kategori, stok_awal, stok_masuk, stok_keluar, kelayakan, status, lokasi_barang, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item.nama_barang.strip(),
                    item.kategori.strip() or "Lainnya",
                    item.stok_awal,
                    item.stok_masuk,
                    item.stok_keluar,
                    item.kelayakan.strip() or "Layak",
                    item.status.strip() or "Ada",
                    item.lokasi_barang.strip(),
                    ts,
                ),
            )
            count += 1
        conn.commit()
        return {"imported": count}
    finally:
        conn.close()


@app.get("/api/inventory/equipment/logs")
def list_equipment_logs(tanggal: str | None = None) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        if tanggal:
            rows = conn.execute(
                "SELECT * FROM equipment_logs WHERE tanggal = ? ORDER BY id DESC",
                (tanggal,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM equipment_logs ORDER BY tanggal DESC, id DESC"
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/inventory/equipment/logs")
def create_equipment_log(payload: EquipmentLogPayload) -> dict[str, Any]:
    conn = get_connection()
    try:
        tanggal = payload.tanggal.strip() or today_str()
        nama = payload.nama_barang.strip()
        kategori = payload.kategori.strip()

        if payload.equipment_id:
            item = conn.execute(
                "SELECT * FROM equipment WHERE id = ?", (payload.equipment_id,)
            ).fetchone()
            if not item:
                raise HTTPException(status_code=404, detail="Perlengkapan tidak ditemukan.")
            sisa = item["stok_awal"] + item["stok_masuk"] - item["stok_keluar"]
            if payload.jumlah_keluar > sisa:
                raise HTTPException(
                    status_code=400, detail=f"Sisa stok tersedia hanya {sisa} unit."
                )
            nama = item["nama_barang"]
            kategori = item["kategori"]
            conn.execute(
                "UPDATE equipment SET stok_keluar = stok_keluar + ?, updated_at = ? WHERE id = ?",
                (payload.jumlah_keluar, now_iso(), payload.equipment_id),
            )

        cur = conn.execute(
            """INSERT INTO equipment_logs
            (equipment_id, tanggal, nama_barang, kategori, jumlah_keluar, penerima_lokasi, keterangan, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload.equipment_id,
                tanggal,
                nama,
                kategori,
                payload.jumlah_keluar,
                payload.penerima_lokasi.strip(),
                payload.keterangan.strip(),
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM equipment_logs WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.delete("/api/inventory/equipment/logs/{log_id}")
def delete_equipment_log(log_id: int) -> dict[str, str]:
    conn = get_connection()
    try:
        log = conn.execute("SELECT * FROM equipment_logs WHERE id = ?", (log_id,)).fetchone()
        if not log:
            raise HTTPException(status_code=404, detail="Catatan distribusi tidak ditemukan.")
        if log["equipment_id"]:
            conn.execute(
                "UPDATE equipment SET stok_keluar = MAX(0, stok_keluar - ?), updated_at = ? WHERE id = ?",
                (log["jumlah_keluar"], now_iso(), log["equipment_id"]),
            )
        conn.execute("DELETE FROM equipment_logs WHERE id = ?", (log_id,))
        conn.commit()
        return {"message": "Catatan distribusi perlengkapan berhasil dihapus."}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Guru: Student Management
# ---------------------------------------------------------------------------

@app.get("/api/guru/students")
def list_students(_: dict[str, Any] = Depends(require_guru)) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, username, full_name, kelas, created_at FROM users WHERE role = 'siswa' ORDER BY kelas ASC, full_name ASC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/guru/students")
def create_student(
    payload: StudentCreatePayload,
    _: dict[str, Any] = Depends(require_guru),
) -> dict[str, Any]:
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (payload.username.strip(),)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Username sudah digunakan.")
        pw_hash, salt = hash_password(payload.password)
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, salt, role, full_name, kelas, created_at) VALUES (?, ?, ?, 'siswa', ?, ?, ?)",
            (
                payload.username.strip(),
                pw_hash,
                salt,
                payload.full_name.strip(),
                payload.kelas,
                now_iso(),
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, username, full_name, kelas, created_at FROM users WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.delete("/api/guru/students/{student_id}")
def delete_student(
    student_id: int,
    _: dict[str, Any] = Depends(require_guru),
) -> dict[str, str]:
    conn = get_connection()
    try:
        cur = conn.execute(
            "DELETE FROM users WHERE id = ? AND role = 'siswa'", (student_id,)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Akun siswa tidak ditemukan.")
        conn.commit()
        return {"message": "Akun siswa berhasil dihapus."}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Exams & Question Bank
# ---------------------------------------------------------------------------

@app.get("/api/exams")
def list_exams(user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        exams = conn.execute(
            """
            SELECT e.*, u.full_name AS guru_name,
                   (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS total_soal
            FROM exams e
            LEFT JOIN users u ON u.id = e.created_by
            ORDER BY e.kelas ASC, e.id DESC
            """
        ).fetchall()
        result: list[dict[str, Any]] = []
        for row in exams:
            item = dict(row)
            if user["role"] == "siswa":
                access = conn.execute(
                    "SELECT * FROM exam_access WHERE exam_id = ? AND student_id = ?",
                    (item["id"], user["id"]),
                ).fetchone()
                latest_attempt = conn.execute(
                    "SELECT id, benar, total_soal, nilai, submitted_at FROM attempts WHERE exam_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1",
                    (item["id"], user["id"]),
                ).fetchone()
                attempt_count = conn.execute(
                    "SELECT COUNT(*) FROM attempts WHERE exam_id = ? AND student_id = ?",
                    (item["id"], user["id"]),
                ).fetchone()[0]
                item["is_locked"] = bool(access["is_locked"]) if access else False
                item["retake_requested"] = bool(access["retake_requested"]) if access else False
                item["attempt_count"] = attempt_count
                item["latest_attempt"] = dict(latest_attempt) if latest_attempt else None
            else:
                item["attempt_count"] = conn.execute(
                    "SELECT COUNT(*) FROM attempts WHERE exam_id = ?", (item["id"],)
                ).fetchone()[0]
            result.append(item)
        return result
    finally:
        conn.close()


@app.post("/api/exams")
def create_exam(
    payload: ExamCreatePayload,
    user: dict[str, Any] = Depends(require_guru),
) -> dict[str, Any]:
    if not payload.questions:
        raise HTTPException(status_code=400, detail="Minimal harus ada 1 soal.")

    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO exams (judul, pelajaran, kelas, durasi_menit, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                payload.judul.strip(),
                payload.pelajaran.strip(),
                payload.kelas,
                payload.durasi_menit,
                user["id"],
                now_iso(),
            ),
        )
        exam_id = cur.lastrowid
        for idx, q in enumerate(payload.questions, start=1):
            kunci = q.kunci_jawaban.strip().upper()
            if kunci not in {"A", "B", "C", "D", "E"}:
                raise HTTPException(
                    status_code=400,
                    detail=f"Soal nomor {idx}: kunci_jawaban harus A, B, C, D, atau E.",
                )
            conn.execute(
                """INSERT INTO questions
                (exam_id, nomor_urut, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, kunci_jawaban, pembahasan)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    exam_id,
                    idx,
                    q.pertanyaan.strip(),
                    q.opsi_a.strip(),
                    q.opsi_b.strip(),
                    q.opsi_c.strip(),
                    q.opsi_d.strip(),
                    q.opsi_e.strip(),
                    kunci,
                    q.pembahasan.strip(),
                ),
            )
        conn.commit()
        return {"id": exam_id, "message": "Paket soal berhasil disimpan."}
    finally:
        conn.close()


@app.get("/api/exams/{exam_id}")
def get_exam_detail_guru(
    exam_id: int,
    _: dict[str, Any] = Depends(require_guru),
) -> dict[str, Any]:
    """Guru ONLY: returns exam metadata + questions WITH kunci_jawaban and pembahasan."""
    conn = get_connection()
    try:
        exam = conn.execute("SELECT * FROM exams WHERE id = ?", (exam_id,)).fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Paket soal tidak ditemukan.")
        questions = conn.execute(
            "SELECT * FROM questions WHERE exam_id = ? ORDER BY nomor_urut ASC",
            (exam_id,),
        ).fetchall()
        data = dict(exam)
        data["questions"] = [dict(q) for q in questions]
        return data
    finally:
        conn.close()


@app.put("/api/exams/{exam_id}")
def update_exam(
    exam_id: int,
    payload: ExamCreatePayload,
    _: dict[str, Any] = Depends(require_guru),
) -> dict[str, Any]:
    if not payload.questions:
        raise HTTPException(status_code=400, detail="Minimal harus ada 1 soal.")

    conn = get_connection()
    try:
        exam = conn.execute("SELECT id FROM exams WHERE id = ?", (exam_id,)).fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Paket soal tidak ditemukan.")
        conn.execute(
            "UPDATE exams SET judul = ?, pelajaran = ?, kelas = ?, durasi_menit = ? WHERE id = ?",
            (
                payload.judul.strip(),
                payload.pelajaran.strip(),
                payload.kelas,
                payload.durasi_menit,
                exam_id,
            ),
        )
        conn.execute("DELETE FROM questions WHERE exam_id = ?", (exam_id,))
        for idx, q in enumerate(payload.questions, start=1):
            kunci = q.kunci_jawaban.strip().upper()
            if kunci not in {"A", "B", "C", "D", "E"}:
                raise HTTPException(
                    status_code=400,
                    detail=f"Soal nomor {idx}: kunci_jawaban harus A, B, C, D, atau E.",
                )
            conn.execute(
                """INSERT INTO questions
                (exam_id, nomor_urut, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, kunci_jawaban, pembahasan)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    exam_id,
                    idx,
                    q.pertanyaan.strip(),
                    q.opsi_a.strip(),
                    q.opsi_b.strip(),
                    q.opsi_c.strip(),
                    q.opsi_d.strip(),
                    q.opsi_e.strip(),
                    kunci,
                    q.pembahasan.strip(),
                ),
            )
        conn.commit()
        return {"id": exam_id, "message": "Paket soal berhasil diperbarui."}
    finally:
        conn.close()


@app.delete("/api/exams/{exam_id}")
def delete_exam(exam_id: int, _: dict[str, Any] = Depends(require_guru)) -> dict[str, str]:
    conn = get_connection()
    try:
        cur = conn.execute("DELETE FROM exams WHERE id = ?", (exam_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Paket soal tidak ditemukan.")
        conn.commit()
        return {"message": "Paket soal berhasil dihapus."}
    finally:
        conn.close()


@app.get("/api/exams/{exam_id}/take")
def take_exam(exam_id: int, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Starts or loads an exam session. Never exposes kunci_jawaban or pembahasan to Siswa."""
    conn = get_connection()
    try:
        exam = conn.execute("SELECT * FROM exams WHERE id = ?", (exam_id,)).fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Paket soal tidak ditemukan.")

        if user["role"] == "siswa":
            access = conn.execute(
                "SELECT is_locked FROM exam_access WHERE exam_id = ? AND student_id = ?",
                (exam_id, user["id"]),
            ).fetchone()
            if access and access["is_locked"] == 1:
                raise HTTPException(
                    status_code=403,
                    detail="Akses ujian terkunci karena sudah pernah dikerjakan. Silakan minta akses ke Guru.",
                )

        # Explicitly select ONLY student-safe columns (no kunci_jawaban, no pembahasan)
        questions = conn.execute(
            """SELECT id, nomor_urut, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e
               FROM questions WHERE exam_id = ? ORDER BY nomor_urut ASC""",
            (exam_id,),
        ).fetchall()

        data = dict(exam)
        data["questions"] = [dict(q) for q in questions]
        return data
    finally:
        conn.close()


@app.post("/api/exams/{exam_id}/submit")
def submit_exam(
    exam_id: int,
    payload: ExamSubmitPayload,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if user["role"] != "siswa":
        raise HTTPException(status_code=403, detail="Hanya akun Siswa yang dapat mengirim jawaban ujian.")

    conn = get_connection()
    try:
        exam = conn.execute("SELECT * FROM exams WHERE id = ?", (exam_id,)).fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Paket soal tidak ditemukan.")

        access = conn.execute(
            "SELECT is_locked FROM exam_access WHERE exam_id = ? AND student_id = ?",
            (exam_id, user["id"]),
        ).fetchone()
        if access and access["is_locked"] == 1:
            raise HTTPException(
                status_code=403,
                detail="Ujian sudah terkunci. Silakan minta akses ke Guru untuk mengerjakan ulang.",
            )

        questions = conn.execute(
            "SELECT id, nomor_urut, kunci_jawaban FROM questions WHERE exam_id = ? ORDER BY nomor_urut ASC",
            (exam_id,),
        ).fetchall()
        total_soal = len(questions)
        if total_soal == 0:
            raise HTTPException(status_code=400, detail="Paket soal belum memiliki pertanyaan.")

        benar = 0
        for q in questions:
            chosen = payload.answers.get(str(q["nomor_urut"])) or payload.answers.get(str(q["id"])) or ""
            if chosen.strip().upper() == q["kunci_jawaban"]:
                benar += 1

        # Nilai maksimal 100, bobot tiap soal sama = 100 / total_soal
        poin_per_soal = 100.0 / total_soal
        nilai = round(benar * poin_per_soal, 2)

        ts = now_iso()
        cur = conn.execute(
            """INSERT INTO attempts (exam_id, student_id, answers_json, benar, total_soal, nilai, durasi_detik, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                exam_id,
                user["id"],
                json.dumps(payload.answers),
                benar,
                total_soal,
                nilai,
                max(0, payload.durasi_detik),
                ts,
            ),
        )

        # Lock exam after 1 attempt
        conn.execute(
            """INSERT INTO exam_access (exam_id, student_id, is_locked, retake_requested, request_note, unlocked_at, updated_at)
            VALUES (?, ?, 1, 0, '', '', ?)
            ON CONFLICT(exam_id, student_id) DO UPDATE SET
                is_locked = 1,
                retake_requested = 0,
                updated_at = excluded.updated_at""",
            (exam_id, user["id"], ts),
        )
        conn.commit()

        return {
            "attempt_id": cur.lastrowid,
            "exam_judul": exam["judul"],
            "pelajaran": exam["pelajaran"],
            "kelas": exam["kelas"],
            "benar": benar,
            "salah": total_soal - benar,
            "total_soal": total_soal,
            "poin_per_soal": round(poin_per_soal, 2),
            "nilai": nilai,
            "submitted_at": ts,
            "is_locked": True,
        }
    finally:
        conn.close()


@app.post("/api/exams/{exam_id}/request-access")
def request_exam_access(
    exam_id: int,
    payload: AccessRequestPayload,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, str]:
    if user["role"] != "siswa":
        raise HTTPException(status_code=403, detail="Khusus akun Siswa.")
    conn = get_connection()
    try:
        access = conn.execute(
            "SELECT * FROM exam_access WHERE exam_id = ? AND student_id = ?",
            (exam_id, user["id"]),
        ).fetchone()
        if not access or access["is_locked"] == 0:
            return {"message": "Akses ujian saat ini sudah terbuka."}
        conn.execute(
            "UPDATE exam_access SET retake_requested = 1, request_note = ?, updated_at = ? WHERE exam_id = ? AND student_id = ?",
            (payload.note.strip(), now_iso(), exam_id, user["id"]),
        )
        conn.commit()
        return {"message": "Permintaan buka akses berhasil dikirim ke Guru."}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Recap & Access Management
# ---------------------------------------------------------------------------

@app.get("/api/guru/recap")
def guru_recap(
    nama: str | None = Query(default=None),
    kelas: int | None = Query(default=None),
    pelajaran: str | None = Query(default=None),
    min_nilai: float | None = Query(default=None),
    max_nilai: float | None = Query(default=None),
    _: dict[str, Any] = Depends(require_guru),
) -> dict[str, Any]:
    conn = get_connection()
    try:
        sql = """
            SELECT
                a.id AS attempt_id,
                a.exam_id,
                a.student_id,
                u.full_name AS student_name,
                u.username AS student_username,
                u.kelas AS student_kelas,
                e.judul AS exam_judul,
                e.pelajaran,
                e.kelas AS exam_kelas,
                a.benar,
                a.total_soal,
                a.nilai,
                a.durasi_detik,
                a.submitted_at,
                COALESCE(ea.is_locked, 0) AS is_locked,
                COALESCE(ea.retake_requested, 0) AS retake_requested
            FROM attempts a
            JOIN users u ON u.id = a.student_id
            JOIN exams e ON e.id = a.exam_id
            LEFT JOIN exam_access ea ON ea.exam_id = a.exam_id AND ea.student_id = a.student_id
            WHERE 1=1
        """
        params: list[Any] = []
        if nama:
            sql += " AND LOWER(u.full_name) LIKE ?"
            params.append(f"%{nama.strip().lower()}%")
        if kelas is not None:
            sql += " AND u.kelas = ?"
            params.append(kelas)
        if pelajaran:
            sql += " AND LOWER(e.pelajaran) = ?"
            params.append(pelajaran.strip().lower())
        if min_nilai is not None:
            sql += " AND a.nilai >= ?"
            params.append(min_nilai)
        if max_nilai is not None:
            sql += " AND a.nilai <= ?"
            params.append(max_nilai)

        sql += " ORDER BY a.submitted_at ASC, a.id ASC"
        rows = [dict(r) for r in conn.execute(sql, params).fetchall()]

        access_rows = [
            dict(r)
            for r in conn.execute(
                """
                SELECT ea.*, u.full_name AS student_name, u.username, u.kelas AS student_kelas,
                       e.judul AS exam_judul, e.pelajaran, e.kelas AS exam_kelas
                FROM exam_access ea
                JOIN users u ON u.id = ea.student_id
                JOIN exams e ON e.id = ea.exam_id
                ORDER BY ea.retake_requested DESC, ea.is_locked DESC, ea.updated_at DESC
                """
            ).fetchall()
        ]
        return {"attempts": rows, "access_list": access_rows}
    finally:
        conn.close()


@app.post("/api/guru/unlock-access")
def guru_unlock_access(
    payload: UnlockAccessPayload,
    _: dict[str, Any] = Depends(require_guru),
) -> dict[str, str]:
    conn = get_connection()
    try:
        ts = now_iso()
        conn.execute(
            """INSERT INTO exam_access (exam_id, student_id, is_locked, retake_requested, request_note, unlocked_at, updated_at)
            VALUES (?, ?, 0, 0, '', ?, ?)
            ON CONFLICT(exam_id, student_id) DO UPDATE SET
                is_locked = 0,
                retake_requested = 0,
                unlocked_at = excluded.unlocked_at,
                updated_at = excluded.updated_at""",
            (payload.exam_id, payload.student_id, ts, ts),
        )
        conn.commit()
        return {"message": "Akses ujian siswa berhasil dibuka kembali."}
    finally:
        conn.close()


@app.get("/api/siswa/recap")
def siswa_recap(
    pelajaran: str | None = Query(default=None),
    user: dict[str, Any] = Depends(get_current_user),
) -> list[dict[str, Any]]:
    if user["role"] != "siswa":
        raise HTTPException(status_code=403, detail="Khusus akun Siswa.")
    conn = get_connection()
    try:
        sql = """
            SELECT a.id AS attempt_id, a.exam_id, e.judul AS exam_judul, e.pelajaran, e.kelas,
                   a.benar, a.total_soal, a.nilai, a.durasi_detik, a.submitted_at
            FROM attempts a
            JOIN exams e ON e.id = a.exam_id
            WHERE a.student_id = ?
        """
        params: list[Any] = [user["id"]]
        if pelajaran:
            sql += " AND LOWER(e.pelajaran) = ?"
            params.append(pelajaran.strip().lower())
        sql += " ORDER BY a.submitted_at ASC, a.id ASC"
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Static Frontend Serving
# ---------------------------------------------------------------------------

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
