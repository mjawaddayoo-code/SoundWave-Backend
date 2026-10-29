import mongoose from 'mongoose';
const userSchema=new mongoose.Schema({name:{type:String,required:true,trim:true,maxlength:80},email:{type:String,required:true,unique:true,lowercase:true,trim:true},passwordHash:{type:String,required:true,select:false},role:{type:String,enum:['user','admin'],default:'user'},subscription:{type:String,enum:['free','premium'],default:'free'},isSuspended:{type:Boolean,default:false}}, {timestamps:true});
export default mongoose.model('User',userSchema);
