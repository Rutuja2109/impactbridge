// App state for the prototype build: navigation, the open sheet, and session-only demo actions.
// Nothing here is saved or sent anywhere; restarting the app resets it, like reloading the prototype.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Linking, StyleSheet, Text } from 'react-native';

import { campaignOf, campaigns, type CauseId, type Donation } from '../data';
import { inr } from '../format';
import { firebaseReady } from '../firebase';
import { useT } from '../i18n';
import { NO_FILTERS, type Filters } from '../data/filters';
import { colors, radius, space, type } from '../theme';
import type { User } from '../screens/Welcome';
import { freshPost, type Flow, type PostState } from './post';

export type TabId = 'home' | 'discover' | 'community' | 'impact';
export type Route = { name: 'project'; id: string } | { name: 'campaign'; id: string } | { name: 'post'; flow: Flow };
export type Sheet =
  | { kind: 'post' }
  | { kind: 'updates' }
  | { kind: 'help'; id: string }
  | { kind: 'donate'; id: string }
  | { kind: 'report'; id?: string }
  | { kind: 'share'; id: string }
  | { kind: 'sip'; cause?: CauseId }
  | { kind: 'profile' }
  | { kind: 'filters' }
  | { kind: 'org'; id: string };
export type DiscoverState = { q: string; cat: 'all' | CauseId; kind: 'all' | 'projects' | 'fund'; view: 'list' | 'map'; pin: string | null; f: Filters };
export type MyDonation = { cid: string; a: number; n: string; monthly?: boolean };
/** A simulated monthly giving plan (SIP), as on Ketto: a fixed amount every month for a cause. Nothing is charged. */
export type Sip = { id: string; cause: CauseId; amount: number; cid: string | null; status: 'active' | 'paused' | 'cancelled'; started: string };

/** An in-app notification: a string key plus values, shown in the Updates sheet in the current language. */
export type Note = { id: number; key: string; p: Record<string, string | number> };

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
  sips: Sip[];
  posts: Record<Flow, PostState>;
  user: User | null;
  notes: Note[];
  unread: number;
  dataVersion: number;
  bumpData: () => void;
  setFollowing: (ids: string[]) => void;
  markRead: () => void;
  setUser: (u: User | null) => void;
  setPost: (flow: Flow, fn: (p: PostState) => PostState) => void;
  startSip: (cause: CauseId, amount: number, cid: string | null, name?: string, message?: string) => void;
  setSipStatus: (id: string, status: Sip['status']) => void;
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
  const { t } = useT();
  const [tab, setTab] = useState<TabId>('home');
  const [stack, setStack] = useState<Route[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [discover, setDiscoverState] = useState<DiscoverState>({ q: '', cat: 'all', kind: firebaseReady ? 'all' : 'projects', view: 'list', pin: null, f: NO_FILTERS });
  const [following, setFollowing] = useState<string[]>([]);
  const [joined, setJoined] = useState<string[]>([]);
  const [going, setGoing] = useState<string[]>([]);
  const [donations, setDonations] = useState<Record<string, Donation[]>>(initialDonations);
  const [myDonations, setMyDonations] = useState<MyDonation[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [sips, setSips] = useState<Sip[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [dataVersion, setDataVersion] = useState(0); // bumped when live posts arrive so screens redraw
  const notify = useCallback((key: string, p: Note['p'] = {}) => {
    setNotes((n) => [{ id: n.length + 1, key, p }, ...n]);
    setUnread((u) => u + 1);
  }, []);
  const [posts, setPosts] = useState<Record<Flow, PostState>>({ problem: freshPost(), project: freshPost(), fund: freshPost() });

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
    tab, stack, sheet, discover, following, joined, going, donations, myDonations, sips, posts, user, setUser, notes, unread, dataVersion,
    bumpData: () => setDataVersion((v) => v + 1),
    setFollowing,
    markRead: () => setUnread(0),
    setPost: (flow, fn) => setPosts((all) => ({ ...all, [flow]: fn(all[flow]) })),
    // The first month of a campaign SIP is recorded as a simulated donation so the campaign total moves once, now.
    startSip: (cause, amount, cid, name = '', message = '') => {
      setSips((all) => [...all, { id: `sip-${all.length + 1}`, cause, amount, cid, status: 'active', started: new Date().toISOString().slice(0, 10) }]);
      notify('n.nt.sip', { a: inr(amount) });
      if (cid) {
        setDonations((all) => ({ ...all, [cid]: [...all[cid], { n: name, a: amount, m: message, s: 'received', mine: true }] }));
        setMyDonations((m) => [...m, { cid, a: amount, n: name, monthly: true }]);
      }
    },
    setSipStatus: (id, status) => setSips((all) => all.map((s) => (s.id === id ? { ...s, status } : s))),
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
    // The installed app never handles money: Donate opens the organiser's own payment page, and the demo SIP is off.
    showSheet: (s) => {
      if (firebaseReady && s.kind === 'sip') return;
      if (firebaseReady && s.kind === 'donate' && !campaignOf(s.id)?.payLink) { toast(t('n.pay.none')); return; }
      setSheet(s);
    },
    closeSheet: () => setSheet(null),
    toggle: (list, id) => {
      const set = { following: setFollowing, joined: setJoined, going: setGoing }[list];
      const current = { following, joined, going }[list];
      const on = !current.includes(id);
      set(on ? [...current, id] : current.filter((x) => x !== id));
      if (on && list === 'following') notify('n.nt.follow');
      return on;
    },
    donate: (cid, amount, name, message) => {
      setDonations((all) => ({ ...all, [cid]: [...all[cid], { n: name, a: amount, m: message, s: 'received', mine: true }] }));
      setMyDonations((m) => [...m, { cid, a: amount, n: name }]);
      notify('n.nt.donate', { a: inr(amount), c: campaignOf(cid)?.title ?? '' });
    },
    confirmPledge: (cid, index) => {
      setDonations((all) => ({ ...all, [cid]: all[cid].map((d, i) => (i === index ? { ...d, s: 'received' } : d)) }));
    },
    toast,
  }), [tab, stack, sheet, discover, following, joined, going, donations, myDonations, sips, posts, user, notes, unread, dataVersion, notify, toast, t]);

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
