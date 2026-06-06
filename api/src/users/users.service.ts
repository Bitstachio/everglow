import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import type { User } from "../../generated/prisma/client.js";

const DB_UNAVAILABLE = "Database unavailable — Prisma migration in progress";

@Injectable()
export class UsersService {
  createWithManager(manager: unknown, data: CreateUserDto): Promise<User> {
    void manager;
    void data;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  findOne(id: string): Promise<User> {
    void id;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    void id;
    void updateUserDto;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }

  remove(id: string): Promise<void> {
    void id;
    return Promise.reject(new ServiceUnavailableException(DB_UNAVAILABLE));
  }
}
