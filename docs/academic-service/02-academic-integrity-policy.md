# 02 — Kebijakan Integritas Akademik

Status: DRAFT

## Prinsip

Ebrystore memberikan **pendampingan**, bukan penggantian tanggung jawab
akademik. Mahasiswa tetap wajib memahami, memeriksa, dan mempertanggungjawabkan
hasil sesuai aturan institusinya.

## Konfirmasi wajib sebelum checkout

Checkbox (tidak boleh dicentang otomatis, wajib untuk melanjutkan):

> Saya memahami bahwa layanan ini merupakan pendampingan akademik. Saya tetap
> bertanggung jawab untuk memahami, memeriksa, dan menggunakan hasil secara
> sesuai dengan aturan institusi saya.

Persetujuan disimpan pada `service_order_details.requirements.integrity`
beserta timestamp, dan divalidasi ulang di server (RPC `create_service_order`).
Order tanpa persetujuan ditolak di server, bukan hanya di UI.

## Data yang tidak boleh diminta

Password LMS, email kampus beserta kredensialnya, OTP, akun pribadi apa pun.
Form checkout tidak boleh memiliki field kredensial. Field "ID akun" yang ada
sekarang dihapus pada AS-2.

## Larangan operator

Operator dilarang login ke LMS/akun customer, menyamar sebagai customer,
mengunggah hasil langsung ke sistem kampus, atau menjanjikan nilai.

## Bahasa hasil pemeriksaan kesamaan

Gunakan "pemeriksaan kesamaan" dengan sumber dan skor. Dilarang mengklaim
"100% bebas plagiarisme" atau "dijamin lolos Turnitin".

## Penegakan

1. Admin melakukan `academic_review` pada setiap order berbayar.
2. Pelanggaran scope → `rejected_scope` + alasan + notifikasi + audit log.
3. Refund pelanggaran scope mengikuti kebijakan refund parsial dengan approval
   admin yang sudah berlaku.