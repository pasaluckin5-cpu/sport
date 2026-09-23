import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

/**
 * Opens the native share sheet (Messages, WhatsApp, email, ...) on iOS/Android. react-native-web
 * has no Share implementation, so on web (and as a fallback if the native share sheet is
 * unavailable/cancelled with an error) this copies the text to the clipboard instead.
 */
export async function shareOrCopy(text: string, title: string): Promise<'shared' | 'copied'> {
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message: text, title });
      return 'shared';
    } catch {
      // Fall through to clipboard.
    }
  }
  await Clipboard.setStringAsync(text);
  return 'copied';
}
