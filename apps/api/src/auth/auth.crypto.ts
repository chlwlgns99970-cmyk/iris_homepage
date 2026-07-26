import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const USER_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateUserCode() {
  const bytes = randomBytes(8);
  const code = Array.from(bytes, (byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]).join('');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function generateSecret() {
  return randomBytes(32).toString('base64url');
}

export function hmac(value: string, secret: string) {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

export function safeHashEqual(actual: string, expected: string) {
  const left = Buffer.from(actual, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function safeSecretEqual(actual: string, expected: string) {
  const left = Buffer.from(actual, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
