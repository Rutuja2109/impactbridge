// Interface text in English, Hindi and Marathi, using the prototype's own dictionary (strings.generated.ts).
// The chosen language is remembered on the device, as the prototype does.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { NATIVE } from './native';
import { STRINGS } from './strings.generated';

export type Lang = 'en' | 'hi' | 'mr';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'mr', label: 'मराठी' },
];
const STORAGE_KEY = 'gn-lang';
const LOCALES: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };
type Dict = Record<string, string>;

function translate(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  let s = (STRINGS[lang] as Dict)[key] ?? NATIVE[lang][key];
  if (s === undefined) {
    if (__DEV__) console.warn('Missing translation:', lang, key);
    s = (STRINGS.en as Dict)[key] ?? NATIVE.en[key] ?? key;
  }
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translated text; markup such as <strong> is removed. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Translated text with its <strong> markup kept, for <Rich>. */
  tr: (key: string, vars?: Record<string, string | number>) => string;
  /** True when the interface is not in English, so English sample content must be labelled as untranslated. */
  untranslated: boolean;
  formatDate: (iso: string, opts: Intl.DateTimeFormatOptions) => string;
};

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => { if (saved === 'en' || saved === 'hi' || saved === 'mr') setLangState(saved); })
      .catch(() => { /* storage unavailable: stay in English */ });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => { /* the choice still applies for this session */ });
  }, []);

  const value = useMemo<Ctx>(() => ({
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars).replace(/<\/?strong>/g, ''),
    tr: (key, vars) => translate(lang, key, vars),
    untranslated: lang !== 'en',
    formatDate: (iso, opts) => {
      const d = new Date(`${iso.length === 7 ? `${iso}-01` : iso}T12:00:00`);
      try { return new Intl.DateTimeFormat(LOCALES[lang], opts).format(d); } catch { return d.toDateString(); }
    },
  }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useT must be used inside LangProvider');
  return ctx;
}

/** Renders a translated string whose <strong>…</strong> parts are bold. */
export function Rich({ text, style, boldStyle }: { text: string; style?: StyleProp<TextStyle>; boldStyle?: StyleProp<TextStyle> }) {
  const parts = text.split(/(<strong>.*?<\/strong>)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) => p.startsWith('<strong>')
        ? <Text key={i} style={[{ fontWeight: '800' }, boldStyle]}>{p.replace(/<\/?strong>/g, '')}</Text>
        : p)}
    </Text>
  );
}
