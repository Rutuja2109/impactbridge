// Real push notifications through Firebase Cloud Messaging. After sign-in the app asks permission (Android 13+ shows the
// system prompt), reads this phone's FCM token and saves it on the person's profile; the Cloud Functions in
// firebase/functions send to it. Remote push does not work in Expo Go, so every step is guarded.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from '@react-native-firebase/firestore';
import { Platform } from 'react-native';

import { db } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerPush(uid: string, name: string, email: string): Promise<void> {
  try {
    if (!db || !Device.isDevice || Constants.appOwnership === 'expo') return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'GoodNeighbour', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const token = (await Notifications.getDevicePushTokenAsync()).data;
    await setDoc(doc(db, 'users', uid), { pushToken: String(token), name, email, updatedAt: Date.now() }, { merge: true });
  } catch { /* push is optional: the app works without it */ }
}
