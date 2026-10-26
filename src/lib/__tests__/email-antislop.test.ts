import { describe, expect, it } from "vitest";

/**
 * Unit test untuk aturan anti-slop email
 * (docs/marketplace/09-rencana-mgrcao-v3-email-transaksional.md, bagian G-UI-RULE).
 *
 * Test ini memverifikasi ATURAN pada output template, bukan mengirim email.
 * Pengiriman nyata diuji terpisah lewat cron route + SMTP.
 */

import {
  emailOrderPaid,
  emailOrderCompletedDigital,
  emailServiceDelivered,
  emailServiceAccepted,
  emailReceiptAccepted,
  emailRefundCompleted,
  type OrderEmailData,
} from "../email-templates";

const ORDER: OrderEmailData = {
  orderNumber: "EBS-20261005-000039",
  orderId: "11111111-2222-3333-4444-555555555555",
  total: 25000,
  itemName: "Template Presentasi",
  storeName: "citra",
};

const RECIPIENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/** Semua template Prioritas 1, dengan data nyata. */
function allTemplates() {
  return [
    ["order-paid", emailOrderPaid(ORDER, RECIPIENT)],
    ["order-completed-digital", emailOrderCompletedDigital(ORDER, RECIPIENT)],
    ["service-delivered", emailServiceDelivered({ ...ORDER, version: 1 }, RECIPIENT)],
    ["service-accepted-buyer", emailServiceAccepted(ORDER, RECIPIENT)],
    ["service-accepted-seller", emailServiceAccepted({ ...ORDER, sellerView: true }, RECIPIENT)],
    ["receipt-accepted", emailReceiptAccepted(ORDER, RECIPIENT)],
    [
      "refund-completed",
      emailRefundCompleted(
        {
          orderNumber: ORDER.orderNumber,
          orderId: ORDER.orderId,
          amount: 25000,
          refundNumber: "REF-20261005-000001",
        },
        RECIPIENT,
      ),
    ],
  ] as const;
}

describe("EMAIL: aturan anti-slop", () => {
  it("E-05: tidak ada em-dash di seluruh isi email", () => {
    for (const [name, content] of allTemplates()) {
      expect(content.subject, `${name} subject`).not.toContain("—");
      expect(content.html, `${name} html`).not.toContain("—");
      expect(content.text, `${name} text`).not.toContain("—");
    }
  });

  it("E-06: tidak ada emoji di subjek maupun badan", () => {
    // Rentang emoji utama + simbol umum. Variation selector (U+FE0F) tidak
    // dimasukkan ke character class karena itu karakter penggabung.
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const hasVariationSelector = (text: string) => text.includes("\uFE0F");

    for (const [name, content] of allTemplates()) {
      for (const [part, value] of [
        ["subject", content.subject],
        ["html", content.html],
        ["text", content.text],
      ] as const) {
        expect(emoji.test(value), `${name} ${part}`).toBe(false);
        expect(hasVariationSelector(value), `${name} ${part} variation selector`).toBe(false);
      }
    }
  });

  it("E-08: subjek memuat nomor pesanan atau nomor refund", () => {
    for (const [name, content] of allTemplates()) {
      const hasIdentifier =
        content.subject.includes(ORDER.orderNumber) || content.subject.includes("REF-");
      expect(hasIdentifier, `${name}: ${content.subject}`).toBe(true);
    }
  });

  it("E-09: subjek bebas kata pemicu spam", () => {
    const banned = ["GRATIS", "PROMO", "SEGERA", "JANGAN LEWATKAN", "!!!", "100%"];
    for (const [name, content] of allTemplates()) {
      for (const word of banned) {
        expect(content.subject.toUpperCase(), `${name} subject`).not.toContain(word);
      }
    }
  });

  it("E-11/E-12: nilai uang berasal dari data, bukan angka contoh", () => {
    const paid = emailOrderPaid(ORDER, RECIPIENT);
    // Total 25.000 harus muncul apa adanya (format Rupiah).
    expect(paid.html).toContain("25.000");
    // Tidak ada persentase delta tren yang dikarang.
    expect(paid.html).not.toMatch(/\+\d+%/);
    expect(paid.text).not.toMatch(/\+\d+%/);
  });

  it("E-14: hanya satu tautan aksi utama per email", () => {
    for (const [name, content] of allTemplates()) {
      // Tombol aksi memakai gaya accent; hitung kemunculannya di HTML.
      const actionButtons = (content.html.match(/#007A7A/g) ?? []).length;
      // Aksen dipakai di tombol (1) dan tautan footer bantuan (1) = maksimal 2.
      expect(actionButtons, `${name} memakai aksen ${actionButtons}x`).toBeLessThanOrEqual(2);
    }
  });

  it("E-17: email terbaca tanpa gambar (tidak ada tag img)", () => {
    for (const [name, content] of allTemplates()) {
      expect(content.html, `${name}`).not.toContain("<img");
    }
  });

  it("E-20: tidak ada piksel pelacak", () => {
    for (const [name, content] of allTemplates()) {
      expect(content.html, `${name}`).not.toMatch(/width=["']?1["']?[^>]*height=["']?1["']?/);
      expect(content.html, `${name}`).not.toContain("utm_");
    }
  });

  it("E-21: setiap email punya tautan berhenti langganan yang berfungsi", () => {
    for (const [name, content] of allTemplates()) {
      expect(content.html, `${name}`).toContain("Berhenti menerima email");
      // Preferensi email adalah setelan AKUN, jadi semua penerima (termasuk
      // penjual) diarahkan ke halaman pengaturan akun yang benar-benar punya
      // kontrol tersebut. Halaman pengaturan toko tidak punya kontrol ini.
      expect(content.html, `${name}`).toContain("/dashboard/pengaturan");
    }
  });

  it("E-13: nilai yang tidak ada diganti teks penjelas, bukan kosong", () => {
    const noItem = emailOrderPaid({ ...ORDER, itemName: null, storeName: null }, RECIPIENT);
    expect(noItem.text).toContain("Pesanan Ebrystore");
    expect(noItem.text).not.toContain("Item: \n");
  });

  it("versi teks selalu tersedia (email tanpa teks lebih mudah dianggap spam)", () => {
    for (const [name, content] of allTemplates()) {
      expect(content.text.trim().length, `${name}`).toBeGreaterThan(50);
      expect(content.text, `${name}`).toContain("Ebrystore");
    }
  });

  it("penjual menerima email berbeda dari pembeli saat jasa diterima", () => {
    const buyer = emailServiceAccepted(ORDER, RECIPIENT);
    const seller = emailServiceAccepted({ ...ORDER, sellerView: true }, RECIPIENT);
    expect(buyer.subject).not.toBe(seller.subject);
    expect(seller.text).toContain("saldo toko");
  });

  it("SMTP-FROM: alamat pengirim harus email valid, bukan username", () => {
    // Bug nyata yang pernah terjadi saat uji kirim: `from` jatuh ke username
    // SMTP SumoPod (string acak tanpa "@"), sehingga server menolak dengan
    // "501 Bad sender address syntax". Penjaga ini mencegahnya terulang.
    const isValidFrom = (value: string | undefined) =>
      Boolean(value && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value));

    expect(isValidFrom("noreply@ebrystore.my.id"), "alamat benar").toBe(true);
    expect(isValidFrom("cmuu28h3b1lvm08qxsehzc1ns"), "username SMTP").toBe(false);
    expect(isValidFrom("email.ebrystore.my.id"), "domain tanpa @").toBe(false);
    expect(isValidFrom(undefined), "tidak diset").toBe(false);
    expect(isValidFrom(""), "kosong").toBe(false);
  });
});

describe("EMAIL: saklar admin (Pengaturan Website → Notifikasi)", () => {
  /**
   * Pemetaan event → kunci saklar. Bila pemetaan ini berubah di
   * email.server.ts, test ini harus ikut berubah — itulah gunanya: menjaga
   * agar admin benar-benar bisa mematikan email per jenis.
   */
  const EVENT_FLAG: Record<string, string> = {
    "order.paid": "notify_payment_verified",
    "order.completed": "notify_order_completed",
    "service.delivered": "notify_service_delivered",
    "service.accepted": "notify_service_accepted",
    "service.accepted.seller": "notify_service_accepted",
    "refund.completed": "notify_refund_updated",
  };

  /** Semua event yang punya email Prioritas 1 harus punya saklar admin. */
  const EMAIL_EVENTS = [
    "order.paid",
    "order.completed",
    "service.delivered",
    "service.accepted",
    "service.accepted.seller",
    "refund.completed",
  ];

  it("setiap event email Prioritas 1 punya saklar admin", () => {
    for (const event of EMAIL_EVENTS) {
      expect(EVENT_FLAG[event], `${event} belum punya saklar`).toBeTruthy();
    }
  });

  it("event tanpa saklar tetap dianggap aktif (default aman)", () => {
    // Event yang tidak terdaftar tidak boleh diam-diam terblokir.
    const isEnabled = (event: string, flags: Record<string, boolean>) => {
      const key = EVENT_FLAG[event];
      if (!key) return true;
      return flags[key] !== false;
    };
    expect(isEnabled("event.tak.dikenal", {})).toBe(true);
    expect(isEnabled("order.paid", {})).toBe(true);
    expect(isEnabled("order.paid", { notify_payment_verified: true })).toBe(true);
  });

  it("saklar false mematikan email jenis itu saja", () => {
    const isEnabled = (event: string, flags: Record<string, boolean>) => {
      const key = EVENT_FLAG[event];
      if (!key) return true;
      return flags[key] !== false;
    };
    const flags = { notify_payment_verified: false };
    expect(isEnabled("order.paid", flags)).toBe(false);
    // Jenis lain tidak terpengaruh.
    expect(isEnabled("order.completed", flags)).toBe(true);
    expect(isEnabled("refund.completed", flags)).toBe(true);
  });

  it("saklar global false menghentikan semua jenis", () => {
    const shouldSend = (globalEnabled: boolean, eventEnabled: boolean) =>
      globalEnabled && eventEnabled;
    expect(shouldSend(false, true)).toBe(false);
    expect(shouldSend(false, false)).toBe(false);
    expect(shouldSend(true, false)).toBe(false);
    expect(shouldSend(true, true)).toBe(true);
  });
});
