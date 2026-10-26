# Inventaris Komponen

## Komponen aplikasi saat ini (5)
- `site-header.tsx` — header publik + menu mobile sederhana.
- `site-footer.tsx`
- `catalog-states.tsx` — loading/empty katalog.
- `admin/admin-ui.tsx` — page header, kartu admin.
- `admin/tx-ui.tsx` — StatusBadge, DetailCard (khusus admin).

## Primitive shadcn tersedia (45)
button, card, badge, input, textarea, select, dialog, alert-dialog, drawer, sheet, tabs, table, skeleton, sonner, progress, popover, command, pagination, sidebar, dll. — cukup untuk seluruh redesign tanpa dependency baru.

## Komponen yang harus dibangun
ServiceShortcut, ProductCard, ServiceCard, OrderCard, ActiveOrderCard, ActionRequiredCard, PaymentMethodCard, PaymentStatusCard, TaskCard, ProgressTimeline, StatusBadge (bersama customer+admin), BottomNavigation, MobileHeader, AdminSidebar (refactor), AdminTopbar, FilterBar, DataTable (+ mobile card view), DetailDrawer, BottomSheet, StickyActionBar, EmptyState, ErrorState, Skeleton preset, FileUploader.

Setiap komponen wajib punya state: default, hover, active, focus, loading, disabled, error, success, mobile, desktop, reduced-motion.
