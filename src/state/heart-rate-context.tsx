import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { bleEngine } from '@/bluetooth/ble-engine';
import { BleDevice } from '@/bluetooth/types';

interface HeartRateContextValue {
  /** False on web (no react-native-ble-plx build there) — callers should hide the whole feature
   *  rather than show a scan/connect UI that can never work. */
  isSupported: boolean;
  isScanning: boolean;
  devices: BleDevice[];
  connectedDevice: BleDevice | null;
  bpm: number | null;
  error: string | null;
  startScan: () => void;
  stopScan: () => void;
  connect: (device: BleDevice) => Promise<void>;
  disconnect: () => void;
}

const HeartRateContext = createContext<HeartRateContextValue | null>(null);

export function HeartRateProvider({ children }: { children: ReactNode }) {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BleDevice | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopScanRef = useRef<(() => void) | null>(null);
  const disconnectRef = useRef<(() => void) | null>(null);

  const value = useMemo<HeartRateContextValue>(
    () => ({
      isSupported: bleEngine.isSupported,
      isScanning,
      devices,
      connectedDevice,
      bpm,
      error,
      startScan: () => {
        setError(null);
        setDevices([]);
        setIsScanning(true);
        stopScanRef.current = bleEngine.scanForHeartRateDevices(
          (device) => setDevices((prev) => (prev.some((d) => d.id === device.id) ? prev : [...prev, device])),
          (message) => {
            setError(message);
            setIsScanning(false);
          },
        );
      },
      stopScan: () => {
        stopScanRef.current?.();
        stopScanRef.current = null;
        setIsScanning(false);
      },
      connect: async (device) => {
        stopScanRef.current?.();
        stopScanRef.current = null;
        setIsScanning(false);
        setError(null);
        try {
          const disconnect = await bleEngine.connect(
            device.id,
            (nextBpm) => setBpm(nextBpm),
            (reason) => {
              if (reason) setError(reason);
              setConnectedDevice(null);
              setBpm(null);
              disconnectRef.current = null;
            },
          );
          disconnectRef.current = disconnect;
          setConnectedDevice(device);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
      disconnect: () => {
        disconnectRef.current?.();
        disconnectRef.current = null;
        setConnectedDevice(null);
        setBpm(null);
      },
    }),
    [isScanning, devices, connectedDevice, bpm, error],
  );

  return <HeartRateContext.Provider value={value}>{children}</HeartRateContext.Provider>;
}

export function useHeartRate(): HeartRateContextValue {
  const ctx = useContext(HeartRateContext);
  if (!ctx) throw new Error('useHeartRate must be used within a HeartRateProvider');
  return ctx;
}
