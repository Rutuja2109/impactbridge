// Test posts an admin can load and remove from the Admin screen. Every title starts with "[Sample]" and every document carries
// sample: true, so they are never mistaken for real needs and "Remove sample data" deletes exactly these (and their photos,
// offers of help and payments). Do this before publishing: remove them, then the app shows only real posts.
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from '@react-native-firebase/firestore';

import { db } from '../firebase';
import type { User } from '../screens/Welcome';

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const SUB = ['files', 'donations', 'responses', 'private', 'supporters'];

type Seed = { flow: 'problem' | 'project' | 'fund'; data: Record<string, string> };
const base = { display: 'Sample organiser', affected: 'Sample residents', private: 'sample@example.com', who: 'individual', contact: 'email' };

const SEEDS: Seed[] = [
  { flow: 'problem', data: { ...base, title: '[Sample] Broken hand pump in the lane', cat: 'environment', desc: 'The only hand pump in this lane has stopped working, so around forty families walk far for drinking water. A new valve and pipe would fix it.', help: 'Volunteers on Sunday and a plumber to replace the valve.', city: 'Pune', area: 'Kothrud', count: '40', urgency: 'high', lat: '18.5074', lng: '73.8077' } },
  { flow: 'problem', data: { ...base, title: '[Sample] Injured street dog needs a vet', cat: 'animals', desc: 'A street dog near the market has a deep leg wound. It needs a vet visit, dressing and a few days of safe shelter while it heals.', help: 'Someone with a vehicle to reach the vet, and a temporary foster.', city: 'Pune', area: 'Shivajinagar', count: '1', urgency: 'normal', lat: '18.5308', lng: '73.8475' } },
  { flow: 'project', data: { ...base, title: '[Sample] Weekend reading corner for children', cat: 'education', desc: 'We are setting up a free reading corner for children in the community hall every Saturday, and need books and volunteers to read aloud.', help: 'Story books in Marathi, Hindi and English, and volunteers for two hours.', city: 'Pune', area: 'Aundh', vols: '10', budget: '5000', target: inDays(45), lat: '18.5590', lng: '73.8077' } },
  { flow: 'project', data: { ...base, title: '[Sample] Neighbourhood tree planting day', cat: 'environment', desc: 'Planting native saplings along the river road with local residents. We need helping hands, watering cans and guards for the saplings.', help: 'Volunteers, watering cans and tree guards.', city: 'Pune', area: 'Baner', vols: '25', budget: '8000', target: inDays(30), lat: '18.5590', lng: '73.7868' } },
  { flow: 'fund', data: { ...base, title: '[Sample] Help with a child\'s surgery bills', cat: 'medical', story: 'A seven year old needs a minor surgery next month. The family has saved part of the cost but is short of the rest. Every contribution helps and receipts will be shared.', benName: 'Sample child', benAbout: 'Sample beneficiary for testing.', ctype: 'individual', relation: 'family', goal: '50000', use: 'Hospital bills and medicines for the surgery.', deadline: inDays(60), payLink: 'sample@okaxis', city: 'Pune', lat: '18.5196', lng: '73.8553' } },
  { flow: 'fund', data: { ...base, title: '[Sample] Meals for the community kitchen', cat: 'food', story: 'Our volunteer kitchen serves a hot meal every evening to people who cannot afford one. Rising prices mean we need help to keep going this season.', benName: 'Sample kitchen', benAbout: 'Sample organisation for testing.', ctype: 'org', orgName: 'Sample Seva Trust', goal: '30000', use: 'Rice, dal, vegetables and cooking gas for two months.', deadline: inDays(40), payLink: 'sample@okicici', city: 'Pune', lat: '18.4575', lng: '73.8508' } },
];

export async function loadSample(admin: User): Promise<number> {
  let n = 0;
  for (const s of SEEDS) {
    const ref = doc(collection(db!, 'posts'));
    await setDoc(ref, { flow: s.flow, data: s.data, ownerId: admin.uid, ownerName: 'Sample', status: 'approved', sample: true, createdAt: Date.now() - n * 3_600_000 });
    n += 1;
  }
  return n;
}

export async function removeSample(): Promise<number> {
  const posts = await getDocs(query(collection(db!, 'posts'), where('sample', '==', true)));
  for (const p of posts.docs) {
    const tickets = await getDocs(collection(db!, 'posts', p.id, 'responses'));
    for (const tk of tickets.docs) {
      const act = await getDocs(collection(db!, 'posts', p.id, 'responses', tk.id, 'activity'));
      await Promise.all(act.docs.map((d) => deleteDoc(d.ref)));
    }
    for (const sub of SUB) {
      const docs = await getDocs(collection(db!, 'posts', p.id, sub));
      await Promise.all(docs.docs.map((d) => deleteDoc(d.ref)));
    }
    await deleteDoc(p.ref);
  }
  return posts.size;
}
