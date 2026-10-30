// Admin: monthly giving (SIP). Choose who receives the money (name and number or UPI ID), switch the feature on or off, see how much
// has been collected for each fundraiser, and record every payout passed on to an organiser.
// Razorpay pays out to the bank account set in the Razorpay dashboard; the receiver chosen here is what donors see (name and the
// last digits) and what the admin team uses when passing money on.
import { addDoc, collection, doc, getDoc, onSnapshot } from '@react-native-firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { db } from '../firebase';
import { inr } from '../format';
import { useLive } from '../state/communities';
import { saveSipConfig, useSipConfig, type Sip } from '../state/sip';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';
import { Button } from './ui';

type Payout = { id: string; postId: string; amount: number };

export default function AdminSip() {
  const { toast, user } = useStore();
  const cfg = useSipConfig();
  const [name, setName] = useState('');
  const [payee, setPayee] = useState('');
  const [note, setNote] = useState('');
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(cfg.payeeName); setOn(cfg.enabled); }, [cfg.payeeName, cfg.enabled]);
  useEffect(() => { getDoc(doc(db!, 'config', 'sipPrivate')).then((s) => { setPayee(String(s.data()?.payee ?? '')); setNote(String(s.data()?.note ?? '')); }).catch(() => undefined); }, []);

  const sips = useLive<Sip[]>(db ? () => (cb) => onSnapshot(collection(db!, 'sips'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sip, 'id'>) }))), () => cb([])) : null, [], []);
  const payouts = useLive<Payout[]>(db ? () => (cb) => onSnapshot(collection(db!, 'payouts'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Payout, 'id'>) }))), () => cb([])) : null, [], []);

  const stats = useMemo(() => {
    const live = sips.filter((x) => x.status === 'active' || x.status === 'authenticated');
    const perPost = new Map<string, { title: string; collected: number; passed: number; donors: Set<string> }>();
    sips.forEach((x) => {
      const r = perPost.get(x.postId) ?? { title: x.title, collected: 0, passed: 0, donors: new Set<string>() };
      r.collected += x.totalPaid || 0;
      if (x.status === 'active') r.donors.add(x.id);
      perPost.set(x.postId, r);
    });
    payouts.forEach((p) => { const r = perPost.get(p.postId); if (r) r.passed += p.amount; });
    return { active: live.length, monthly: live.reduce((a, x) => a + x.amount, 0), collected: sips.reduce((a, x) => a + (x.totalPaid || 0), 0), perPost: [...perPost.entries()] };
  }, [sips, payouts]);

  const save = () => {
    setBusy(true);
    saveSipConfig({ enabled: on, payeeName: name, payee, note })
      .then(() => toast('Saved'))
      .catch(() => toast('Could not save. Publish the latest rules.'))
      .finally(() => setBusy(false));
  };

  return (
    <View>
      <Text style={styles.h}>Monthly giving (SIP)</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Who receives monthly gifts</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Receiver's name (donors see this)" placeholderTextColor={colors.slate} />
        <TextInput style={styles.input} value={payee} onChangeText={setPayee} placeholder="Number or UPI ID (donors see only the last digits)" placeholderTextColor={colors.slate} autoCapitalize="none" />
        <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Private note (optional)" placeholderTextColor={colors.slate} />
        <Text style={styles.meta}>Razorpay pays into the bank account set in the Razorpay dashboard. This receiver is what donors are shown and what you use when passing money on.</Text>
        <View style={styles.row}>
          <View style={styles.flex}><Button label={on ? 'Monthly giving: ON' : 'Monthly giving: OFF'} small block variant={on ? 'primary' : 'ghost'} onPress={() => setOn((x) => !x)} /></View>
          <View style={styles.flex}><Button label="Save" small block disabled={busy} onPress={save} /></View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Totals</Text>
        <View style={styles.line}><Text style={styles.label}>Active monthly gifts</Text><Text style={styles.val}>{stats.active}</Text></View>
        <View style={styles.line}><Text style={styles.label}>Monthly run-rate</Text><Text style={styles.val}>{inr(stats.monthly)}</Text></View>
        <View style={styles.line}><Text style={styles.label}>Collected so far</Text><Text style={styles.val}>{inr(stats.collected)}</Text></View>
      </View>

      {stats.perPost.map(([postId, r]) => <PayoutRow key={postId} postId={postId} title={r.title} collected={r.collected} passed={r.passed} adminId={user?.uid ?? ''} />)}
    </View>
  );
}

function PayoutRow({ postId, title, collected, passed, adminId }: { postId: string; title: string; collected: number; passed: number; adminId: string }) {
  const { toast } = useStore();
  const [amt, setAmt] = useState('');
  const [ref, setRef] = useState('');
  const left = Math.max(0, collected - passed);
  const record = () => {
    const n = Number(amt);
    if (!Number.isInteger(n) || n < 1 || n > left) { toast(`Enter an amount up to ${inr(left)}`); return; }
    addDoc(collection(db!, 'payouts'), { postId, title, amount: n, ref: ref.trim(), at: Date.now(), by: adminId })
      .then(() => { setAmt(''); setRef(''); toast('Payout recorded'); })
      .catch(() => toast('Could not save'));
  };
  return (
    <View style={styles.card}>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      <Text style={styles.meta}>Collected {inr(collected)} · passed on {inr(passed)} · still to pass on {inr(left)}</Text>
      {left > 0 ? (
        <>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} value={amt} onChangeText={setAmt} keyboardType="number-pad" placeholder="Amount" placeholderTextColor={colors.slate} />
            <TextInput style={[styles.input, styles.flex]} value={ref} onChangeText={setRef} placeholder="Reference" placeholderTextColor={colors.slate} />
          </View>
          <Button label="Record payout to organiser" small variant="ghost" onPress={record} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: space.l },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: space.m, gap: 6, marginTop: space.s },
  title: { fontSize: 15, fontWeight: '800', color: colors.tealDark },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.s, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink },
  meta: { fontSize: 13, color: colors.slate },
  row: { flexDirection: 'row', gap: space.s },
  flex: { flex: 1 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { flex: 1, fontSize: 14, color: colors.slate },
  val: { fontSize: 14, fontWeight: '800', color: colors.ink },
});
