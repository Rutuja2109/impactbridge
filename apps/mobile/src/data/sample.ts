// Sample content for the Home screen. Every person, organisation, amount and story here is fictional
// demonstration data, matching the approved prototype. Nothing is fetched from the backend and nothing is verified.

export type CauseId = 'medical' | 'animals' | 'education' | 'food' | 'environment';

export type Cause = {
  id: CauseId;
  name: string;
  blurb: string;
  color: string; // illustration and icon colour
  soft: string; // light background
  ink: string; // text on the light background (4.5:1 or better)
};

export type Fundraiser = {
  id: string;
  cause: CauseId;
  title: string;
  organiser: string;
  raised: number;
  goal: number;
  daysLeft: number;
};

export type Story = { id: string; cause: CauseId; quote: string; who: string };

export type Project = {
  id: string;
  cause: CauseId;
  title: string;
  area: string;
  need: string;
  status: 'Open' | 'In progress';
};

export const causes: Cause[] = [
  { id: 'medical', name: 'Medical', blurb: 'Health camps and care', color: '#E5484D', soft: '#FDECEC', ink: '#B4262C' },
  { id: 'animals', name: 'Animals', blurb: 'Shelter and rescue', color: '#C27C0E', soft: '#FDF3E1', ink: '#8A5300' },
  { id: 'education', name: 'Education', blurb: 'Books and classrooms', color: '#3E63DD', soft: '#EBEFFC', ink: '#2E4BB8' },
  { id: 'food', name: 'Food & Hunger', blurb: 'Meals and rations', color: '#E5731A', soft: '#FDEFE3', ink: '#A84A06' },
  { id: 'environment', name: 'Environment', blurb: 'Trees and clean water', color: '#12805F', soft: '#E3F5EC', ink: '#0B6B4F' },
];

export const causeById = (id: CauseId): Cause => causes.find((c) => c.id === id) ?? causes[0];

// Ordered by number of (sample) supporters, the same "trending" rule as the prototype.
export const fundraisers: Fundraiser[] = [
  { id: 'c4', cause: 'food', title: 'Monsoon ration kits for 100 families', organiser: 'Sample Rotaract Club', raised: 120500, goal: 150000, daysLeft: 4 },
  { id: 'c3', cause: 'animals', title: 'Vaccination drive for 300 street dogs', organiser: 'Sample Paws Collective', raised: 73500, goal: 120000, daysLeft: 18 },
  { id: 'c1', cause: 'medical', title: 'Knee replacement surgery for Meera, 68', organiser: 'Ravi, her son (sample)', raised: 66500, goal: 180000, daysLeft: 12 },
  { id: 'c5', cause: 'environment', title: '10,000 native saplings for Pashan hill', organiser: 'Sample Green Ward', raised: 47000, goal: 200000, daysLeft: 40 },
  { id: 'c2', cause: 'education', title: 'First-year engineering fees for Pooja', organiser: 'Pooja herself (sample)', raised: 32000, goal: 85000, daysLeft: 25 },
];

export const stories: Story[] = [
  { id: 's1', cause: 'medical', quote: '“Knowing our neighbours cared made the hospital week easier.”', who: 'A fictional family member' },
  { id: 's2', cause: 'education', quote: '“Our reading corner is never empty on Saturdays.”', who: 'A fictional teacher' },
  { id: 's3', cause: 'animals', quote: '“The dogs near our market finally have a warm place to sleep.”', who: 'A fictional shopkeeper' },
  { id: 's4', cause: 'food', quote: '“Nobody on our lane went hungry after the rains.”', who: 'A fictional volunteer' },
  { id: 's5', cause: 'environment', quote: '“The lake edge looks like a park again.”', who: 'A fictional resident' },
];

export const projects: Project[] = [
  { id: 'p1', cause: 'medical', title: 'Free eye check-up camp for elders', area: 'Kothrud, Pune', need: '6 more volunteers needed', status: 'Open' },
  { id: 'p4', cause: 'food', title: 'Community kitchen for daily-wage workers', area: 'Shivajinagar, Pune', need: '2 volunteers to serve each day', status: 'In progress' },
  { id: 'p3', cause: 'education', title: 'Reading corner for a municipal school', area: 'Hadapsar, Pune', need: '400 children’s books', status: 'Open' },
  { id: 'p2', cause: 'animals', title: 'Winter shelter for street dogs', area: 'Aundh, Pune', need: '1 carpenter for two weekends', status: 'In progress' },
  { id: 'p6', cause: 'medical', title: 'Blood donation drive', area: 'Baner, Pune', need: 'Volunteers for outreach', status: 'Open' },
];

export const updatesCount = 3;
