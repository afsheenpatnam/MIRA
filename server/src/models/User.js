import mongoose from 'mongoose';

// Users live in the main database. Each user belongs to exactly one company,
// and every request is answered from that company's database and memory bank.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'On-call engineer' },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
