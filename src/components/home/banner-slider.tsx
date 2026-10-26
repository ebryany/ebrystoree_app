import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { homeBannerSlides } from "@/lib/website-settings";

export function BannerSlider({
  settings,
  mobilePreview = false,
}: {
  settings: Record<string, unknown>;
  mobilePreview?: boolean;
}) {
  const slides = homeBannerSlides(settings);
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!api) return;
    const update = () => setSelected(api.selectedScrollSnap());
    update();
    api.on("select", update).on("reInit", update);
    return () => {
      api.off("select", update).off("reInit", update);
    };
  }, [api]);

  if (!slides.length) return null;
  return (
    <Carousel
      aria-label="Banner Ebrystore"
      tabIndex={0}
      setApi={setApi}
      opts={{ loop: slides.length > 1, duration: reducedMotion ? 0 : 25 }}
      className="overflow-hidden rounded-2xl bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CarouselContent className="ml-0">
        {slides.map((slide, index) => (
          <CarouselItem
            key={`${index}-${slide.imageUrl}`}
            className="pl-0"
            data-banner-slide
            aria-label={`${index + 1} dari ${slides.length}`}
          >
            <picture>
              {slide.mobileUrl && !mobilePreview ? (
                <source media="(max-width: 639px)" srcSet={slide.mobileUrl} />
              ) : null}
              <img
                src={mobilePreview && slide.mobileUrl ? slide.mobileUrl : slide.imageUrl}
                alt={slide.alt}
                width={1200}
                height={400}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                /* Tinggi mengikuti rasio asli gambar (bukan dipotong), sehingga banner
                   menyesuaikan ukuran layar apa pun tanpa menyisakan area kosong. */
                className="block h-auto w-full"
                onError={(event) => {
                  // Sembunyikan seluruh slide, bukan hanya gambarnya, supaya tidak
                  // menyisakan kotak kosong di halaman.
                  const slide = event.currentTarget.closest("[data-banner-slide]");
                  if (slide instanceof HTMLElement) slide.hidden = true;
                }}
              />
            </picture>
          </CarouselItem>
        ))}
      </CarouselContent>
      {slides.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11"
            aria-label="Banner sebelumnya"
            onClick={() => api?.scrollPrev()}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <div className="flex flex-wrap justify-center" aria-label="Pilih banner">
            {slides.map((slide, index) => (
              <button
                key={`${index}-${slide.imageUrl}`}
                type="button"
                aria-label={`Tampilkan banner ${index + 1}`}
                aria-current={selected === index ? "true" : undefined}
                onClick={() => api?.scrollTo(index)}
                className="flex size-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={`h-1.5 rounded-full ${selected === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground"}`}
                />
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11"
            aria-label="Banner berikutnya"
            onClick={() => api?.scrollNext()}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <p className="sr-only" aria-live="polite">
            Banner {selected + 1} dari {slides.length}
          </p>
        </div>
      ) : null}
    </Carousel>
  );
}
