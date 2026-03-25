import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient;
}

let prisma: PrismaClient;

try {
  prisma = globalThis.prisma || new PrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = prisma;
  }
} catch (e) {
  console.error("[DB] Failed to initialize PrismaClient:", (e as Error).message);
  // Create a fallback client — it will fail on queries but won't crash the import
  prisma = new Proxy({} as PrismaClient, {
    get(_target, prop) {
      if (prop === "then") return undefined; // prevent Promise-like behavior
      return new Proxy(() => {}, {
        get() {
          return () => {
            throw new Error("Database not available. Check DATABASE_URL.");
          };
        },
        apply() {
          throw new Error("Database not available. Check DATABASE_URL.");
        },
      });
    },
  });
}

export default prisma;
