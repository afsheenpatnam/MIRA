import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema(
  {
    // 'import' = the company's own imported history,
    // 'live' = asked through MIRA (from the Console or an alert webhook)
    source: { type: String, enum: ['import', 'live'], required: true },
    origin: String, // file name or alert tool the incident came from
    code: String,
    title: String,
    service: String,
    category: String,
    alert: String, // always stored masked
    rootCause: String,
    finalFix: String,
    failedFixes: [String],
    resolvedBy: String,
    minutesToResolve: Number,
    occurredAt: Date,

    // live incidents only
    askedBy: { name: String, email: String },
    brief: String,
    full: String,
    generic: String,
    used: [{ label: String, detail: String }],
    guide: { type: mongoose.Schema.Types.Mixed, default: null },
    match: { type: String, default: null }, // known | partial | new | followup
    followUpOf: { type: mongoose.Schema.Types.ObjectId, default: null }, // earlier answer this question refers to
    threadId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true }, // first question of the conversation
    outcome: { type: String, enum: ['worked', 'failed', null], default: null },
    note: String,
  },
  { timestamps: true }
);

/**
 * Incidents are stored in the company's own database (`mira_<company>`),
 * so one company's records are never in the same collection as another's.
 */
export function incidentsFor(workspace) {
  const db = mongoose.connection.useDb(workspace.dbName, { useCache: true });
  return db.models.Incident || db.model('Incident', incidentSchema);
}

// A log of everything that fed this company's memory: imported files and received alerts.
const sourceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['csv', 'document', 'text', 'alert'], required: true },
    name: String,
    incidents: { type: Number, default: 0 },
    masked: { type: Number, default: 0 },
    detail: String,
    by: String,
  },
  { timestamps: true }
);

export function sourcesFor(workspace) {
  const db = mongoose.connection.useDb(workspace.dbName, { useCache: true });
  return db.models.Source || db.model('Source', sourceSchema);
}
