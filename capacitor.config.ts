import type { CapacitorConfig } from "@capacitor/cli";

// Aplikasi memuat situs produksi langsung karena Ebrystore dirender di server (SSR).
// `webDir` hanya berisi halaman cadangan saat situs tidak bisa dijangkau.
const config: CapacitorConfig = {
  appId: "id.my.ebrystore.app",
  appName: "Ebrystore",
  webDir: "capacitor-shell",
  server: {
    url: "https://app.ebrystore.my.id",
    errorPath: "index.html",
    allowNavigation: ["app.ebrystore.my.id", "*.supabase.co"],
  },
  android: {
    backgroundColor: "#faf9f5",
  },
  ios: {
    backgroundColor: "#faf9f5",
    contentInset: "automatic",
  },
};

export default config;
