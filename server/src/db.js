import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from './config.js';

/**
 * Connects to the main database. `mongodb+srv://` addresses need a DNS SRV lookup,
 * which some local DNS setups (VPNs, 127.0.0.1 resolvers) refuse. For those we
 * resolve through public DNS. Set MONGO_DNS=system to use the machine's DNS instead.
 */
export async function connectDb() {
  if (config.mongoUri.startsWith('mongodb+srv://') && process.env.MONGO_DNS !== 'system') {
    dns.setServers(['1.1.1.1', '8.8.8.8']);
  }
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
}
