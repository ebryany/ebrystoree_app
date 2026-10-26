import { auth, defineMcp } from "@lovable.dev/mcp-js";

import listProducts from "./tools/list-products";
import getProduct from "./tools/get-product";
import updateProduct from "./tools/update-product";
import createProduct from "./tools/create-product";
import archiveProduct from "./tools/archive-product";
import listCategories from "./tools/list-categories";
import listServices from "./tools/list-services";
import createService from "./tools/create-service";
import updateService from "./tools/update-service";
import archiveService from "./tools/archive-service";
import manageServicePackage from "./tools/manage-service-package";
import manageServiceAddon from "./tools/manage-service-addon";
import getWebsiteSettings from "./tools/get-website-settings";
import updateWebsiteSettings from "./tools/update-website-settings";
import listOrders from "./tools/list-orders";
import getOrder from "./tools/get-order";
import salesSummary from "./tools/sales-summary";
import stockAlerts from "./tools/stock-alerts";
import listPayments from "./tools/list-payments";
import verifyPayment from "./tools/verify-payment";
import listRefunds from "./tools/list-refunds";
import reviewRefund from "./tools/review-refund";
import listJobs from "./tools/list-jobs";
import assignOperator from "./tools/assign-operator";
import reviewJobResult from "./tools/review-job-result";
import listUsers from "./tools/list-users";
import manageUserRole from "./tools/manage-user-role";
import listAuditLogs from "./tools/list-audit-logs";
import listTasks from "./tools/list-tasks";
import updateTask from "./tools/update-task";
import broadcastNotification from "./tools/broadcast-notification";
import listProductFiles from "./tools/list-product-files";
import uploadProductFile from "./tools/upload-product-file";
import manageProductFile from "./tools/manage-product-file";
import setProductDeliveryMode from "./tools/set-product-delivery-mode";
import manageCategory from "./tools/manage-category";
import listArticles from "./tools/list-articles";
import manageArticle from "./tools/manage-article";
import dailySalesReport from "./tools/daily-sales-report";
import customerInsights from "./tools/customer-insights";
import productPerformance from "./tools/product-performance";
import listReviews from "./tools/list-reviews";
import moderateReview from "./tools/moderate-review";
import operatorWorkload from "./tools/operator-workload";
import bulkUpdateProductStatus from "./tools/bulk-archive-products";
import exportOrdersCsv from "./tools/export-orders-csv";
import resendOrderNotification from "./tools/resend-order-notification";
import hermesTakeJob from "./tools/hermes-take-job";
import hermesUpdateProgress from "./tools/hermes-progress";
import hermesDeliverResult from "./tools/hermes-deliver-result";
import hermesNotifyTelegram from "./tools/hermes-notify-telegram";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "ebry-pay-sell",
  title: "Ebry Pay & Sell",
  version: "0.1.0",
  instructions:
    "Tool kontrol penuh Ebrystore: menambah, mengubah, dan mengarsipkan produk digital maupun layanan jasa (termasuk paket harga dan add-on), ubah status produk massal, mengunggah & mengelola berkas master produk digital (versi aktif atau stok unik per pembeli) beserta mode pengirimannya, mengelola kategori dan artikel/blog, memantau pesanan & pembayaran, ekspor pesanan ke CSV, kirim ulang notifikasi pesanan, laporan penjualan harian, performa produk, insight pelanggan, dan stok, verifikasi pembayaran manual, refund, penugasan operator, beban kerja operator & tinjauan hasil jasa, moderasi ulasan produk, tugas admin, pengguna & role, audit log, notifikasi, serta membaca dan mengubah pengaturan website (identitas, kontak, warna, menu, feature flag, maintenance). Semua akses mengikuti izin akun yang login dan tercatat di audit log.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    archiveProduct,
    bulkUpdateProductStatus,
    listCategories,
    manageCategory,
    listArticles,
    manageArticle,
    listServices,
    createService,
    updateService,
    archiveService,
    manageServicePackage,
    manageServiceAddon,
    listOrders,
    getOrder,
    salesSummary,
    dailySalesReport,
    customerInsights,
    productPerformance,
    stockAlerts,
    exportOrdersCsv,
    resendOrderNotification,
    listReviews,
    moderateReview,
    listProductFiles,
    uploadProductFile,
    manageProductFile,
    setProductDeliveryMode,
    listPayments,
    verifyPayment,
    listRefunds,
    reviewRefund,
    listJobs,
    assignOperator,
    hermesTakeJob,
    hermesUpdateProgress,
    hermesDeliverResult,
    hermesNotifyTelegram,
    operatorWorkload,
    reviewJobResult,
    listTasks,
    updateTask,
    listUsers,
    manageUserRole,
    listAuditLogs,
    broadcastNotification,
    getWebsiteSettings,
    updateWebsiteSettings,
  ],
});