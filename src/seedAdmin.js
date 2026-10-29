import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD||!process.env.JWT_SECRET){console.error('Set ADMIN_EMAIL, ADMIN_PASSWORD and JWT_SECRET in .env');process.exit(1)}
await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/soundwave');
const email=process.env.ADMIN_EMAIL.trim().toLowerCase();
const passwordHash=await bcrypt.hash(process.env.ADMIN_PASSWORD,12);
const user=await User.findOneAndUpdate({email},{$set:{name:process.env.ADMIN_NAME||'Soundwave Admin',passwordHash,role:'admin',isSuspended:false}},{new:true,upsert:true,setDefaultsOnInsert:true});
console.log(`Admin account ready: ${user.email}`);
await mongoose.disconnect();
