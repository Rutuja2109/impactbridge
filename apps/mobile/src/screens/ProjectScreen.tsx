import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT } from '../components/BottomNav';
import { CTA_HEIGHT, DetailTop, NotFound, Row, StickyCta, detailStyles as d } from '../components/Detail';
import Icon from '../components/Icon';
import { Button, CauseBadge, Legend, Panel, PanelTitle, SampleTag, StatGrid, StatusBadge, TwoLayerBar, UntrTag } from '../components/ui';
import { pledgedPct, projectOf, receivedPct } from '../data';
import { inr } from '../format';
import { firebaseReady } from '../firebase';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, space } from '../theme';

// Project detail, as in the prototype: about, what's needed, the seven-step journey, and a support panel
// that keeps pledged money apart from money actually received.
export default function ProjectScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { showSheet, toast, openDiscover, goTab } = useStore();
  const p = projectOf(id);
  if (!p) return <NotFound onBack={() => openDiscover({ kind: 'projects' })} />;

  const done = p.status === 'Completed';
  const reached = done ? (p.verified ? 7 : 6) : p.status === 'In progress' ? 5 : 4;
  const pl = pledgedPct(p);
  const rc = receivedPct(p);
  // "by {o}" puts the name first in Hindi and Marathi, so split around it; the name links to Community, as in the prototype.
  const [byBefore, byAfter = ''] = t('proj.byOrg', { o: '\u0001' }).split('\u0001');
  const help = () => showSheet({ kind: 'help', id: p.id });
  const share = () => toast(t('c.linkCopied'));

  return (
    <View style={d.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + (done ? 0 : CTA_HEIGHT) + space.xxl }}>
        <DetailTop cause={p.cat} id={p.id} />
        <View style={d.wrap}>
          <Row>
            <StatusBadge project={p} />
            <CauseBadge cause={p.cat} />
            <SampleTag label={t('c.sampleProject')} />
            <UntrTag />
          </Row>
          <Text accessibilityRole="header" style={d.h1}>{p.title}</Text>
          <View style={styles.meta}>
            <Icon name="pin" size={16} color={colors.slate} />
            <Text style={d.small}>
              {p.area} · {byBefore}
              <Text style={styles.link} onPress={() => goTab('community')} accessibilityRole="link">{p.org}</Text>
              {byAfter}
            </Text>
          </View>

          <Panel>
            <PanelTitle>{t('proj.about')}</PanelTitle>
            <Text style={d.body}>{p.desc}</Text>
          </Panel>

          <Panel>
            <PanelTitle>{done ? t('proj.delivered') : t('proj.needed')}</PanelTitle>
            {p.needs.length ? p.needs.map((n) => (
              <View key={n} style={d.bullet}><Text style={d.dot}>•</Text><Text style={[d.body, styles.flex]}>{n}</Text></View>
            )) : <Text style={d.muted}>{p.verified ? t('proj.metV') : t('proj.metU')}</Text>}
          </Panel>

          <Panel>
            <PanelTitle>{t('proj.journey')}</PanelTitle>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => {
              const ok = n <= reached;
              return (
                <View key={n} style={styles.step} accessibilityLabel={`${t(`j${n}`)}${ok ? ' ✓' : ''}`}>
                  <View style={[styles.stepDot, ok && styles.stepDotOn]}>
                    {ok ? <Icon name="check" size={14} color={colors.white} strokeWidth={3} /> : <Text style={styles.stepNum}>{n}</Text>}
                  </View>
                  <Text style={[d.body, styles.flex, !ok && styles.stepTodo]}>{t(`j${n}`)}</Text>
                </View>
              );
            })}
          </Panel>

          <Panel>
            <PanelTitle>{t('proj.head', { p: pl, r: rc })}</PanelTitle>
            <TwoLayerBar id={`p-${p.id}`} solid={rc} hatched={Math.max(0, pl - rc)} label={t('proj.barAria', { p: pl, r: rc })} />
            <Legend items={[{ label: t('leg.pledged'), kind: 'hatched' }, { label: t('leg.received'), kind: 'solid' }]} />
            <StatGrid
              items={[
                { value: inr(p.raised), label: t('proj.pledgedOf', { g: inr(p.goal) }) },
                { value: inr(p.received), label: t('proj.receivedBy') },
                { value: t('proj.volsOf', { a: p.vols, b: p.volsNeeded }), label: t('proj.volsSigned') },
                { value: t('proj.hrs', { n: p.hours }), label: p.verified ? t('proj.hrsDoneV') : t('proj.hrsDone') },
              ]}
            />
            <Text style={d.small}>{done ? t('proj.complete') : t('proj.left', { n: p.days })}</Text>
            {done ? null : <Button label={t('c.help')} block onPress={help} />}
            <Button label={t('c.share')} icon="share" variant="ghost" block onPress={share} />
            {firebaseReady ? <Button label={t('b.report')} variant="ghost" small onPress={() => showSheet({ kind: 'report', id: p.id })} /> : null}
          </Panel>
        </View>
      </ScrollView>
      {done ? null : <StickyCta shareLabel={t('c.share')} onShare={share} label={t('c.help')} onPress={help} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  link: { color: colors.tealDark, fontWeight: '700', textDecorationLine: 'underline' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  stepDotOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  stepNum: { fontSize: 12, fontWeight: '800', color: colors.slate },
  stepTodo: { color: colors.slate },
});
