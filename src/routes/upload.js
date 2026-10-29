import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { auth, adminOnly } from '../middleware/auth.js';

const router = Router();
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/flac', 'audio/webm'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const makeUploader = (allowed, maxMb) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => allowed.includes(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('This file type is not allowed.'), { status: 400 }))
});

const configured = () => {
  if (process.env.CLOUDINARY_URL) return true;
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) return false;
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return true;
};

const sendToCloudinary = (buffer, options) => new Promise((resolve, reject) => {
  cloudinary.uploader.upload_stream(options, (err, result) => err ? reject(err) : resolve(result)).end(buffer);
});

const handler = (folder, resource_type) => async (req, res, next) => {
  try {
    if (!configured()) return res.status(503).json({ message: 'Cloudinary is not set up. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to server/.env' });
    if (!req.file) return res.status(400).json({ message: 'No file received.' });
    const result = await sendToCloudinary(req.file.buffer, { folder: `soundwave/${folder}`, resource_type });
    res.status(201).json({ url: result.secure_url, duration: result.duration ? Math.round(result.duration) : undefined });
  } catch (e) {
    console.error('Cloudinary upload failed:', e.message);
    res.status(502).json({ message: 'Upload to Cloudinary failed. Check your Cloudinary keys.' });
  }
};

// Audio is stored by Cloudinary under resource_type "video" (that is how it handles audio files).
router.post('/audio', auth, adminOnly, makeUploader(AUDIO_TYPES, 40).single('file'), handler('audio', 'video'));
router.post('/cover', auth, adminOnly, makeUploader(IMAGE_TYPES, 8).single('file'), handler('covers', 'image'));

export default router;
