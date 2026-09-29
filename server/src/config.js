import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy server/.env.example to server/.env and fill it in.`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: required('MONGODB_URI'),
  jwtSecret: required('JWT_SECRET'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  hindsightUrl: required('HINDSIGHT_URL'),
  hindsightApiKey: process.env.HINDSIGHT_API_KEY || undefined,
  // Prefix keeps our banks apart from anything else in the same Hindsight account.
  bankPrefix: process.env.BANK_PREFIX || 'mira-',

  groqApiKey: required('GROQ_API_KEY'),
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',

  // Seals every audit block. Falls back to a key derived from JWT_SECRET if unset.
  auditSecret: process.env.AUDIT_SECRET || '',
};
