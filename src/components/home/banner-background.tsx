import { useState, type SyntheticEvent } from "react";

import { bannerAssetUrl, clampBannerPosition } from "@/lib/website-settings";

/**
 * Renderer background banner home, dipakai bersama oleh section pencarian home
 * dan preview admin. URL/posisi divalidasi ulang di sini agar nilai tersimpan
 * yang malformed jatuh ke panel netral, bukan merender URL arbitrary.
 * Mobile: strip gambar setinggi 6rem di atas konten (in-flow). Desktop:
 * layer absolut penuh di belakang backing konten.
 */

type Props = {
  mainUrl: unknown;
  mobileUrl: unknown;
  positionX: unknown;
  positionY: unknown;
};

export function BannerBackground({ mainUrl, mobileUrl, positionX, positionY }: Props) {
  const main = bannerAssetUrl(mainUrl);
  const [mainFailed, setMainFailed] = useState(false);
  const [mobileFailed, setMobileFailed] = useState(false);

  if (!main || mainFailed) return null;

  const mobileCandidate = bannerAssetUrl(mobileUrl);
  const mobile = mobileFailed || !mobileCandidate ? main : mobileCandidate;
  const objectPosition = `${clampBannerPosition(positionX)}% ${clampBannerPosition(positionY)}%`;

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    const current = event.currentTarget.currentSrc;
    if (mobileCandidate && mobileCandidate !== main && current.endsWith(mobileCandidate)) {
      setMobileFailed(true);
    } else {
      setMainFailed(true);
    }
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative h-24 w-full sm:absolute sm:inset-0 sm:h-auto sm:w-auto"
    >
      <picture>
        <source media="(max-width: 639px)" srcSet={mobile} />
        <img
          src={main}
          alt=""
          decoding="async"
          onError={handleError}
          style={{ objectPosition }}
          className="size-full object-cover"
        />
      </picture>
    </div>
  );
}
