import { createFileRoute } from "@tanstack/react-router";

import { DocPage, DocSection, OwnerReview } from "@/components/legal-page";

export const Route = createFileRoute("/kebijakan-privasi")({
  head: () => ({
    meta: [
      { title: "Kebijakan Privasi Ebrystore" },
      {
        name: "description",
        content:
          "Data apa yang dikumpulkan Ebrystore saat kamu memesan, bagaimana data dipakai, siapa yang bisa mengaksesnya, dan cara mengajukan permintaan data.",
      },
      { property: "og:title", content: "Kebijakan Privasi Ebrystore" },
      {
        property: "og:description",
        content: "Penjelasan pengumpulan dan penggunaan data akun serta pesanan di Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <DocPage
      title="Kebijakan privasi"
      intro="Halaman ini menjelaskan data yang benar-benar diproses aplikasi Ebrystore saat kamu memakai layanannya."
    >
      <DocSection heading="Data yang dikumpulkan">
        <ul className="list-disc space-y-2 pl-5">
          <li>Data akun: email, nama, dan nomor telepon bila kamu mengisinya.</li>
          <li>Data pesanan: item yang dipesan, catatan kebutuhan, nilai pesanan, dan riwayat status.</li>
          <li>Data pembayaran: bukti transfer yang kamu unggah beserta catatan verifikasinya.</li>
          <li>Catatan aktivitas sistem untuk keperluan audit dan penanganan sengketa.</li>
        </ul>
      </DocSection>

      <DocSection heading="Penggunaan data">
        <ul className="list-disc space-y-2 pl-5">
          <li>Memproses pesanan, verifikasi pembayaran, dan pengiriman hasil.</li>
          <li>Menyediakan riwayat pesanan dan akses produk digital pada akunmu.</li>
          <li>Menangani revisi, sengketa, dan pengajuan refund.</li>
        </ul>
      </DocSection>

      <DocSection heading="Akses data">
        <ul className="list-disc space-y-2 pl-5">
          <li>Data pesanan hanya dapat diakses pemilik akun dan staf berwenang sesuai perannya.</li>
          <li>Operator hanya melihat pesanan yang ditugaskan kepadanya.</li>
          <li>Bukti pembayaran disimpan pada penyimpanan privat, bukan tautan publik.</li>
        </ul>
      </DocSection>

      <DocSection heading="Penyimpanan dan permintaan data">
        <p>
          Data pesanan disimpan sebagai catatan transaksi. Permintaan koreksi atau penghapusan data
          dapat diajukan melalui pesanan terkait.
        </p>
        <OwnerReview>
          Masa simpan data, daftar pihak ketiga pemroses data, dan kanal permintaan privasi resmi belum
          ditetapkan Owner.
        </OwnerReview>
      </DocSection>
    </DocPage>
  );
}