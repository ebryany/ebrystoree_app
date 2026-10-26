# 01 — Scope Layanan Pendampingan Akademik

Status: DRAFT (menunggu persetujuan Owner)

## Istilah publik

| Konteks | Istilah dipakai |
|---|---|
| Menu utama | Bantuan Tugas |
| Judul halaman | Pendampingan Tugas Kuliah |
| Tipe order | Pendampingan akademik |
| Pelaksana | Pendamping akademik (internal: operator) |
| Penilai kualitas | Reviewer akademik |

Istilah "joki" dihapus dari seluruh permukaan customer.

## Kategori akademik (sumber: tabel `categories`, kind = `service`)

Tugas Harian · Makalah · Presentasi · Proposal · Laporan Praktikum ·
Analisis Data · Pemrograman Akademik · Review Tulisan · Formatting ·
Sitasi dan Referensi · Revisi Dosen · Persiapan Sidang · Pendampingan Skripsi

Kategori tidak boleh di-hardcode di komponen; komponen membaca dari database.

## Scope yang diperbolehkan

Penjelasan materi, outline, review struktur, penyuntingan bahasa, formatting,
pemeriksaan sitasi, pencarian & ringkasan referensi, bimbingan analisis data,
bimbingan software akademik, feedback draft, persiapan presentasi, simulasi
tanya jawab, revisi berdasarkan feedback dosen.

## Scope yang dilarang (wajib ditolak → `rejected_scope`)

Mengerjakan ujian/kuis aktif, login LMS atau email kampus milik customer,
impersonasi, menghadiri kelas atas nama customer, pemalsuan data penelitian
atau referensi, plagiarisme dan penyamarannya, pemalsuan tanda tangan atau
persetujuan dosen, perubahan nilai, peretasan sistem kampus.

Penolakan wajib: alasan tercatat pada order, notifikasi ke customer, entri
`audit_logs` dengan action `order.scope_rejected`.

## Output per layanan contoh

| Layanan | Output wajib |
|---|---|
| Review Tugas | catatan kesalahan, saran perbaikan, struktur revisi, penjelasan konsep |
| Pendampingan Makalah | outline, review argumentasi, referensi, feedback draft, formatting |
| Analisis Data | panduan analisis, hasil pengolahan, interpretasi, langkah reproduksi, penjelasan metode |
| Pemrograman Akademik | penjelasan solusi, contoh kode, debugging, dokumentasi, walkthrough |

Hasil tanpa penjelasan tidak memenuhi Definition of Done.