// Every sheet the prototype opens: post choices, updates, project help, report, organisation and demo donation.
// The open sheet lives in the store, so any screen can open one.
import { useEffect } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import Icon, { type IconName } from '../components/Icon';
import Sheet, { sheetStyles as s } from '../components/Sheet';
import { Button, ProgressBar, SampleTag, TwoLayerBar, UntrTag, StatGrid } from '../components/ui';
import { campaignOf, campaignReceived, campaigns, fundPct, fundsOfOrg, orgOf, pledgePct, pledgedPct, projectOf, projects } from '../data';
import { inr } from '../format';
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
      <Text style={s.note}>{t('post.demo')}</Text>
      <Option icon="heart" title={t('pc.problemT')} desc={t('pc.problemD')} onPress={() => go('problem')} />
      <Option icon="people" title={t('pc.projectT')} desc={t('pc.projectD')} onPress={() => go('project')} />
      <Option icon="coin" title={t('pc.fundT')} desc={t('pc.fundD')} onPress={() => go('fund')} />
    </Sheet>
  );
}

function UpdatesSheet() {
  const { t } = useT();
  const { closeSheet, open, notes, markRead } = useStore();
  useEffect(() => { markRead(); }, [markRead]);
  const items = campaigns.flatMap((c) => c.updates.map((u) => ({ c, u }))).sort((a, b) => a.u.ago - b.u.ago).slice(0, 8);
  return (
    <Sheet visible onClose={closeSheet} title={t('upd.title')} subtitle={<View style={styles.subRow}><Text style={s.note}>{t('upd.sub')}</Text><SampleTag label={t('c.sample')} /><UntrTag /></View>}>
      {notes.length ? <Text style={styles.h3}>{t('n.nt.title')}</Text> : null}
      {notes.map((n) => (
        <View key={n.id} style={styles.update}><Text style={s.note}>{t(n.key, n.p)}</Text></View>
      ))}
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
  const { closeSheet, toast } = useStore();
  const p = projectOf(id);
  if (!p) return null;
  const pick = (key: string) => { closeSheet(); toast(t(key)); };
  return (
    <Sheet visible onClose={closeSheet} title={t('help.title')} subtitle={p.title}>
      <Option icon="coin" title={t('help.pledgeT')} desc={t('help.pledgeD')} onPress={() => pick('help.pledgeToast')} />
      <Option icon="hand" title={t('help.volT')} desc={t('help.volD', { n: p.volsNeeded - p.vols })} onPress={() => pick('help.volToast')} />
      <Option icon="tool" title={t('help.giveT')} desc={t('help.giveD')} onPress={() => pick('help.giveToast')} />
      <Text style={s.note}>{t('help.note')}</Text>
    </Sheet>
  );
}

function ReportSheet() {
  const { t } = useT();
  const { closeSheet, toast } = useStore();
  const pick = () => { closeSheet(); toast(t('t.reported')); };
  return (
    <Sheet visible onClose={closeSheet} title={t('rp.title')} subtitle={t('rp.sub')}>
      {['rp.r1', 'rp.r2', 'rp.r3', 'rp.r4'].map((k) => <Option key={k} title={t(k)} onPress={pick} />)}
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
        const ds = donations[c.id];
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
    case 'help': return <HelpSheet id={sheet.id} />;
    case 'report': return <ReportSheet />;
    case 'org': return <OrgSheet id={sheet.id} />;
    case 'share': return <ShareSheet id={sheet.id} />;
    case 'sip': return <SipSheet cause={sheet.cause} />;
    case 'profile': return <ProfileDrawer />;
    case 'filters': return <FilterSheet />;
    case 'donate': return campaignOf(sheet.id) ? <DonateSheet id={sheet.id} /> : null;
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
