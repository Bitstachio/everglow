import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
}));
