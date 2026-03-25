import "dotenv/config";
import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient;
}

let prisma: PrismaClient;

try {
  // Pass datasourceUrl directly to bypass schema env() validation
  const url = process.env.DATABASE_URL;
  prisma = globalThis.prisma || new PrismaClient(url ? {
    datasourceUrl: url,
  } : undefined);
  if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = prisma;
  }
} catch (e) {
  console.error("[DB] Failed to initialize PrismaClient:", (e as Error).message);
  prisma = new Proxy({} as PrismaClient, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return new Proxy(() => {}, {
        get() {
          return () => { throw new Error("Database not available. Check DATABASE_URL."); };
        },
        apply() {
          throw new Error("Database not available. Check DATABASE_URL.");
        },
      });
    },
  });
}

export default prisma;
