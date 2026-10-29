import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT } from '../components/BottomNav';
import CampaignCard from '../components/CampaignCard';
import Icon from '../components/Icon';
import { Badge, Button, PageHead, SampleTag, SectionHeader, UntrNote } from '../components/ui';
import { campaigns, events, fundsOfOrg, opportunities, orgs } from '../data';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, shadow, space, type } from '../theme';

const AV = ['#00918F', '#3E63DD', '#C27C0E', '#12805F'];

// Community, as in the prototype: organisations (open their sheet), their fundraisers, volunteer opportunities
// and events. Sign-ups and RSVPs are session-only demo state.
export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const { t, formatDate } = useT();
  const { showSheet, following, joined, going, toggle, toast, openDiscover } = useStore();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }}>
      <PageHead title={t('comm.title')} subtitle={t('comm.sub')} tag={t('c.sampleData')} />
      <UntrNote style={styles.note} />

      <SectionHeader title={t('comm.orgs')} />
      {orgs.map((o, i) => {
        const on = following.includes(o.id);
        const nf = fundsOfOrg(o.id).length;
        return (
          <Pressable key={o.id} onPress={() => showSheet({ kind: 'org', id: o.id })} accessibilityRole="button" style={({ pressed }) => [styles.card, styles.org, pressed && styles.pressed]}>
            <View style={[styles.avatar, { backgroundColor: AV[i % 4] }]}>
              <Text style={styles.avatarText}>{o.name.replace('Sample ', '').slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.grow}>
              <Text style={styles.title}>{o.name}</Text>
              <Text style={styles.meta}>
                {o.type} · {o.area} · {t('comm.projectsN', { n: o.projects })}{nf ? ` · ${t('comm.fundN', { n: nf })}` : ''}
              </Text>
            </View>
            <Badge label={on ? t('comm.following') : t('comm.view')} tone={on ? 'leaf' : 'teal'} />
          </Pressable>
        );
      })}

      <SectionHeader title={t('comm.fund')} link={t('fund.seeAll')} onLink={() => openDiscover({ kind: 'fund', cat: 'all' })} subtitle={t('comm.fundSub')} tag={t('fund.sampleCampaigns')} />
      {campaigns.filter((c) => c.org).map((c) => <CampaignCard key={c.id} campaign={c} />)}

      <SectionHeader title={t('comm.opps')} subtitle={t('comm.oppsNote')} />
      {opportunities.map((v) => {
        const on = joined.includes(v.id);
        return (
          <View key={v.id} style={[styles.card, styles.opp]}>
            <Text style={styles.title}>{v.title}</Text>
            <Text style={styles.meta}>{v.org}</Text>
            <View style={styles.inline}><Icon name="clock" size={15} color={colors.slate} /><Text style={styles.meta}>{v.when}</Text></View>
            <Text style={styles.meta}>{v.skill} · {t('comm.spots', { n: v.spots - (on ? 1 : 0) })}</Text>
            <Button
              label={on ? t('comm.signedUp') : t('comm.signUp')}
              variant={on ? 'on' : 'primary'}
              small
              style={styles.self}
              onPress={() => toast(t(toggle('joined', v.id) ? 't.signed' : 't.unsigned'))}
            />
          </View>
        );
      })}

      <SectionHeader title={t('comm.events')} />
      {events.map((e) => {
        const on = going.includes(e.id);
        return (
          <View key={e.id} style={[styles.card, styles.event]}>
            <View style={styles.date}>
              <Text style={styles.day}>{formatDate(e.date, { day: '2-digit' })}</Text>
              <Text style={styles.month}>{formatDate(e.date, { month: 'short' })}</Text>
            </View>
            <View style={styles.grow}>
              <Text style={styles.title}>{e.title}</Text>
              <Text style={styles.meta}>{e.place} · {e.time}</Text>
              <Text style={styles.meta}>{t('comm.going', { n: e.going + (on ? 1 : 0) })}</Text>
            </View>
            <Button
              label={on ? t('comm.goingBtn') : t('comm.rsvp')}
              variant={on ? 'on' : 'ghost'}
              small
              onPress={() => toast(t(toggle('going', e.id) ? 't.rsvp' : 't.unrsvp'))}
            />
          </View>
        );
      })}
      <View style={styles.footTag}><SampleTag label={t('c.sampleData')} /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  note: { marginHorizontal: space.l, marginTop: space.s },
  card: { marginHorizontal: space.l, marginBottom: space.m, padding: space.l, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, boxShadow: shadow.card },
  pressed: { borderColor: colors.teal },
  org: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.cardTitle, color: colors.ink },
  meta: { ...type.small, color: colors.slate },
  opp: { gap: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  self: { alignSelf: 'flex-start', marginTop: 6 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  date: { width: 54, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center' },
  day: { fontSize: 20, fontWeight: '800', color: colors.tealDeep },
  month: { fontSize: 12, fontWeight: '700', color: colors.tealDeep, textTransform: 'uppercase' },
  footTag: { marginHorizontal: space.l, marginTop: space.s },
});
