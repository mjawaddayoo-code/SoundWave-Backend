// Adds 100 love songs + 100 nasheeds (+ 6 playlists) to MongoDB.
// Safe to run many times: existing records are NOT changed or duplicated.
// NOTE: titles/artists are original demo names. Audio uses the free SoundHelix demo MP3s as placeholders —
// replace audioUrl later (Admin dashboard) with files you own or are licensed to stream.
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import { fileURLToPath } from 'url';
import User from './models/User.js';
import Track from './models/Track.js';
import Playlist from './models/Playlist.js';

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/soundwave';
const audio = i => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(i % 17) + 1}.mp3`;
const cover = (tag, i) => `https://picsum.photos/seed/${tag}${i}/600/600`;
const build = (nouns, templates, count) => {
  const out = [];
  for (let i = 0; out.length < count; i++) {
    const t = `${templates[(i * 3 + Math.floor(i / nouns.length)) % templates.length]}`.replace('{}', nouns[i % nouns.length]);
    if (!out.includes(t)) out.push(t);
  }
  return out;
};

const urduTitles = build(
  ['Dil', 'Chand', 'Raat', 'Barish', 'Yaad', 'Mohabbat', 'Ishq', 'Khwab', 'Sitara', 'Waqt'],
  ['Tere Naam Ka {}', '{} Ki Baatein', 'Meri {} Tum Ho', '{} Se Aage', 'Tum Ho Mera {}', 'Phir Aaya {}', '{} Ka Safar', 'Sirf {} Tumhara', '{} Ki Dastaan', 'Ek {} Tere Liye'],
  50
);
const englishTitles = build(
  ['Heart', 'Moonlight', 'Forever', 'Midnight', 'Summer', 'Promise', 'Stars', 'Rain', 'Home', 'Dream'],
  ['{} With You', 'Only {}', 'Dancing in the {}', 'My {} Is Yours', 'Hold My {}', 'Take Me {}', 'Under the {}', '{} Of Us', 'Love in the {}', 'Stay My {}'],
  50
);
const nasheedTitles = build(
  ['Madina', 'Noor', 'Rehmat', 'Dua', 'Sabr', 'Fajr', 'Jannat', 'Hidayat', 'Shukr', 'Iman'],
  ['{} Ki Roshni', '{} Ka Safar', 'Dil Mein {}', '{} Ki Khushboo', 'Mera {} Allah', '{} Ke Saaye Mein', 'Ya Rab {}', '{} Ki Raah', 'Sukoon-e-{}', 'Meharbani {}'],
  100
);

const urduArtists = ['Aria Khan', 'Zaheer Ali', 'Mehr Noor', 'Sameer Raza', 'Hira Sheikh'];
const englishArtists = ['Luna Hart', 'Eli Rivers', 'Skye Monroe', 'Jude Avery', 'Nora Bell'];
const nasheedArtists = ['Noor Voices', 'Sabr Collective', 'Al-Hidaya Choir', 'Imran Qadri', 'Salman Farooq', 'Madinah Echoes'];

const tracksData = [
  ...urduTitles.map((title, i) => ({ title, artist: urduArtists[i % 5], album: 'Dil Ki Baatein', genre: 'Urdu Love', tag: 'urdu' })),
  ...englishTitles.map((title, i) => ({ title, artist: englishArtists[i % 5], album: 'Love Letters', genre: 'English Love', tag: 'eng' })),
  ...nasheedTitles.map((title, i) => ({ title, artist: nasheedArtists[i % 6], album: 'Noor Collection', genre: 'Nasheed', tag: 'nasheed' }))
].map((t, i) => ({ ...t, duration: 180 + ((i * 17) % 120), cover: cover(t.tag, i), audioUrl: audio(i) }));

// Auto-fix: older tracks.js only returned 100 tracks. Allow up to 500 so all 200 new tracks show on the site.
try {
  const tracksRoute = fileURLToPath(new URL('./routes/tracks.js', import.meta.url));
  let code = fs.readFileSync(tracksRoute, 'utf8');
  const fixed = code
    .replace('limit = 100 }', 'limit = 500 }')
    .replace('Number(limit) || 100, 200)', 'Number(limit) || 500, 500)');
  if (fixed !== code) { fs.writeFileSync(tracksRoute, fixed); console.log('Updated routes/tracks.js (limit 500).'); }
} catch (e) { console.log('Skipped tracks.js update:', e.message); }

try {
  await mongoose.connect(mongoUri);
  const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
  if (!admin) throw new Error('Admin not found. First run: npm run seed:admin');

  const result = await Track.bulkWrite(tracksData.map(({ tag, ...t }) => ({
    updateOne: {
      filter: { title: t.title, artist: t.artist },
      update: { $setOnInsert: { ...t, plays: Math.floor(Math.random() * 90000), published: true, createdBy: admin._id } },
      upsert: true
    }
  })));

  const saved = await Track.find({ title: { $in: tracksData.map(t => t.title) } }).select('_id title artist genre').lean();
  const ids = genre => saved.filter(t => t.genre === genre).map(t => t._id);
  const urdu = ids('Urdu Love'), eng = ids('English Love'), nash = ids('Nasheed');

  const playlists = [
    { name: 'Urdu Love Hits', description: 'Dil ko chhu jane wale Urdu love songs.', cover: cover('pl', 1), trackIds: urdu.slice(0, 30) },
    { name: 'English Love Songs', description: 'Romantic songs for every mood.', cover: cover('pl', 2), trackIds: eng.slice(0, 30) },
    { name: 'Nasheed Collection', description: 'Sukoon bhare nasheeds.', cover: cover('pl', 3), trackIds: nash.slice(0, 40) },
    { name: 'Fajr Nasheeds', description: 'Subah ka sukoon.', cover: cover('pl', 4), trackIds: nash.slice(40, 70) },
    { name: 'Late Night Love', description: 'Raat ki khamoshi aur mohabbat.', cover: cover('pl', 5), trackIds: [...urdu.slice(30), ...eng.slice(30)] },
    { name: 'Peaceful Nasheeds', description: 'Dil ka sukoon.', cover: cover('pl', 6), trackIds: nash.slice(70) }
  ];
  for (const p of playlists) {
    await Playlist.findOneAndUpdate({ name: p.name, owner: admin._id }, { $setOnInsert: { ...p, owner: admin._id, isPublic: true } }, { upsert: true, setDefaultsOnInsert: true });
  }

  console.log(`Catalog ready: ${result.upsertedCount} new tracks added (${tracksData.length - result.upsertedCount} already existed).`);
  console.log(`Totals -> Urdu Love: ${urdu.length}, English Love: ${eng.length}, Nasheed: ${nash.length}. Playlists: ${playlists.length}.`);
} catch (e) {
  console.error('Could not seed catalog:', e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
