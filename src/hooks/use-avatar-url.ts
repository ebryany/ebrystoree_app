import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

const PREFIX = "/api/public/avatar/";

/**
 * Foto profil disimpan di bucket privat `avatars`. Nilai `avatar_url` pada profil
 * hanya menyimpan referensi path; URL yang dapat dibuka dibuat sebagai signed URL
 * berumur pendek memakai sesi pengguna (RLS storage tetap berlaku).
 */
export function useAvatarUrl(value: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!value) {
      setUrl(null);
      return;
    }
    if (!value.startsWith(PREFIX)) {
      setUrl(value);
      return;
    }
    const path = value.slice(PREFIX.length);
    void supabase.storage
      .from("avatars")
      .createSignedUrl(path, 300)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [value]);

  return url;
}
