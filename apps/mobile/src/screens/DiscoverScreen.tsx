import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT } from '../components/BottomNav';
import CampaignCard from '../components/CampaignCard';
import Icon from '../components/Icon';
import IllustrativeMap, { type MapItem } from '../components/IllustrativeMap';
import OsmMap, { type GeoItem } from '../components/OsmMap';
import ProjectCard from '../components/ProjectCard';
import { Button, ChipRow, PageHead, Segmented, UntrNote } from '../components/ui';
import { catOf, categories, fundPct, pledgedPct, type CauseId } from '../data';
import { activeCount, NO_FILTERS } from '../data/filters';
import { firebaseReady } from '../firebase';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { useDiscoverResults } from './useDiscoverResults';
import { colors, radius, space } from '../theme';

// Discover, as in the prototype: search, Projects / Fundraisers, the five causes, and a List / illustrative Map view.
// Filters stay as they are when switching views or opening a card and coming back.
export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { discover: d, setDiscover, open, donations, showSheet } = useStore();
  const { fund, projectList: shownProjects, campaignList: shownCampaigns, count: n } = useDiscoverResults(d.f);
  const nFilters = activeCount(d.f, fund);
  const count = fund ? (n === 1 ? t('disc.fcount1') : t('disc.fcountN', { n })) : (n === 1 ? t('disc.count1') : t('disc.countN', { n }));

  const mapItems: MapItem[] = fund
    ? shownCampaigns.map((c) => ({ id: c.id, cat: c.cat, x: c.x, y: c.y, title: c.title, meta: `${c.organizer} · ${t('map.fpct', { n: fundPct(c, donations[c.id]) })}` }))
    : shownProjects.map((p) => ({ id: p.id, cat: p.cat, x: p.x, y: p.y, title: p.title, meta: `${p.area} · ${t('map.pct', { n: pledgedPct(p) })}` }));
  const geoItems: GeoItem[] = (fund ? shownCampaigns : shownProjects)
    .filter((x) => typeof x.lat === 'number' && typeof x.lng === 'number')
    .map((x) => ({ id: x.id, lat: x.lat as number, lng: x.lng as number, title: x.title, meta: fund ? (x as typeof shownCampaigns[number]).organizer : (x as typeof shownProjects[number]).area, color: catOf(x.cat).color }));
  const pin = mapItems.some((m) => m.id === d.pin) ? d.pin : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
      <PageHead title={t('disc.title')} subtitle={t('disc.sub')} tag={t('c.sampleData')} />

      <View style={styles.searchRow}>
      <View style={[styles.search, styles.grow]}>
        <Icon name="search" size={20} color={colors.slate} />
        <TextInput
          value={d.q}
          onChangeText={(v) => setDiscover({ q: v })}
          placeholder={t('disc.search')}
          placeholderTextColor={colors.slate}
          accessibilityLabel={t('disc.searchAria')}
          returnKeyType="search"
          style={styles.input}
        />
        {d.q ? <Text onPress={() => setDiscover({ q: '' })} accessibilityRole="button" accessibilityLabel={t('c.close')} style={styles.clearX}>✕</Text> : null}
      </View>
        <Pressable onPress={() => showSheet({ kind: 'filters' })} accessibilityRole="button" accessibilityLabel={nFilters ? `${t('n.f.btn')}. ${t('n.f.applied', { n: nFilters })}` : t('n.f.btn')} style={[styles.filterBtn, nFilters > 0 && styles.filterOn]}>
          <Icon name="filter" size={22} color={nFilters ? colors.white : colors.tealDark} />
          {nFilters > 0 ? <View style={styles.badge}><Text style={styles.countText}>{nFilters}</Text></View> : null}
        </Pressable>
      </View>

      <View style={styles.block}>
        <Segmented
          stretch
          label={t('disc.kind')}
          selected={d.kind}
          onSelect={(k) => setDiscover({ kind: k as 'projects' | 'fund', pin: null })}
          items={[{ id: 'projects', label: t('disc.projects') }, { id: 'fund', label: t('disc.fundraisers') }]}
        />
      </View>

      <ChipRow
        label={t('disc.filter')}
        selected={d.cat}
        onSelect={(id) => setDiscover({ cat: id as 'all' | CauseId, pin: null })}
        items={[{ id: 'all', label: t('disc.all') }, ...categories.map((c) => ({ id: c.id, label: t(`cat.${c.id}`) }))]}
      />

      <View style={styles.toolbar}>
        <Text style={styles.count} accessibilityLiveRegion="polite">{count}</Text>
        <Segmented
          label={t('disc.view')}
          selected={d.view}
          onSelect={(v) => setDiscover({ view: v as 'list' | 'map' })}
          items={[{ id: 'list', label: t('disc.list') }, { id: 'map', label: t('disc.map') }]}
        />
      </View>
      <UntrNote style={styles.note} />

      {n === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t(fund ? 'disc.noneF' : firebaseReady && !d.q && d.cat === 'all' ? 'n.live.noneT' : 'disc.noneT')}</Text>
          <Text style={styles.emptyText}>{t(firebaseReady && !d.q && d.cat === 'all' ? 'n.live.noneD' : 'disc.noneD')}</Text>
          <Button label={t('disc.clear')} variant="ghost" small onPress={() => setDiscover({ q: '', cat: 'all', pin: null, f: NO_FILTERS })} />
        </View>
      ) : d.view === 'map' && firebaseReady ? (
        <OsmMap items={geoItems} onOpen={(id) => open({ name: fund ? 'campaign' : 'project', id })} />
      ) : d.view === 'map' ? (
        <IllustrativeMap
          items={mapItems}
          selected={pin}
          onSelect={(id) => setDiscover({ pin: id })}
          onOpen={(id) => open({ name: fund ? 'campaign' : 'project', id })}
        />
      ) : fund ? (
        shownCampaigns.map((c) => <CampaignCard key={c.id} campaign={c} />)
      ) : (
        shownProjects.map((p) => <ProjectCard key={p.id} project={p} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: space.l, marginTop: space.m },
  grow: { flex: 1 },
  filterBtn: { width: 50, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  filterOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countText: { fontSize: 11, fontWeight: '800', color: colors.white },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  input: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  clearX: { fontSize: 16, color: colors.slate, paddingHorizontal: 4 },
  block: { marginHorizontal: space.l, marginTop: space.m, marginBottom: space.m },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginHorizontal: space.l, marginVertical: space.m },
  count: { flex: 1, fontSize: 14, color: colors.slate },
  note: { marginHorizontal: space.l, marginBottom: space.m },
  empty: { marginHorizontal: space.l, alignItems: 'center', gap: 8, padding: space.xxl, borderRadius: radius.m, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 15, color: colors.slate, textAlign: 'center' },
});
