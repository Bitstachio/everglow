import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./entities/user.entity";
import { USER_SERVICE_ERRORS } from "./users.constants";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createWithManager(manager: EntityManager, data: CreateUserDto): Promise<User> {
    const duplicate = await manager.findOne(User, {
      where: { email: data.email },
    });
    if (duplicate) throw new ConflictException(USER_SERVICE_ERRORS.EMAIL_TAKEN(data.email));

    const user = manager.create(User, data);
    return await manager.save(User, user);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(id));
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const updatedUser = this.userRepository.merge(user, updateUserDto);
    return this.userRepository.save(updatedUser);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }
}
