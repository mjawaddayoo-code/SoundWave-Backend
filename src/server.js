import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import Track from './models/Track.js';
import Playlist from './models/Playlist.js';
import authRoutes from './routes/auth.js';
import trackRoutes from './routes/tracks.js';
import playlistRoutes from './routes/playlists.js';
import uploadRoutes from './routes/upload.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('ERROR: Set JWT_SECRET (16+ characters) in server/.env');
  process.exit(1);
}


// ---------- Auto catalog: 100 love songs + 100 nasheeds + 6 playlists (added once, automatically) ----------
// Titles/artists are original demo names; audio uses free SoundHelix demo MP3s as placeholders.
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


async function autoSeedCatalog() {
  try {
    const already = await Track.countDocuments({ album: { $in: ['Dil Ki Baatein', 'Love Letters', 'Noor Collection'] } });
    if (already > 0) return;
    let admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
    if (!admin && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      admin = await User.create({ name: process.env.ADMIN_NAME || 'Soundwave Admin', email: process.env.ADMIN_EMAIL.trim().toLowerCase(), passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12), role: 'admin' });
    }
    if (!admin) return console.log('Auto catalog skipped: no admin account yet.');
    const result = await Track.bulkWrite(tracksData.map(({ tag, ...t }) => ({
      updateOne: {
        filter: { title: t.title, artist: t.artist },
        update: { $setOnInsert: { ...t, plays: Math.floor(Math.random() * 90000), published: true, createdBy: admin._id } },
        upsert: true
      }
    })));
    const saved = await Track.find({ title: { $in: tracksData.map(t => t.title) } }).select('_id genre').lean();
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
    console.log(`Auto catalog added: ${result.upsertedCount} tracks, ${playlists.length} playlists.`);
  } catch (e) {
    console.error('Auto catalog failed:', e.message);
  }
}

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
const isLocalDev = o => /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(o);
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && isLocalDev(origin))),
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }), authRoutes);
app.use('/api/tracks', (req, res, next) => { if (!req.query.limit) req.query.limit = '500'; next(); }, trackRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/upload', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }), uploadRoutes);
app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'Soundwave API',
  database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}));

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use((err, req, res, next) => {
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid ID' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: Object.values(err.errors).map(e => e.message).join(', ') });
  if (err.name === 'MulterError') return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (audio max 40 MB, cover max 8 MB).' : err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
  console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Internal server error' });
});

const port = process.env.PORT || 5000;
try {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/soundwave');
  console.log('MongoDB connected');
  await autoSeedCatalog();
  app.listen(port, () => console.log(`Soundwave API listening on ${port}`));
} catch (err) {
  console.error('MongoDB connection failed:', err.message);
  console.error('Check MONGO_URI in server/.env (and Atlas Network Access IP allow-list).');
  process.exit(1);
}
