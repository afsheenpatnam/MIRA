import mongoose from 'mongoose';

// MIRA platform admins (the people who run MIRA), stored in the main database.
// They are not members of any company and cannot open a company workspace.
const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

export const Admin = mongoose.model('Admin', adminSchema);
