import jwt from 'jsonwebtoken';
import User from '../models/User.js';
export async function auth(req,res,next){try{const header=req.headers.authorization||'';const token=header.startsWith('Bearer ')?header.slice(7):null;if(!token)return res.status(401).json({message:'Sign in required'});const payload=jwt.verify(token,process.env.JWT_SECRET);const user=await User.findById(payload.sub);if(!user||user.isSuspended)return res.status(401).json({message:'Account unavailable'});req.user=user;next()}catch{return res.status(401).json({message:'Invalid or expired token'})}}
export function adminOnly(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({message:'Administrator access required'});next()}
