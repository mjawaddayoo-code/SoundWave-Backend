import { Router } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Playlist from '../models/Playlist.js';
import { auth, adminOnly } from '../middleware/auth.js';

const router = Router();
const populateTracks = { path: 'trackIds', match: { published: true } };
const cleanIds = ids => Array.isArray(ids) ? [...new Set(ids.filter(id => mongoose.isValidObjectId(id)).map(String))] : undefined;

// Public playlists for everyone; a signed-in user also sees their own.
router.get('/', async (req, res, next) => {
  try {
    let owner = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      try { owner = jwt.verify(header.slice(7), process.env.JWT_SECRET).sub; } catch { /* anonymous */ }
    }
    const filter = owner ? { $or: [{ owner }, { isPublic: true }] } : { isPublic: true };
    res.json(await Playlist.find(filter).populate(populateTracks).sort({ updatedAt: -1 }).lean());
  } catch (e) { next(e); }
});

router.get('/admin/all', auth, adminOnly, async (req, res, next) => {
  try { res.json(await Playlist.find().populate('trackIds').sort({ updatedAt: -1 }).lean()); } catch (e) { next(e); }
});

router.post('/admin', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, description = '', cover = '' } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Playlist name is required' });
    const p = await Playlist.create({ name: name.trim(), description, cover, trackIds: cleanIds(req.body.trackIds) || [], owner: req.user._id, isPublic: true });
    res.status(201).json(await p.populate('trackIds'));
  } catch (e) { next(e); }
});

// Admin can edit any playlist (name, cover, tracks)
router.patch('/admin/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const p = await Playlist.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Playlist not found' });
    for (const key of ['name', 'description', 'cover']) if (req.body[key] !== undefined) p[key] = req.body[key];
    const ids = cleanIds(req.body.trackIds);
    if (ids) p.trackIds = ids;
    await p.save();
    res.json(await p.populate('trackIds'));
  } catch (e) { next(e); }
});

router.delete('/admin/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const p = await Playlist.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ message: 'Playlist not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { name, description, cover, isPublic } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Playlist name is required' });
    const p = await Playlist.create({ name: name.trim(), description, cover, trackIds: cleanIds(req.body.trackIds) || [], isPublic: req.user.role === 'admin' ? Boolean(isPublic) : false, owner: req.user._id });
    res.status(201).json(await p.populate('trackIds'));
  } catch (e) { next(e); }
});

router.patch('/:id', auth, async (req, res, next) => {
  try {
    const p = await Playlist.findOne({ _id: req.params.id, owner: req.user._id });
    if (!p) return res.status(404).json({ message: 'Playlist not found' });
    for (const key of ['name', 'description', 'cover']) if (req.body[key] !== undefined) p[key] = req.body[key];
    const ids = cleanIds(req.body.trackIds);
    if (ids) p.trackIds = ids;
    await p.save();
    res.json(await p.populate('trackIds'));
  } catch (e) { next(e); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const p = await Playlist.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!p) return res.status(404).json({ message: 'Playlist not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
