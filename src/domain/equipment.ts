import { Equipment } from './types';

export interface EquipmentInfo {
  id: Equipment;
  label: string;
  emoji: string;
  description: string;
}

export const EQUIPMENT_CATALOG: EquipmentInfo[] = [
  {
    id: 'fins',
    label: 'Fins',
    emoji: '🦶',
    description: 'Boosts kick power and ankle flexibility, used for kick sets and sprint work.',
  },
  {
    id: 'paddles',
    label: 'Hand paddles',
    emoji: '🖐️',
    description: 'Builds pulling strength and feel for the water on pull and main sets.',
  },
  {
    id: 'pullBuoy',
    label: 'Pull buoy',
    emoji: '🧵',
    description: 'Isolates the upper body for pull sets by floating the legs.',
  },
  {
    id: 'kickboard',
    label: 'Kickboard',
    emoji: '🏄',
    description: 'Isolates the legs for kick sets and technique work.',
  },
  {
    id: 'snorkel',
    label: 'Snorkel',
    emoji: '🤿',
    description: 'Removes breathing/rotation from the stroke so you can focus on technique.',
  },
  {
    id: 'parachute',
    label: 'Drag parachute',
    emoji: '🪂',
    description: 'Adds resistance for strength-building sprint and threshold sets.',
  },
  {
    id: 'tempoTrainer',
    label: 'Tempo trainer',
    emoji: '⏱️',
    description: 'Audible beeper for pacing drills and stroke-rate work.',
  },
  {
    id: 'band',
    label: 'Ankle band',
    emoji: '➰',
    description: 'Binds the ankles to isolate the pull and build body-position awareness.',
  },
];

export function equipmentLabel(id: Equipment): string {
  return EQUIPMENT_CATALOG.find((e) => e.id === id)?.label ?? id;
}
