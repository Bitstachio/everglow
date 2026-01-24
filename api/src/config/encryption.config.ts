import { registerAs } from '@nestjs/config';

export default registerAs('encryption', () => ({
  masterKey: process.env.ENCRYPTION_MASTER_KEY,
  algorithm: 'aes-256-gcm', // i don't know what i took applied crypto with ruba when i don't need to know what's going on behind aes, lol
  keyLength: 32,
  ivLength: 16,
  saltLength: 64,
  tagLength: 16,
}));
