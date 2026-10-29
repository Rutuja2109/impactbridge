import { Pressable, Text, View } from 'react-native';

import { campaignPledged, campaignReceived, fundPct, type Campaign } from '../data';
import { inr } from '../format';
import { Rich, useT } from '../i18n';
import { useStore } from '../state/store';
import { CoverArt } from './Art';
import { cardStyles as styles } from './ProjectCard';
import { Badge, Button, CauseBadge, ProgressBar, SampleTag, UntrTag, VerifyBadge } from './ui';

// Fundraiser card as in the prototype. Amounts are simulated; pledges are shown apart from received money.
// `support` adds the Home screen's "Support" button, which opens the demo donation.
export default function CampaignCard({ campaign: c, support }: { campaign: Campaign; support?: boolean }) {
  const { t, tr } = useT();
  const { open, showSheet, donations } = useStore();
  const ds = donations[c.id];
  const received = campaignReceived(c, ds);
  const pledged = campaignPledged(ds);
  const pct = fundPct(c, ds);
  const openIt = () => open({ name: 'campaign', id: c.id });
  const typeLabel = t(c.type === 'org' ? 'fund.org' : 'fund.individual');
  return (
    <View style={styles.card}>
      <Pressable onPress={openIt} accessibilityRole="button" accessibilityLabel={`${c.title}. ${t('fund.recvOf', { a: inr(received), b: inr(c.goal) })}`}>
        <View>
          <CoverArt cause={c.cat} id={c.id} height={150} placeholder={t('fund.placeholder')} />
          <View style={styles.badges}>
            <VerifyBadge status={c.verify} />
            <CauseBadge cause={c.cat} />
            {c.urgent ? <Badge label={t('fund.urgent')} tone="brick" /> : null}
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{c.title}</Text>
          <Text style={styles.metaText}>{c.short}</Text>
          <Text style={styles.metaText}>{t('cd.beneficiary')}: {c.beneficiary}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>{t('cd.organizer')}: {c.organizer} · {typeLabel}</Text>
            <SampleTag label={t('c.sample')} />
            <UntrTag />
          </View>
          <ProgressBar value={pct} label={t('leg.simRecv')} height={10} />
          <View style={styles.row}>
            <Rich text={tr('fund.recvOf', { a: inr(received), b: inr(c.goal) })} style={styles.amount} boldStyle={styles.amountBold} />
            <Text style={styles.days}>{t('c.daysLeft', { n: c.days })}</Text>
          </View>
          {pledged ? <Text style={styles.metaText}>{t('fund.pledgedNote', { a: inr(pledged) })}</Text> : null}
        </View>
      </Pressable>
      <View style={styles.foot}>
        {support ? (
          <>
            <Button label={t('b.support')} small onPress={() => showSheet({ kind: 'donate', id: c.id })} accessibilityLabel={t('b.supportT', { t: c.title })} style={styles.flex} />
            <Button label={t('fund.view')} variant="ghost" small onPress={openIt} style={styles.flex} />
          </>
        ) : (
          <Button label={t('fund.view')} small onPress={openIt} style={styles.flex} />
        )}
      </View>
    </View>
  );
}
