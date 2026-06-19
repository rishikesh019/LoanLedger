import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkId = clerkId;
  next();
};

export const requireUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));

  if (!user) {
    const clerkUser = auth as any;
    [user] = await db.insert(usersTable).values({
      clerkId,
      email: clerkUser?.sessionClaims?.email ?? `${clerkId}@unknown.com`,
      name: clerkUser?.sessionClaims?.name ?? "Unknown User",
      role: "user",
      isActive: true,
    }).returning();
  }

  (req as any).appUser = user;
  (req as any).clerkId = clerkId;
  next();
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden: Admin access required" });
    return;
  }

  (req as any).appUser = user;
  (req as any).clerkId = clerkId;
  next();
};
