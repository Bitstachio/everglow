import { Injectable } from '@nestjs/common';

export class JwtPayloadDto {
  sub: string; // user id
  email: string;
  iat?: number;
  exp?: number;
}
