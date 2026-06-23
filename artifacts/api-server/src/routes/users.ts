import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getAuth, clerkClient } from "@clerk/express";
import {
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
  ListUsersResponseItem,
  CreateUserBody,
  GetUserParams,
  GetUserResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/users/me", requireUser, async (req, res): Promise<void> => {
  const user = (req as any).appUser;
  res.json(GetMeResponse.parse(user));
});

router.patch("/users/me", requireAdmin, async (req, res): Promise<void> => {
  const user = (req as any).appUser;
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(usersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json(UpdateMeResponse.parse(updated));
});

router.get("/users", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(u => ListUsersResponseItem.parse(u)));
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // First create the local DB record with a placeholder clerkId
  const [user] = await db.insert(usersTable).values({
    clerkId: `manual_${Date.now()}`,
    email: parsed.data.email,
    name: parsed.data.name,
    phone: parsed.data.phone,
    role: parsed.data.role,
    isActive: true,
  }).returning();

  // Also create the user in Clerk so they can log in.
  // They will use "Forgot password?" on the sign-in page to set their own password.
  try {
    const nameParts = parsed.data.name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || undefined;

    const clerkUser = await clerkClient.users.createUser({
      emailAddress: [parsed.data.email],
      firstName,
      lastName,
      skipPasswordRequirement: true,
    } as any);

    // Link local record to the real Clerk ID immediately
    await db.update(usersTable)
      .set({ clerkId: clerkUser.id, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    user.clerkId = clerkUser.id;
  } catch (err: any) {
    req.log?.warn({ email: parsed.data.email, err: String(err?.message ?? err) }, "Clerk user creation failed — local record created with placeholder clerkId");
  }

  res.status(201).json(GetUserResponse.parse(user));
});

router.get("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetUserResponse.parse(user));
});

router.patch("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(usersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(UpdateUserResponse.parse(updated));
});

router.post("/users/jit", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { email, name } = req.body;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (existing) {
    res.json(GetMeResponse.parse(existing));
    return;
  }
  const [user] = await db.insert(usersTable).values({
    clerkId,
    email: email || `${clerkId}@unknown.com`,
    name: name || "New User",
    role: "user",
    isActive: true,
  }).returning();
  res.status(201).json(GetMeResponse.parse(user));
});

export default router;
