import { BleEngine } from './types';

/** Web has no react-native-ble-plx build (it's a native module) — every call here is a no-op or
 *  a rejected promise, and the UI (heart-rate-context.tsx) checks `isSupported` before ever
 *  calling scan/connect, so this exists purely so the shared context module has something to
 *  import on web without pulling in native code. */
export const bleEngine: BleEngine = {
  isSupported: false,
  scanForHeartRateDevices: () => () => {},
  connect: async () => {
    throw new Error('Bluetooth heart rate monitoring is not supported on web.');
  },
};
