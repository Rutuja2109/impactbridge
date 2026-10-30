// The Discover list for the current search, cause chip and (optionally draft) filters, so the screen and the
// filter sheet's live "Show N results" button always agree.
import { campaigns, projects, type CauseId } from '../data';
import { filterCampaigns, filterProjects, NO_FILTERS, type Filters } from '../data/filters';
import { STRINGS } from '../i18n/strings.generated';
import { useT } from '../i18n';
import { useStore } from '../state/store';

export function useDiscoverResults(f: Filters) {
  const { t } = useT();
  const { discover: d, donations } = useStore();
  const all = d.kind === 'all';
  const fund = d.kind === 'fund';
  const q = d.q.trim().toLowerCase();
  const causeWords = (cat: CauseId) => `${t(`cat.${cat}`)} ${(STRINGS.en as Record<string, string>)[`cat.${cat}`]}`;
  const inCat = (cat: CauseId) => d.cat === 'all' || cat === d.cat;
  const matches = (words: string[]) => !q || words.join(' ').toLowerCase().includes(q);
  const pf = all ? NO_FILTERS : f; // the Filters sheet is per type, so "All" only uses search and the cause chips
  const projectList = fund ? [] : filterProjects(projects.filter((p) => inCat(p.cat) && matches([p.title, p.org, p.area, p.desc, causeWords(p.cat)])), pf);
  const campaignList = fund || all ? filterCampaigns(campaigns.filter((c) => inCat(c.cat) && matches([c.title, c.short, c.story, c.organizer, c.beneficiary, causeWords(c.cat)])), pf, donations) : [];
  return { all, fund, projectList, campaignList, count: all ? projectList.length + campaignList.length : fund ? campaignList.length : projectList.length };
}
