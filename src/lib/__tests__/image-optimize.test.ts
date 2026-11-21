import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { optimizeRasterImage, parseImageTransform } from "@/lib/image-optimize.server";
import { optimizedMediaUrl } from "@/lib/utils";

describe("Proxy image optimization (sharp WebP + whitelisted widths)", () => {
  it("parses only whitelisted widths to prevent cache fragmentation / CPU DoS", () => {
    expect(parseImageTransform("https://app.ebrystore.my.id/api/public/catalog-image/a.png")).toEqual(
      { width: null, webp: false },
    );
    expect(
      parseImageTransform("https://app.ebrystore.my.id/api/public/catalog-image/a.png?w=480&fmt=webp"),
    ).toEqual({ width: 480, webp: true });
    expect(
      parseImageTransform("https://app.ebrystore.my.id/api/public/catalog-image/a.png?w=101"),
    ).toEqual({ width: null, webp: false });
  });

  it("resizes and converts PNG to smaller WebP when requested, while preserving original without params", async () => {
    const rawPng = await sharp({
      create: { width: 1000, height: 800, channels: 4, background: { r: 22, g: 98, b: 102, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const rawAb = rawPng.buffer.slice(rawPng.byteOffset, rawPng.byteOffset + rawPng.byteLength);

    const passthrough = await optimizeRasterImage(
      rawAb,
      "image/png",
      "https://app.ebrystore.my.id/api/public/catalog-image/products/test.png",
    );
    expect(passthrough.contentType).toBe("image/png");

    const resized = await optimizeRasterImage(
      rawAb,
      "image/png",
      "https://app.ebrystore.my.id/api/public/catalog-image/products/test.png?w=128&fmt=webp",
    );
    expect(resized.contentType).toBe("image/webp");
    const outMeta = await sharp(Buffer.from(resized.body as Uint8Array)).metadata();
    expect(outMeta.format).toBe("webp");
    expect(outMeta.width).toBe(128);
  });

  it("rewrites only internal raster proxy URLs in optimizedMediaUrl", () => {
    expect(optimizedMediaUrl("/api/public/catalog-image/products/a.png", 480)).toBe(
      "/api/public/catalog-image/products/a.png?w=480&fmt=webp",
    );
    expect(optimizedMediaUrl("/api/public/service-media/store/a.jpg", 480)).toBe(
      "/api/public/service-media/store/a.jpg?w=480&fmt=webp",
    );
    expect(optimizedMediaUrl("/api/public/service-media/store/demo.mp4", 480)).toBe(
      "/api/public/service-media/store/demo.mp4",
    );
    expect(optimizedMediaUrl("https://cdn.example.com/pic.png", 480)).toBe(
      "https://cdn.example.com/pic.png",
    );
  });
});
