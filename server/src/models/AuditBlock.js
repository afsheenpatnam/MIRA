import mongoose from 'mongoose';

// One block of the audit ledger, stored in the main database.
// Each block carries the SHA-256 fingerprint of the block before it (prevHash) and its own
// fingerprint (hash), signed with MIRA's audit key (seal). See services/audit.js.
const auditBlockSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true, unique: true },
    at: { type: Date, required: true },
    category: { type: String, enum: ['access', 'data', 'admin', 'system'], required: true },
    action: { type: String, required: true },
    outcome: { type: String, enum: ['ok', 'failed', 'denied'], default: 'ok' },
    actor: { kind: String, name: String, email: String },
    company: { id: String, name: String },
    target: String,
    detail: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: String,
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
    seal: { type: String, required: true },
  },
  { versionKey: false, minimize: false }
);
auditBlockSchema.index({ category: 1, index: -1 });

// The app can only append. Edits made directly in the database are caught by verification.
const appendOnly = function () {
  throw Object.assign(new Error('The audit ledger is append-only.'), { status: 403 });
};
auditBlockSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], appendOnly);

export const AuditBlock = mongoose.model('AuditBlock', auditBlockSchema);
