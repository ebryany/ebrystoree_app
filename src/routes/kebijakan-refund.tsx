import { createFileRoute, Link } from "@tanstack/react-router";

import { DocPage, DocSection, OwnerReview } from "@/components/legal-page";

export const Route = createFileRoute("/kebijakan-refund")({
  head: () => ({
    meta: [
      { title: "Kebijakan Refund Ebrystore" },
      {
        name: "description",
        content:
          "Ketentuan pengajuan refund Ebrystore: refund parsial, persetujuan admin, batas nilai refund, dan dampaknya pada akses produk digital.",
      },
      { property: "og:title", content: "Kebijakan Refund Ebrystore" },
      {
        property: "og:description",
        content: "Cara mengajukan refund dan ketentuan persetujuannya di Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RefundPolicy,
});

function RefundPolicy() {
  return (
    <DocPage
      title="Kebijakan refund"
      intro="Ketentuan berikut mengikuti aturan bisnis yang dipakai sistem Ebrystore saat memproses refund."
    >
      <DocSection heading="Cara mengajukan">
        <p>
          Refund diajukan dari halaman pesanan pada{" "}
          <Link to="/dashboard" className="text-primary hover:underline">akunmu</Link> dengan
          mencantumkan alasan. Pengajuan masuk ke antrean peninjauan admin.
        </p>
      </DocSection>

      <DocSection heading="Ketentuan utama">
        <ul className="list-disc space-y-2 pl-5">
          <li>Refund parsial dimungkinkan dan wajib memiliki nominal, alasan, serta persetujuan admin (BR-40).</li>
          <li>Total refund atas satu pesanan tidak boleh melebihi total yang sudah dibayar (BR-41).</li>
          <li>Refund atas produk digital mencabut akses unduhan yang terkait pesanan tersebut (BR-42).</li>
          <li>Setiap keputusan refund tercatat beserta alasannya pada riwayat pesanan.</li>
        </ul>
      </DocSection>

      <DocSection heading="Peninjauan">
        <p>
          Admin dapat menyetujui, menyetujui sebagian, atau menolak pengajuan disertai alasan. Status
          pengajuan terlihat pada halaman pesanan dan diperbarui saat keputusan dibuat.
        </p>
        <OwnerReview>
          Batas waktu maksimum peninjauan refund dan kanal pengembalian dana belum ditetapkan Owner.
        </OwnerReview>
      </DocSection>
    </DocPage>
  );
}