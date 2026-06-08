import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserResponseDto } from "./dto/user-response.dto";
import { User } from "generated/prisma/client";

const DB_UNAVAILABLE = "Database unavailable — Prisma migration in progress";

@Injectable()
export class UsersService {
  createWithManager(manager: unknown, data: CreateUserDto): Promise<UserResponseDto> {
    void manager;
    void data;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  findOne(id: string): Promise<UserResponseDto> {
    void id;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    void id;
    void updateUserDto;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  remove(id: string): Promise<void> {
    void id;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  resolveByProviderSub(sub: string): Promise<User | null> {
    void sub;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }
}
