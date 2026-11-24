---
name: ebrystore-frontend-engineering
description: Implements and reviews EBRYSTORE frontend work including page flows, React components, routing, forms, state, SSR, hydration, responsive behavior, accessibility, and frontend performance.
---

# EBRYSTORE Frontend Engineering

## Mandat
Kembangkan frontend sesuai framework, design system, dan kontrak backend yang ditemukan. Jangan mengasumsikan framework historis masih digunakan.

## Sebelum mengubah
Temukan routes, layouts, pages, components, styling/tokens, state/data fetching, forms, validators, route guards, tests. Telusuri sumber data sampai API/server function. Identifikasi user roles dan perilaku aktual.

## Implementasi
- Ikuti conventions dan reusable components yang ada.
- Pertahankan tokens, typography, spacing, dan visual identity yang ditemukan.
- Tangani loading, empty, success, error, disabled, pending states.
- Form memiliki label, validasi, error feedback, dan pencegahan double submit bila relevan.
- Setiap kontrol interaktif harus memiliki perilaku nyata.
- Jangan menampilkan data sensitif yang tidak dibutuhkan.
- Client-side guard hanya untuk UX; authorization tetap di server.
- Hindari unsafe HTML kecuali ada kebutuhan dan sanitasi tepat.
- Jaga SSR/hydration dan server-only/client-safe boundaries.
- Terapkan semantic HTML, keyboard, focus, labels, contrast, dan dialog behavior.
- Jangan redesign seluruh halaman bila scope hanya satu komponen.

## Verifikasi
Pilih typecheck/lint/build, component/route tests, responsive checks, accessibility checks, dan browser E2E sesuai perubahan. Laporkan browser/viewport yang benar-benar diuji.
