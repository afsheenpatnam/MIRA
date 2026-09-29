import mongoose from 'mongoose';

// One document per company. Created when the first person from the company signs up.
const workspaceSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    sector: { type: String, required: true, enum: ['fintech', 'ecommerce', 'edtech'] },
    // Each company has its own MongoDB database and its own Hindsight memory bank.
    // Both names come from here, never from the browser.
    dbName: { type: String, required: true, unique: true },
    bankId: { type: String, required: true, unique: true },
    // Key for the alert webhook. Only a SHA-256 hash is stored; the key is shown once when created.
    ingestKeyHash: { type: String, index: true, sparse: true },
    ingestKeyHint: String,
  },
  { timestamps: true }
);

export const Workspace = mongoose.model('Workspace', workspaceSchema);
