import { registerAs } from "@nestjs/config";

// TypeORM database config disabled — Prisma migration in progress.
// export default registerAs("database", (): TypeOrmModuleOptions => {
//   if (process.env.OPENAPI_GENERATE === "1") {
//     return {
//       type: "sqljs",
//       autoSave: false,
//       location: "everglow-openapi",
//       entities: [__dirname + "/../**/*.entity{.ts,.js}"],
//       synchronize: true,
//       logging: false,
//     };
//   }
//
//   return {
//     type: "mysql",
//     host: process.env.DB_HOST || "localhost",
//     port: parseInt(process.env.DB_PORT || "3306", 10),
//     username: process.env.DB_USERNAME || "root",
//     password: process.env.DB_PASSWORD || "",
//     database: process.env.DB_NAME || "everglow_db",
//     entities: [__dirname + "/../**/*.entity{.ts,.js}"],
//     synchronize: process.env.NODE_ENV === "development",
//     logging: process.env.NODE_ENV === "development",
//     extra: {
//       connectionLimit: 10,
//     },
//   };
// });

export default registerAs("database", () => ({}));
