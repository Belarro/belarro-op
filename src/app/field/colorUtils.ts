// Ported from saletracker/src/utils/colorUtils.js — centralized pin/status
// color logic shared by the map and the visits list.

export const PIN_COLORS = {
  GRAY: '#9e9e9e',
  BLUE: '#2196F3',
  ORANGE: '#FF6D00',
  GREEN: '#4caf50',
  RED: '#f44336',
  YELLOW: '#FFD600',
} as const;

export const MANUAL_COLOR_OPTIONS = [
  { label: 'Auto', value: '' },
  { label: 'Blue', value: PIN_COLORS.BLUE },
  { label: 'Orange', value: PIN_COLORS.ORANGE },
  { label: 'Green', value: PIN_COLORS.GREEN },
  { label: 'Red', value: PIN_COLORS.RED },
  { label: 'Yellow', value: PIN_COLORS.YELLOW },
  { label: 'Gray', value: PIN_COLORS.GRAY },
];

export function getAutoColor(interestLevel: string | null | undefined, sampleGiven: string | boolean | null | undefined): string {
  const given = sampleGiven === 'YES' || sampleGiven === true;
  switch (interestLevel) {
    case 'Lead':
      return PIN_COLORS.BLUE;
    case 'Interested':
      return given ? PIN_COLORS.ORANGE : PIN_COLORS.BLUE;
    case 'Not Interested':
      return PIN_COLORS.RED;
    case 'Follow Up':
      return PIN_COLORS.YELLOW;
    case 'Closed Deal':
      return PIN_COLORS.GREEN;
    default:
      return PIN_COLORS.GRAY;
  }
}

export function getPinColor(loc: { pin_color?: string | null; interest_level?: string | null; sample_given?: string | boolean | null }): string {
  if (loc.pin_color && loc.pin_color.trim() !== '') return loc.pin_color;
  return getAutoColor(loc.interest_level, loc.sample_given);
}

export function getColorLabel(color: string): string {
  switch (color) {
    case PIN_COLORS.BLUE: return 'Lead — check out later';
    case PIN_COLORS.ORANGE: return 'Hot lead';
    case PIN_COLORS.GREEN: return 'Closed deal';
    case PIN_COLORS.RED: return 'Not interested';
    case PIN_COLORS.YELLOW: return 'Follow up';
    default: return 'Pending';
  }
}

export const LEGEND_ITEMS = [
  { color: PIN_COLORS.GRAY, label: 'Pending' },
  { color: PIN_COLORS.BLUE, label: 'Lead — check out later' },
  { color: PIN_COLORS.ORANGE, label: 'Hot lead' },
  { color: PIN_COLORS.YELLOW, label: 'Follow up' },
  { color: PIN_COLORS.RED, label: 'Not interested' },
  { color: PIN_COLORS.GREEN, label: 'Closed deal' },
];

export function getStatusStyle(loc: { pin_color?: string | null; interest_level?: string | null; sample_given?: string | boolean | null }) {
  const color = getPinColor(loc);
  switch (color) {
    case PIN_COLORS.BLUE: return { bg: '#e3f2fd', color: '#1565c0', border: '#90caf9' };
    case PIN_COLORS.ORANGE: return { bg: '#fff3e0', color: '#e65100', border: '#ffcc80' };
    case PIN_COLORS.GREEN: return { bg: '#e8f5e9', color: '#2e7d32', border: '#a7f3d0' };
    case PIN_COLORS.RED: return { bg: '#ffebee', color: '#c62828', border: '#fecaca' };
    case PIN_COLORS.YELLOW: return { bg: '#fffde7', color: '#f57f17', border: '#fde68a' };
    default: return { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' };
  }
}
