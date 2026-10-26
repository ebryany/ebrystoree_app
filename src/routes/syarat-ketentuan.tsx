import { createFileRoute, Link } from "@tanstack/react-router";

import { DocPage, DocSection, OwnerReview } from "@/components/legal-page";

export const Route = createFileRoute("/syarat-ketentuan")({
  head: () => ({
    meta: [
      { title: "Syarat & Ketentuan Ebrystore" },
      {
        name: "description",
        content:
          "Ketentuan penggunaan Ebrystore: pemesanan, pembayaran, penyelesaian layanan, akses produk digital, dan tanggung jawab pengguna.",
      },
      { property: "og:title", content: "Syarat & Ketentuan Ebrystore" },
      {
        property: "og:description",
        content: "Ketentuan pemesanan, pembayaran, dan penyelesaian pesanan di Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <DocPage
      title="Syarat & ketentuan"
      intro="Ketentuan ini menjelaskan cara Ebrystore memproses pesanan dan apa yang diharapkan dari pengguna."
    >
      <DocSection heading="Akun">
        <ul className="list-disc space-y-2 pl-5">
          <li>Pemesanan memerlukan akun agar pesanan, pembayaran, dan hasil tercatat.</li>
          <li>Kamu bertanggung jawab menjaga kerahasiaan akses akunmu.</li>
          <li>Data pesanan hanya dapat dilihat pemilik akun dan staf yang berwenang.</li>
        </ul>
      </DocSection>

      <DocSection heading="Pemesanan dan harga">
        <ul className="list-disc space-y-2 pl-5">
          <li>Total pesanan dihitung ulang di sisi server saat pesanan dibuat.</li>
          <li>Checkout dilakukan terpisah antara produk digital dan layanan.</li>
          <li>Biaya admin, bila ada, ditampilkan sebagai baris terpisah pada rincian pesanan.</li>
        </ul>
      </DocSection>

      <DocSection heading="Pembayaran">
        <ul className="list-disc space-y-2 pl-5">
          <li>Nominal transfer harus sama persis dengan total pesanan (BR-60).</li>
          <li>Batas pembayaran manual 24 jam sejak pesanan dibuat; setelah itu pembayaran kedaluwarsa (BR-61).</li>
          <li>Bukti transfer diverifikasi tim keuangan sebelum pesanan diproses (BR-63).</li>
          <li>Unggah ulang bukti dibatasi 3 kali per pembayaran (BR-64).</li>
        </ul>
      </DocSection>

      <DocSection heading="Produk digital">
        <ul className="list-disc space-y-2 pl-5">
          <li>Akses unduhan terbit setelah pembayaran diverifikasi.</li>
          <li>Kuota default 5 kali unduh dan masa aktif 365 hari, dapat berbeda per produk (BR-21).</li>
          <li>File tidak untuk didistribusikan ulang tanpa izin pemilik hak.</li>
        </ul>
      </DocSection>

      <DocSection heading="Layanan">
        <ul className="list-disc space-y-2 pl-5">
          <li>Estimasi waktu pengerjaan mengikuti paket yang dipilih dan mulai berjalan setelah kebutuhan lengkap.</li>
          <li>Jumlah revisi gratis mengikuti paket; kelebihannya mengikuti ketentuan paket (BR-32).</li>
          <li>Keterlambatan pengiriman kebutuhan dari pelanggan dapat menggeser estimasi penyelesaian.</li>
        </ul>
      </DocSection>

      <DocSection heading="Pembatalan dan refund">
        <p>
          Pembatalan dan refund mengikuti{" "}
          <Link to="/kebijakan-refund" className="text-primary hover:underline">Kebijakan refund</Link>.
        </p>
      </DocSection>

      <DocSection heading="Perubahan ketentuan">
        <p>Ketentuan dapat diperbarui. Tanggal pembaruan tercantum pada bagian atas halaman ini.</p>
        <OwnerReview>
          Identitas badan usaha, domisili hukum, dan mekanisme penyelesaian sengketa belum ditetapkan
          Owner sehingga tidak dicantumkan.
        </OwnerReview>
      </DocSection>
    </DocPage>
  );
}