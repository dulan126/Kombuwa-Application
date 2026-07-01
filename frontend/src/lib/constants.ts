import type { Stream } from '@/types/auth';

// ─── Stream Configuration ────────────────────────────────────────────────────

export interface SubjectInfo {
  id: string;
  n: string;
}

export interface StreamInfo {
  name: string;
  icon: string;
  color: string;
  bg: string;
  subjects: SubjectInfo[];
}

export const STREAMS: Record<Stream, StreamInfo> = {
  phy: {
    name: 'Physical Science',
    icon: '⚗️',
    color: '#4F7FE8',
    bg: 'rgba(79,127,232,0.12)',
    subjects: [
      { id: 'm', n: 'ඒකාබද්ධ ගණිතය' },
      { id: 'ph', n: 'භෞතිකය' },
      { id: 'ch', n: 'රසායනය' },
    ],
  },
  bio: {
    name: 'Bio Science',
    icon: '🧬',
    color: '#3DAF72',
    bg: 'rgba(61,175,114,0.12)',
    subjects: [
      { id: 'bi', n: 'ජීව විද්‍යාව' },
      { id: 'ch', n: 'රසායනය' },
      { id: 'ph', n: 'භෞතිකය' },
    ],
  },
  com: {
    name: 'Commerce',
    icon: '📊',
    color: '#8b90f0',
    bg: 'rgba(139,144,240,0.12)',
    subjects: [
      { id: 'ac', n: 'ගිණුම්කරණය' },
      { id: 'ec', n: 'ආර්ථිකය' },
      { id: 'bs', n: 'ව්‍යාපාර' },
    ],
  },
  art: {
    name: 'Arts',
    icon: '🎨',
    color: '#A78BFA',
    bg: 'rgba(168,139,250,0.12)',
    subjects: [
      { id: 'hi', n: 'ඉතිහාසය' },
      { id: 'po', n: 'දේශපාලනය' },
      { id: 'ge', n: 'භූගෝලය' },
    ],
  },
  tec: {
    name: 'Technology',
    icon: '💻',
    color: '#2EC4B6',
    bg: 'rgba(46,196,182,0.12)',
    subjects: [
      { id: 'ict', n: 'ICT' },
      { id: 'et', n: 'ඉංජිනේරු' },
      { id: 'sc', n: 'විද්‍යාව' },
    ],
  },
};

// ─── Subject Color Map ───────────────────────────────────────────────────────

export const SUBJECT_COLORS: Record<string, string> = {
  m: '#8b90f0',
  ph: '#4F7FE8',
  ch: '#2EC4B6',
  bi: '#4CAF7D',
  ac: '#A78BFA',
  ec: '#FB923C',
};

// ─── District Configuration ──────────────────────────────────────────────────

export const DISTRICTS = [
  { si: 'කොළඹ', en: 'colombo' },
  { si: 'ගම්පහ', en: 'gampaha' },
  { si: 'කළුතර', en: 'kalutara' },
  { si: 'මහනුවර', en: 'kandy' },
  { si: 'ගාල්ල', en: 'galle' },
  { si: 'මාතර', en: 'matara' },
  { si: 'රත්නපුර', en: 'ratnapura' },
  { si: 'කුරුණෑගල', en: 'kurunegala' },
  { si: 'ජාෆ්නා', en: 'jaffna' },
  { si: 'හම්බන්', en: 'hambantota' },
] as const;

// ─── Past Paper Constants ────────────────────────────────────────────────────

export const PAST_PAPER_YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015] as const;

export const DEMO_TOPICS: Record<string, string[]> = {
  m: ['ශ්‍රේණි', 'අවකලනය', 'අනුකලනය', 'දෛශික', 'සංකීර්ණ', 'ත්‍රිකෝණ', 'ප්‍රස්තාර', 'සංභාවිතය'],
  ph: ['ගතිකය', 'ශක්තිය', 'තරංග', 'ප්‍රකාශ', 'විද්‍යුත්', 'ගෑස්', 'නවීන', 'කාලීකය'],
  ch: ['ස්ථිතිකලා', 'සංස්ථා', 'කාබනික', 'ලෝහ', 'විද්‍යුත්', 'ඖෂධ', 'pH'],
  bi: ['සෛල', 'ජාන', 'පරිණාමය', 'ශාක', 'සතුන්', 'ජෛව', 'ජීවය'],
  ac: ['සමීකරණය', 'ජර්නල්', 'ශේෂ', 'ලාභ', 'ස්ථාවර', 'හවුල්', 'සමාගම්'],
  ec: ['ඉල්ලුම', 'නිෂ්පාදන', 'GDP', 'ශේෂය', 'මූල්‍ය', 'ශ්‍රී ලංකා', 'ජාත්‍යන්තර'],
};

// ─── API Configuration ───────────────────────────────────────────────────────

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'Kombuwaedu';

// ─── Paper Type Constants ────────────────────────────────────────────────────

export const PAPER_TYPES = {
  SRP: 'srp',
  DAILY: 'daily',
} as const;

export type PaperTypeValue = (typeof PAPER_TYPES)[keyof typeof PAPER_TYPES];

// ─── Forum Filter Constants ──────────────────────────────────────────────────

export const FORUM_FILTERS = {
  ALL: 'all',
  RESOLVED: 'resolved',
  PENDING: 'pending',
} as const;

export type ForumFilterValue = (typeof FORUM_FILTERS)[keyof typeof FORUM_FILTERS];
