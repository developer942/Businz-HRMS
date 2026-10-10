import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derives a consistent 32-byte encryption key from the application secret
 */
function getMasterKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || env.JWT_SECRET || 'vrm-hrms-fallback-secret-key-32b!';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts sensitive string using AES-256-GCM
 * Returns string formatted as: ivHex:tagHex:cipherHex
 */
export function encryptCredential(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted string
 */
export function decryptCredential(encryptedText: string): string {
  if (!encryptedText) return '';
  // Check if string is in iv:tag:cipher format
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    // Unencrypted legacy fallback
    return encryptedText;
  }

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const cipherText = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.error('[CRYPTO ERROR] Failed to decrypt credential:', err.message);
    return '';
  }
}
