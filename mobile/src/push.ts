import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { registerPushToken } from "./api";

// Push notifications for Alert Sekuriti, so an alert reaches the phone
// even when the app is closed or the screen is off. The website sends
// them through Expo's push service (src/lib/securityPush.ts) to every
// token registered here. Tapping one opens the app, where the polling in
// App.tsx shows the full-screen alert.

// Must match ALERT_CHANNEL in the website's src/lib/securityPush.ts.
export const ALERT_CHANNEL = "security-alerts";
const PROJECT_ID = "f12618dd-ba95-4018-b003-522675459379";

// While the app is open the full-screen alert takes over (and buzzes),
// so the notification itself stays quiet in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Best-effort: without permission or signal the app still gets alerts by
// polling while it's open. Retried on every app start.
export async function setUpPush(): Promise<void> {
  try {
    // Android 8+: the channel decides how loud it is — max importance pops
    // up over other apps, shows on the lock screen and buzzes. Channel
    // settings are fixed once created; rename the id to change them.
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: "Alert Sekuriti",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 600, 1000, 600, 1000],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: "default",
      enableVibrate: true,
    });

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    await registerPushToken(token, Device.deviceName ?? Device.modelName ?? null);
  } catch (e) {
    console.warn("Push setup failed", e);
  }
}

// Calls back when an alert push arrives in the foreground or is tapped,
// so the app can fetch alerts right away instead of on the next poll.
export function onAlertPush(callback: () => void) {
  const received = Notifications.addNotificationReceivedListener(callback);
  const tapped = Notifications.addNotificationResponseReceivedListener(callback);
  return () => {
    received.remove();
    tapped.remove();
  };
}
