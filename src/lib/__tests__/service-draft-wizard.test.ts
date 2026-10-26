import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wizard = readFileSync("src/components/seller/service-draft-wizard.tsx", "utf8");
const catalog = readFileSync("src/components/seller/marketplace-service-catalog.tsx", "utf8");
const editor = readFileSync("src/components/seller/service-media-editor.tsx", "utf8");

describe("service draft wizard (static source contract)", () => {
  it("defines four ordered steps with hints", () => {
    for (const label of ["Informasi", "Kesepakatan", "Media", "Tinjau"]) {
      expect(wizard).toContain(`label: "${label}"`);
    }
    const order = ["Informasi", "Kesepakatan", "Media", "Tinjau"].map((label) =>
      wizard.indexOf(`label: "${label}"`),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(wizard).toContain("STEPS[step].hint");
  });

  it("shows position and progress in the stepper", () => {
    expect(wizard).toContain("Langkah {step + 1} dari {STEPS.length}");
    expect(wizard).toContain('aria-label="Langkah menambahkan jasa"');
    expect(wizard).toContain('aria-current={active ? "step" : undefined}');
    expect(wizard).toContain("<Check");
  });

  it("validates each step before advancing and keeps the message specific", () => {
    expect(wizard).toContain("function stepError(step: StepKey, state: DraftState)");
    expect(wizard).toContain("marketplaceServiceAgreementSchema.safeParse");
    expect(wizard).toContain("Nama jasa minimal 3 karakter.");
    expect(wizard).toContain("Pilih kategori jasa.");
    expect(wizard).toContain("Harga minimal Rp 1.");
    expect(wizard).toContain("Lingkup pekerjaan minimal 10 karakter.");
    expect(wizard).toContain("Durasi harus bilangan bulat minimal 1 hari.");
    expect(wizard).toContain("if (message) {");
    expect(wizard).toContain("setStep((prev) => Math.min(STEPS.length - 1, prev + 1))");
  });

  it("keeps entered values across steps in one state object", () => {
    expect(wizard).toContain("const [state, setState] = useState<DraftState>");
    expect(wizard).toContain("setState((prev) => ({ ...prev, ...next }))");
    expect(wizard).toContain("value={state.name}");
    expect(wizard).toContain("value={state[field]}");
    expect(wizard).toContain("value={state.price}");
  });

  it("saves only on the last step with the shared schema", () => {
    expect(wizard).toContain("marketplaceServiceDraftSchema.safeParse");
    expect(wizard).toContain("step < STEPS.length - 1");
    expect(wizard).toContain("Simpan jasa");
    expect(wizard).toContain("onSave(parsed.data)");
  });

  it("offers a review summary with links back to each step", () => {
    expect(wizard).toContain("Ubah");
    expect(wizard).toContain("onClick={() => setStep(0)}");
    expect(wizard).toContain("onClick={() => setStep(1)}");
    expect(wizard).toContain("onClick={() => setStep(2)}");
    expect(wizard).toContain("Jasa tanpa media tetap dapat diajukan");
  });

  it("reuses the media editor and respects busy and reduced motion", () => {
    expect(wizard).toContain("ServiceMediaEditor");
    expect(wizard).toContain("const busy = pending || mediaBusy");
    expect(wizard).toContain("useReducedMotion");
    expect(wizard).toContain("min-h-11");
  });

  it("is wired into the seller catalog and the old inline form is gone", () => {
    expect(catalog).toContain("ServiceDraftWizard");
    expect(catalog).not.toContain("ServiceDraftForm");
    expect(catalog).toContain("Tambahkan Jasa");
    expect(catalog).toContain("Jasa Saya");
  });

  it("keeps the media editor limits and labels intact", () => {
    expect(editor).toContain("MARKETPLACE_SERVICE_MEDIA_MAX");
    expect(editor).toContain("Ukuran gambar maksimal 5 MB.");
    expect(editor).toContain("Ukuran video maksimal 25 MB.");
    expect(editor).toContain("Sampul");
  });
});
