<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Deploy

Urutan wajib setiap rilis — jangan dilewati atau dibalik:

1. Build (`$env:NITRO_PRESET='node-server'; npm run build`).
2. Commit lalu push ke GitHub `main` (tanpa force push). **Jangan deploy kode yang belum ada di GitHub.**
3. Baru deploy ke VPS produksi **172.235.167.29** (Linode `nl-ams`), app dir `/srv/ebrystore/app`:
   - `python .zcode/upload-tar-pw.py` → `.output.new`
   - pindahkan ke `/srv/ebrystore/releases/<nama>-YYYYMMDD-NN/.output`, `chown -R ebrystore:ebrystore`
   - `ln -sfn <rilis>/.output /srv/ebrystore/app/.output && systemctl restart ebrystore`
   - verifikasi `curl 127.0.0.1:3000` dan `https://app.ebrystore.my.id`.

VPS lama (172.233.47.78, 95.111.194.57) sudah tidak dipakai. Password VPS tidak boleh ditulis ke file;
baca dari `$env:VPS_PW`.
