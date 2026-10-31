// Every sheet the prototype opens: post choices, updates, project help, report, organisation and demo donation.
// The open sheet lives in the store, so any screen can open one.
import { useEffect } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import Icon, { type IconName } from '../components/Icon';
import Sheet, { sheetStyles as s } from '../components/Sheet';
import { ViewAll, useCap } from '../components/Capped';
import { Button, ProgressBar, SampleTag, TwoLayerBar, UntrTag, StatGrid } from '../components/ui';
import { campaignOf, campaignReceived, campaigns, fundPct, fundsOfOrg, orgOf, pledgePct, pledgedPct, projectOf, projects } from '../data';
import { firebaseReady } from '../firebase';
import HelpOffer from './HelpOffer';
import LiveDonateSheet from './LiveDonateSheet';
import MonthlySheet from './MonthlySheet';
import { inr } from '../format';
import { useMyGives } from '../state/donations';
import { markFeedSeen, useFeed } from '../state/feed';
import { STATUS, useHelpRequests, useMyTickets } from '../state/requests';
import { report } from '../state/posts';
import { Rich, useT } from '../i18n';
import type { Flow } from '../state/post';
import { useStore } from '../state/store';
import { colors, space, type } from '../theme';
import DonateSheet from './DonateSheet';
import FilterSheet from './FilterSheet';
import ProfileDrawer from './ProfileDrawer';
import SipSheet from './SipSheet';

function Option({ icon, title, desc, onPress }: { icon?: IconName; title: string; desc?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={desc ? `${title}. ${desc}` : title} style={({ pressed }) => [s.option, pressed && s.optionPressed]}>
      {icon ? <View style={s.optionIcon}><Icon name={icon} size={22} color={colors.tealDark} /></View> : null}
      <View style={s.optionText}>
        <Text style={s.optionTitle}>{title}</Text>
        {desc ? <Text style={s.optionDesc}>{desc}</Text> : null}
      </View>
      <Icon name="chev" size={18} color={colors.slate} />
    </Pressable>
  );
}

function PostSheet() {
  const { t } = useT();
  const { closeSheet, open } = useStore();
  const go = (flow: Flow) => open({ name: 'post', flow });
  return (
    <Sheet visible onClose={closeSheet} title={t('pc.title')} subtitle={t('pc.sub')}>
      {firebaseReady ? null : <Text style={s.note}>{t('post.demo')}</Text>}
      <Option icon="heart" title={t('pc.problemT')} desc={t('pc.problemD')} onPress={() => go('problem')} />
      <Option icon="people" title={t('pc.projectT')} desc={t('pc.projectD')} onPress={() => go('project')} />
      <Option icon="coin" title={t('pc.fundT')} desc={t(firebaseReady ? 'n.live.fundD' : 'pc.fundD')} onPress={() => go('fund')} />
    </Sheet>
  );
}

function UpdatesSheet() {
  const { t } = useT();
  const { closeSheet, open, notes, markRead, user } = useStore();
  const gives = useMyGives(firebaseReady ? user?.uid : undefined).filter((g) => g.status !== 'pledged');
  const feed = useFeed(firebaseReady ? user?.uid : undefined).items;
  const asOwner = useHelpRequests(firebaseReady ? user?.uid : undefined).items;
  const asHelper = useMyTickets(firebaseReady ? user?.uid : undefined).items;
  const reqs = [...asOwner, ...asHelper].filter((r) => r.lastBy !== user?.uid && (r.status === 'requested' || r.status === 'accepted')).sort((a, b) => b.lastAt - a.lastAt).slice(0, 10);
  const { goTab } = useStore();
  useEffect(() => { markRead(); if (firebaseReady) markFeedSeen(); }, [markRead]);
  const capNotes = useCap(notes, 3);
  const capReqs = useCap(reqs, 3);
  const capFeed = useCap(feed, 4);
  const capGives = useCap(gives, 3);
  const items = campaigns.flatMap((c) => c.updates.map((u) => ({ c, u }))).sort((a, b) => a.u.ago - b.u.ago).slice(0, 8);
  return (
    <Sheet visible onClose={closeSheet} title={t('upd.title')} subtitle={<View style={styles.subRow}><Text style={s.note}>{t('upd.sub')}</Text>{firebaseReady ? null : <><SampleTag label={t('c.sample')} /><UntrTag /></>}</View>}>
      {notes.length ? <Text style={styles.h3}>{t('n.nt.title')}</Text> : null}
      {capNotes.shown.map((n) => (
        <View key={n.id} style={styles.update}><Text style={s.note}>{t(n.key, n.p)}</Text></View>
      ))}
      <ViewAll cap={capNotes} />
      {firebaseReady && reqs.length ? <Text style={styles.h3}>{t('tk.notifTitle')}</Text> : null}
      {firebaseReady ? capReqs.shown.map((r) => (
        <Pressable key={r.id} onPress={() => { closeSheet(); goTab('impact'); }} accessibilityRole="button" style={styles.update}>
          <Text style={styles.when}>{t(r.ownerId === user?.uid ? 'tk.asOrganiser' : 'tk.asHelper')} · {t(STATUS[r.status].key)}</Text>
          <Text style={styles.updTitle}>{r.ownerId === user?.uid ? t('hr.line', { n: r.name || t('hr.someone') }) : t('tk.update', { n: r.ownerName || t('ho.organiser') })}</Text>
          <Text style={s.note} numberOfLines={2}>{r.postTitle}{r.lastText ? ` — ${r.lastText}` : ''}</Text>
        </Pressable>
      )) : null}
      {firebaseReady ? <ViewAll cap={capReqs} /> : null}
      {firebaseReady && feed.length ? <Text style={styles.h3}>{t('fd.title')}</Text> : null}
      {firebaseReady ? capFeed.shown.map((f) => (
        <Pressable key={`${f.kind}-${f.id}`} onPress={() => { if (f.kind === 'community') { closeSheet(); goTab('community'); } else open({ name: f.kind, id: f.id }); }} accessibilityRole="button" style={styles.update}>
          <Text style={styles.when}>{t(`fd.${f.kind}`)}</Text>
          <Text style={styles.updTitle}>{f.title}</Text>
          {f.sub ? <Text style={s.note}>{f.sub}</Text> : null}
        </Pressable>
      )) : null}
      {firebaseReady ? <ViewAll cap={capFeed} /> : null}
      {capGives.shown.map((g) => (
        <View key={g.id} style={styles.update}><Text style={s.note}>{t(g.status === 'received' ? 'nt.gave.ok' : 'nt.gave.no', { c: g.title, a: inr(g.amount) })}</Text></View>
      ))}
      <ViewAll cap={capGives} />
      {firebaseReady && !notes.length && !gives.length && !feed.length && !reqs.length ? <Text style={s.note}>{t('upd.none')}</Text> : null}
      {items.map(({ c, u }, i) => (
        <Pressable key={`${c.id}-${i}`} onPress={() => open({ name: 'campaign', id: c.id })} accessibilityRole="button" style={styles.update}>
          <Text style={styles.when}>{t('cd.ago', { n: u.ago })}</Text>
          <Text style={styles.updTitle}>{c.title}</Text>
          <Text style={s.note}>{u.text}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

function HelpSheet({ id }: { id: string }) {
  const { t } = useT();
  const { closeSheet, toast, user } = useStore();
  const p = projectOf(id);
  if (!p) return null;
  const pick = (key: string) => {
    closeSheet();
    toast(t(key));
  };
  return (
    <Sheet visible onClose={closeSheet} title={t('help.title')} subtitle={p.title}>
      <Option icon="coin" title={t('help.pledgeT')} desc={t('help.pledgeD')} onPress={() => pick('help.pledgeToast')} />
      <Option icon="hand" title={t('help.volT')} desc={firebaseReady && p.volsNeeded - p.vols <= 0 ? t('hr.volOpen') : t('help.volD', { n: p.volsNeeded - p.vols })} onPress={() => pick('help.volToast')} />
      <Option icon="tool" title={t('help.giveT')} desc={t('help.giveD')} onPress={() => pick('help.giveToast')} />
      <Text style={s.note}>{t('help.note')}</Text>
    </Sheet>
  );
}

function ReportSheet({ id }: { id?: string }) {
  const { t } = useT();
  const { closeSheet, toast, user } = useStore();
  const pick = (reason: string) => {
    closeSheet();
    if (firebaseReady && user?.uid && id) report(user, 'post', id, reason).then(() => toast(t('t.reported'))).catch(() => toast(t('n.cm.fail')));
    else toast(t('t.reported'));
  };
  return (
    <Sheet visible onClose={closeSheet} title={t('rp.title')} subtitle={t('rp.sub')}>
      {['rp.r1', 'rp.r2', 'rp.r3', 'rp.r4'].map((k) => <Option key={k} title={t(k)} onPress={() => pick(k)} />)}
    </Sheet>
  );
}

// The prototype shows a local web link to copy. The app has no public link yet, so it previews the message and
// hands only that text to the phone's own share menu (no permission needed, nothing sent by the app itself).
function ShareSheet({ id }: { id: string }) {
  const { t } = useT();
  const { closeSheet } = useStore();
  const c = campaignOf(id);
  if (!c) return null;
  const text = t('sh.text', { t: c.title });
  return (
    <Sheet visible onClose={closeSheet} title={t('sh.title')}>
      <Text style={s.note}>{t('n.shareNote')}</Text>
      <View style={styles.preview}>
        <Text style={styles.when}>{t('sh.msg')}</Text>
        <Text style={styles.body}>{text}</Text>
      </View>
      <Button label={t('n.shareBtn')} icon="share" block onPress={() => { Share.share({ message: text }).catch(() => undefined); }} />
    </Sheet>
  );
}

function OrgSheet({ id }: { id: string }) {
  const { t, tr } = useT();
  const { closeSheet, open, following, toggle, toast, donations } = useStore();
  const o = orgOf(id);
  if (!o) return null;
  const theirs = projects.filter((p) => p.org === o.name);
  const funds = fundsOfOrg(o.id);
  const on = following.includes(o.id);
  return (
    <Sheet
      visible
      onClose={closeSheet}
      title={o.name}
      subtitle={<View style={styles.subRow}><Text style={s.note}>{o.type} · {o.area}</Text><SampleTag label={t('c.sample')} /><UntrTag /></View>}
    >
      <Text style={styles.body}>{o.about}</Text>
      <StatGrid items={[{ value: String(o.members), label: t('comm.members') }, { value: String(o.projects), label: t('comm.projectsRun') }]} />
      {theirs.length ? <Text style={styles.h3}>{t('comm.projects')}</Text> : null}
      {theirs.map((p) => (
        <Pressable key={p.id} onPress={() => open({ name: 'project', id: p.id })} accessibilityRole="button" style={styles.pp}>
          <Text style={styles.updTitle}>{p.title}</Text>
          <ProgressBar value={pledgedPct(p)} label={t('c.pledgedAria')} />
        </Pressable>
      ))}
      {funds.length ? <Text style={styles.h3}>{t('comm.fundOrg')}</Text> : null}
      {funds.map((c) => {
        const ds = donations[c.id] ?? [];
        return (
          <Pressable key={c.id} onPress={() => open({ name: 'campaign', id: c.id })} accessibilityRole="button" style={styles.pp}>
            <Text style={styles.updTitle}>{c.title}</Text>
            <TwoLayerBar id={`org-${c.id}`} solid={fundPct(c, ds)} hatched={pledgePct(c, ds)} label={t('cd.barAria', { r: fundPct(c, ds), p: pledgePct(c, ds) })} />
            <Rich text={tr('fund.recvOf', { a: inr(campaignReceived(c, ds)), b: inr(c.goal) })} style={s.note} />
          </Pressable>
        );
      })}
      <Button
        label={on ? t('comm.followingBtn') : t('comm.follow')}
        variant={on ? 'on' : 'primary'}
        block
        onPress={() => toast(t(toggle('following', o.id) ? 't.followed' : 't.unfollowed'))}
      />
    </Sheet>
  );
}

/** Renders whichever sheet the store says is open. */
export default function SheetHost() {
  const { sheet } = useStore();
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'post': return <PostSheet />;
    case 'updates': return <UpdatesSheet />;
    case 'help': return firebaseReady ? <HelpOffer id={sheet.id} /> : <HelpSheet id={sheet.id} />;
    case 'report': return <ReportSheet id={sheet.id} />;
    case 'org': return <OrgSheet id={sheet.id} />;
    case 'share': return <ShareSheet id={sheet.id} />;
    case 'sip': return <SipSheet cause={sheet.cause} />;
    case 'monthly': return <MonthlySheet id={sheet.id} sip={sheet.sip} />;
    case 'profile': return <ProfileDrawer />;
    case 'filters': return <FilterSheet />;
    case 'donate': return campaignOf(sheet.id) ? (firebaseReady ? <LiveDonateSheet id={sheet.id} /> : <DonateSheet id={sheet.id} />) : null;
  }
}

const styles = StyleSheet.create({
  subRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  update: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, gap: 2 },
  when: { fontSize: 11, fontWeight: '800', color: colors.slate, letterSpacing: 0.5, textTransform: 'uppercase' },
  updTitle: { ...type.cardTitle, fontSize: 15, color: colors.ink },
  body: { ...type.body, color: colors.ink },
  h3: { ...type.cardTitle, color: colors.ink, marginTop: space.s },
  preview: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 4, marginVertical: space.s },
  pp: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, gap: 6 },
});
