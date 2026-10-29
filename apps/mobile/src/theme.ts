// Design tokens taken from the approved GoodNeighbour prototype (teal family on white).
// White text is only used on tealDark or darker, which keeps contrast at 5.9:1 or better.
export const colors = {
  teal: '#00918F',
  tealDark: '#00706E',
  tealDeep: '#005F5E',
  tealSoft: '#E6F7F6',
  tealBright: '#01BFBD',
  ink: '#0B2A1F',
  slate: '#56685F',
  line: '#E2EBE5',
  paper: '#F7FAF8',
  white: '#FFFFFF',
  sun: '#FFD66B',
  heart: '#FF6B7A',
  amber: '#B45309',
  amberSoft: '#FEF3C7',
  sampleBg: '#EEF2EF',
  // status colours from the prototype's badges
  leaf: '#047857',
  leafSoft: '#E3F5EC',
  brick: '#B42318',
  brickSoft: '#FDECEA',
  grey: '#4B5563',
  greySoft: '#EEF0F2',
  violet: '#5B21B6',
  violetSoft: '#EDE9FE',
  blueInk: '#2A3F8F',
  blueSoft: '#EBEFFC',
  banner: '#0B2A1F',
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

export const radius = { s: 10, m: 16, l: 24, pill: 999 } as const;

export const shadow = {
  card: '0px 1px 2px rgba(11, 42, 31, 0.05), 0px 8px 24px rgba(11, 42, 31, 0.07)',
  raised: '0px 8px 20px rgba(0, 145, 143, 0.35)',
} as const;

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  tiny: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
} as const;
