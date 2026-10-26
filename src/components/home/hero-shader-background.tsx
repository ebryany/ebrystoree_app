"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";

import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Latar gradien bergerak untuk hero, memakai @shadergradient/react (three.js).
 *
 * Tiga keputusan penting, masing-masing punya alasan:
 *
 * 1. Dimuat dinamis di dalam `useEffect`, bukan diimpor di tingkat modul.
 *    three.js memakai API browser; kalau ikut ke bundel server, render SSR bisa
 *    gagal. Dengan impor dinamis, paketnya hanya diunduh di browser, dan baru
 *    setelah hero benar-benar terlihat.
 *
 * 2. `lightType="3d"`, bukan `"env"`. Mode `"env"` memuat tekstur HDR dari
 *    `https://ruucm.github.io/...` yang akan diblokir CSP proyek (`connect-src`
 *    hanya 'self', Supabase, dan *.lovable.app) dan melanggar aturan DESIGN.md
 *    soal CDN eksternal. Mode `"3d"` hanya butuh ambient light, jadi berjalan
 *    penuh dari bundel sendiri.
 *
 * 3. Selalu ada pengganti statis. Gradien CSS dengan warna yang sama dipakai
 *    saat: pengguna memilih gerak minimal, WebGL tidak tersedia, atau kanvas
 *    belum siap. Jadi tidak pernah ada kotak kosong.
 *
 * Kanvas murni dekorasi: `pointer-events-none` dan `aria-hidden`, sehingga tidak
 * pernah menutupi tombol atau terbaca pembaca layar.
 */

const COLORS = {
  color1: "#73bfc4",
  color2: "#ff810a",
  color3: "#8da0ce",
};

type ShaderModules = {
  Canvas: ComponentType<Record<string, unknown>>;
  Gradient: ComponentType<Record<string, unknown>>;
};

/** Gradien CSS pengganti: warna sama, tanpa WebGL. */
const FALLBACK =
  "bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#73bfc4_0%,transparent_55%),radial-gradient(ellipse_70%_50%_at_80%_30%,#8da0ce_0%,transparent_60%),radial-gradient(ellipse_60%_50%_at_20%_40%,#ff810a_0%,transparent_55%)]";

/** Cek dukungan WebGL sekali, tanpa membuat konteks yang menetap. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function HeroShaderBackground() {
  const isMobile = useIsMobile();
  const hostRef = useRef<HTMLDivElement>(null);
  const [modules, setModules] = useState<ShaderModules | null>(null);
  const [reduced, setReduced] = useState(false);

  // Hormati preferensi gerak minimal.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Muat three.js hanya setelah hero terlihat, dan hanya kalau perangkatnya
  // sanggup. `alive` mencegah setState setelah komponen dilepas.
  useEffect(() => {
    if (reduced || !hasWebGL()) return;
    const host = hostRef.current;
    if (!host) return;

    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void import("@shadergradient/react")
          .then((mod) => {
            if (!alive) return;
            setModules({
              Canvas: mod.ShaderGradientCanvas as ShaderModules["Canvas"],
              Gradient: mod.ShaderGradient as ShaderModules["Gradient"],
            });
          })
          .catch(() => {
            // Gagal memuat paket: biarkan pengganti statis yang tampil.
          });
      },
      { rootMargin: "200px" },
    );
    observer.observe(host);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [reduced]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Pengganti statis selalu ada di bawah kanvas, jadi tidak ada momen kosong. */}
      <div className={`size-full opacity-25 ${FALLBACK}`} />

      {modules ? (
        <div className="absolute inset-0">
          <modules.Canvas
            style={{ width: "100%", height: "100%" }}
            pixelDensity={isMobile ? 1 : 1.5}
            pointerEvents="none"
          >
            <modules.Gradient
              animate="on"
              type="sphere"
              wireframe={false}
              shader="defaults"
              uTime={0}
              uSpeed={0.3}
              uStrength={0.3}
              uDensity={0.8}
              uFrequency={5.5}
              uAmplitude={3.2}
              positionX={-0.1}
              positionY={0}
              positionZ={0}
              rotationX={0}
              rotationY={130}
              rotationZ={70}
              color1={COLORS.color1}
              color2={COLORS.color2}
              color3={COLORS.color3}
              reflection={0.4}
              cAzimuthAngle={270}
              cPolarAngle={180}
              cDistance={0.5}
              cameraZoom={15.1}
              lightType="3d"
              brightness={0.8}
              grain="on"
              toggleAxis={false}
              zoomOut={false}
              hoverState=""
              enableTransition={false}
            />
          </modules.Canvas>
        </div>
      ) : null}
    </div>
  );
}
