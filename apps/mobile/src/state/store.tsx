// App state for the prototype build: navigation, the open sheet, and session-only demo actions.
// Nothing here is saved or sent anywhere; restarting the app resets it, like reloading the prototype.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { campaigns, type CauseId, type Donation } from '../data';
import { colors, radius, space, type } from '../theme';

export type TabId = 'home' | 'discover' | 'community' | 'impact';
export type Route = { name: 'project'; id: string } | { name: 'campaign'; id: string };
export type Sheet =
  | { kind: 'post' }
  | { kind: 'updates' }
  | { kind: 'help'; id: string }
  | { kind: 'donate'; id: string }
  | { kind: 'report' }
  | { kind: 'share'; id: string }
  | { kind: 'org'; id: string };
export type DiscoverState = { q: string; cat: 'all' | CauseId; kind: 'projects' | 'fund'; view: 'list' | 'map'; pin: string | null };
export type MyDonation = { cid: string; a: number; n: string };

type Store = {
  tab: TabId;
  stack: Route[];
  sheet: Sheet | null;
  discover: DiscoverState;
  following: string[];
  joined: string[];
  going: string[];
  donations: Record<string, Donation[]>;
  myDonations: MyDonation[];
  goTab: (tab: TabId) => void;
  open: (route: Route) => void;
  back: () => boolean;
  openDiscover: (patch: Partial<DiscoverState>) => void;
  setDiscover: (patch: Partial<DiscoverState>) => void;
  showSheet: (sheet: Sheet) => void;
  closeSheet: () => void;
  toggle: (list: 'following' | 'joined' | 'going', id: string) => boolean;
  donate: (cid: string, amount: number, name: string, message: string) => void;
  confirmPledge: (cid: string, index: number) => void;
  toast: (message: string) => void;
};

const StoreContext = createContext<Store | null>(null);

const initialDonations = () => Object.fromEntries(campaigns.map((c) => [c.id, c.donations.map((d) => ({ ...d }))]));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TabId>('home');
  const [stack, setStack] = useState<Route[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [discover, setDiscoverState] = useState<DiscoverState>({ q: '', cat: 'all', kind: 'projects', view: 'list', pin: null });
  const [following, setFollowing] = useState<string[]>([]);
  const [joined, setJoined] = useState<string[]>([]);
  const [going, setGoing] = useState<string[]>([]);
  const [donations, setDonations] = useState<Record<string, Donation[]>>(initialDonations);
  const [myDonations, setMyDonations] = useState<MyDonation[]>([]);

  // toast
  const [toastText, setToastText] = useState('');
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((message: string) => {
    setToastText(message);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToastText(''));
    }, 3200);
  }, [fade]);

  const stackRef = useRef(stack);
  stackRef.current = stack;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const store = useMemo<Store>(() => ({
    tab, stack, sheet, discover, following, joined, going, donations, myDonations,
    goTab: (t) => { setStack([]); setSheet(null); setTab(t); },
    open: (route) => { setSheet(null); setStack((s) => [...s, route]); },
    // Android Back: close detail screens first, then return to Home; false lets Android leave the app.
    back: () => {
      if (stackRef.current.length) { setStack((s) => s.slice(0, -1)); return true; }
      if (tabRef.current !== 'home') { setTab('home'); return true; }
      return false;
    },
    openDiscover: (patch) => {
      setDiscoverState((d) => ({ ...d, pin: null, ...patch }));
      setStack([]); setSheet(null); setTab('discover');
    },
    setDiscover: (patch) => setDiscoverState((d) => ({ ...d, ...patch })),
    showSheet: (s) => setSheet(s),
    closeSheet: () => setSheet(null),
    toggle: (list, id) => {
      const set = { following: setFollowing, joined: setJoined, going: setGoing }[list];
      const current = { following, joined, going }[list];
      const on = !current.includes(id);
      set(on ? [...current, id] : current.filter((x) => x !== id));
      return on;
    },
    donate: (cid, amount, name, message) => {
      setDonations((all) => ({ ...all, [cid]: [...all[cid], { n: name, a: amount, m: message, s: 'received', mine: true }] }));
      setMyDonations((m) => [...m, { cid, a: amount, n: name }]);
    },
    confirmPledge: (cid, index) => {
      setDonations((all) => ({ ...all, [cid]: all[cid].map((d, i) => (i === index ? { ...d, s: 'received' } : d)) }));
    },
    toast,
  }), [tab, stack, sheet, discover, following, joined, going, donations, myDonations, toast]);

  return (
    <StoreContext.Provider value={store}>
      {children}
      {toastText ? (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity: fade }]} accessibilityLiveRegion="polite">
          <Text style={styles.toastText}>{toastText}</Text>
        </Animated.View>
      ) : null}
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: space.l, right: space.l, bottom: 110, alignItems: 'center',
  },
  toastText: {
    ...type.small, color: colors.white, backgroundColor: colors.ink, borderRadius: radius.m,
    paddingHorizontal: space.l, paddingVertical: space.m, overflow: 'hidden', textAlign: 'center',
  },
});
