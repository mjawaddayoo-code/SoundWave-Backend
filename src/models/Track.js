
import mongoose from 'mongoose';

const trackSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    artist: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    album: {
      type: String,
      default: 'Single',
      trim: true,
      maxlength: 160,
    },
    genre: {
      type: String,
      default: 'Other',
      trim: true,
      maxlength: 60,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    cover: {
      type: String,
      default: '',
    },
    audioUrl: {
      type: String,
      required: true,
      trim: true,
    },
    plays: {
      type: Number,
      default: 0,
      min: 0,
    },
    published: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

trackSchema.index({
  title: 'text',
  artist: 'text',
  album: 'text',
  genre: 'text',
});

export default mongoose.model('Track', trackSchema);
