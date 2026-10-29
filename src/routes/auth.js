import {Router} from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Playlist from '../models/Playlist.js';
import {auth,adminOnly} from '../middleware/auth.js';
const router=Router();
const tokenFor=user=>jwt.sign({sub:user._id.toString()},process.env.JWT_SECRET,{expiresIn:'7d'});
const publicUser=user=>({id:user._id,name:user.name,email:user.email,role:user.role,subscription:user.subscription,isSuspended:Boolean(user.isSuspended)});
router.post('/signup',async(req,res,next)=>{try{const {name,email,password}=req.body;if(!name?.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')||typeof password!=='string'||password.length<8||password.length>72)return res.status(400).json({message:'Name, valid email and password (8+ characters) are required'});const normalized=email.trim().toLowerCase();if(await User.exists({email:normalized}))return res.status(409).json({message:'Email is already registered'});const user=await User.create({name:name.trim(),email:normalized,passwordHash:await bcrypt.hash(password,12)});res.status(201).json({user:publicUser(user),token:tokenFor(user)})}catch(e){next(e)}});
router.post('/login',async(req,res,next)=>{try{const {email,password}=req.body;const user=await User.findOne({email:(email||'').trim().toLowerCase()}).select('+passwordHash');if(!user||!(await bcrypt.compare(password||'',user.passwordHash)))return res.status(401).json({message:'Invalid email or password'});if(user.isSuspended)return res.status(403).json({message:'This account is suspended'});res.json({user:publicUser(user),token:tokenFor(user)})}catch(e){next(e)}});
router.get('/users',auth,adminOnly,async(req,res,next)=>{try{const users=await User.find().select('name email role subscription isSuspended createdAt').sort({createdAt:-1}).lean();res.json(users.map(u=>({...u,id:u._id,isSuspended:Boolean(u.isSuspended)})).map(({_id,...u})=>u))}catch(e){next(e)}});
router.patch('/users/:id/premium',auth,adminOnly,async(req,res,next)=>{try{const subscription=req.body.subscription;if(!['free','premium'].includes(subscription))return res.status(400).json({message:'Subscription must be free or premium'});const user=await User.findByIdAndUpdate(req.params.id,{subscription},{new:true}).select('name email role subscription isSuspended');if(!user)return res.status(404).json({message:'User not found'});res.json({user:publicUser(user)})}catch(e){next(e)}});

router.delete('/users/:id', auth, adminOnly, async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own admin account.' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found.' });
    if (target.role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot be deleted from this panel.' });
    }
    await Playlist.deleteMany({ owner: target._id });
    await User.deleteOne({ _id: target._id });
    res.json({ ok: true, message: 'User deleted successfully.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id/suspension', auth, adminOnly, async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found.' });
    if (target.role === 'admin') return res.status(403).json({ message: 'Admin accounts cannot be suspended here.' });
    target.isSuspended = Boolean(req.body.isSuspended);
    await target.save();
    res.json({ user: { ...publicUser(target), isSuspended: target.isSuspended } });
  } catch (error) {
    next(error);
  }
});

router.post('/premium',auth,async(req,res,next)=>{try{if(req.user.subscription!=='premium'){req.user.subscription='premium';await req.user.save()}res.json({message:'Free Premium activated for lifetime',user:publicUser(req.user)})}catch(e){next(e)}});
router.get('/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
export default router;
