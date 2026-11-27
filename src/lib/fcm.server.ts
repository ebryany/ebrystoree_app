/**
 * Backward-compatible facade for Firebase Cloud Messaging.
 * Implementasi inti ditempatkan secara khusus dan terisolasi di `src/services/firebase-push/`.
 */
export {
  DEFAULT_PUSH_PREFERENCES,
  normalizePushPreferences,
  readFcmConfig,
  type FcmServiceAccount,
  type PushCategoryKey,
  type PushPreferences,
} from "@/services/firebase-push/config";
export {
  androidChannelForNotification,
  buildFcmMessageBody,
  buildFcmOAuthAssertion,
  fetchGoogleAccessToken,
  hashPushToken,
  preferenceCategoryForChannel,
  sendFcmNotification,
  type FcmPayloadInput,
} from "@/services/firebase-push/fcm-client";
export {
  dispatchChatMessagePush,
  dispatchPendingPushNotifications,
  dispatchSingleNotification,
  formatChatAttachmentPreview,
  shouldSendForPreferences,
  type ChatMessagePushRow,
  type NotificationPushRow,
} from "@/services/firebase-push/dispatcher";
