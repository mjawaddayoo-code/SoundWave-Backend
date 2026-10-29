import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Track from '../models/Track.js';
import { auth, adminOnly } from '../middleware/auth.js';

const router = Router();
const FIELDS = ['title', 'artist', 'album', 'genre', 'duration', 'cover', 'audioUrl', 'published'];
const pick = body => Object.fromEntries(FIELDS.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validUrl = u => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const playLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60 });

router.get('/', async (req, res, next) => {
  try {
    const { q, limit = 500 } = req.query;
    const filter = { published: true };
    if (q) {
      const rx = escapeRegex(String(q).slice(0, 80));
      filter.$or = ['title', 'artist', 'album', 'genre'].map(k => ({ [k]: { $regex: rx, $options: 'i' } }));
    }
    res.json(await Track.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 500, 500)).lean());
  } catch (e) { next(e); }
});

// Admin sees hidden (unpublished) tracks too
router.get('/admin/all', auth, adminOnly, async (req, res, next) => {
  try { res.json(await Track.find().sort({ createdAt: -1 }).lean()); } catch (e) { next(e); }
});

router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const data = pick(req.body);
    if (!data.title?.trim() || !data.artist?.trim() || !data.audioUrl?.trim()) return res.status(400).json({ message: 'Title, artist and audio URL are required' });
    if (!validUrl(data.audioUrl)) return res.status(400).json({ message: 'Audio URL must be a valid HTTP or HTTPS link' });
    if (data.cover && !validUrl(data.cover)) return res.status(400).json({ message: 'Cover URL must be a valid HTTP or HTTPS link' });
    res.status(201).json(await Track.create({ ...data, createdBy: req.user._id }));
  } catch (e) { next(e); }
});

router.patch('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const data = pick(req.body);
    if (data.audioUrl && !validUrl(data.audioUrl)) return res.status(400).json({ message: 'Audio URL must be a valid HTTP or HTTPS link' });
    if (data.cover && !validUrl(data.cover)) return res.status(400).json({ message: 'Cover URL must be a valid HTTP or HTTPS link' });
    const t = await Track.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!t) return res.status(404).json({ message: 'Track not found' });
    res.json(t);
  } catch (e) { next(e); }
});

router.delete('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const t = await Track.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ message: 'Track not found' });
    // remove deleted track from every playlist
    await (await import('../models/Playlist.js')).default.updateMany({ trackIds: t._id }, { $pull: { trackIds: t._id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/play', playLimiter, async (req, res, next) => {
  try {
    const t = await Track.findByIdAndUpdate(req.params.id, { $inc: { plays: 1 } }, { new: true });
    if (!t) return res.status(404).json({ message: 'Track not found' });
    res.json({ plays: t.plays });
  } catch (e) { next(e); }
});

export default router;
