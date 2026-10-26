# Notification Matrix

Kanal MVP: in-app + email. Arsitektur notifier berbasis adapter agar WhatsApp/Telegram dapat ditambah tanpa mengubah pemanggil.

| Event | Penerima | Kanal | Prioritas | Retry |
|---|---|---|---|---|
| Registrasi berhasil | Customer | email, in-app | rendah | 3x |
| Order dibuat | Customer | email, in-app | normal | 3x |
| Invoice dibuat | Customer | email | normal | 3x |
| Menunggu pembayaran | Customer | in-app | normal | — |
| Pengingat pembayaran (H-1 kedaluwarsa) | Customer | email | normal | 3x |
| Pembayaran berhasil | Customer, Admin | email, in-app | tinggi | 5x |
| Pembayaran gagal/kedaluwarsa | Customer | email | normal | 3x |
| Bukti manual diunggah | Finance | in-app | tinggi | — |
| Pembayaran ditolak / upload ulang diminta | Customer | email, in-app | tinggi | 5x |
| Order menunggu penugasan | Admin | in-app | tinggi | — |
| Order ditugaskan | Operator | email, in-app | tinggi | 5x |
| Operator mulai bekerja | Customer | in-app | rendah | — |
| Progres diperbarui | Customer | in-app | rendah | — |
| Data pelanggan kurang | Customer | email, in-app | tinggi | 5x |
| Deadline mendekat (H-1) | Operator | in-app | normal | — |
| Order terlambat | Admin, Operator | email, in-app | tinggi | 5x |
| Hasil dikirim / review diminta | Customer | email, in-app | tinggi | 5x |
| Revisi diminta | Operator | email, in-app | tinggi | 5x |
| Revisi selesai | Customer | email, in-app | tinggi | 5x |
| Order selesai + minta ulasan | Customer | email, in-app | normal | 3x |
| Refund diajukan | Admin | in-app | tinggi | — |
| Refund disetujui/ditolak/selesai | Customer | email, in-app | tinggi | 5x |
| Komplain dibuat | Support | in-app | tinggi | — |
| Sengketa dibuka | Admin, Support | email, in-app | tinggi | 5x |

Setiap pengiriman menyimpan `notification_deliveries`: kanal, status, waktu kirim, percobaan, dan error terakhir. Kegagalan pengiriman tidak boleh menggagalkan transaksi bisnis (dikirim setelah commit).