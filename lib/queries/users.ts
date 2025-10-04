import { db, schema, eq } from '@/lib/db';
import type { User, NewUser, UserWithOrganization } from '@/lib/types';
import { redirect } from 'next/navigation';

export async function getUserById(id: string): Promise<User | undefined> {
  return await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  return await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
}

export async function getUserWithOrganization(
  userId: string
): Promise<UserWithOrganization | undefined> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    with: {
      organization: true,
    },
  });

  return user as UserWithOrganization | undefined;
}

export async function getUserByEmailWithOrganization(
  email: string
): Promise<UserWithOrganization | undefined> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
    with: {
      organization: true,
    },
  });

  return user as UserWithOrganization | undefined;
}

export async function createUser(data: NewUser): Promise<User> {
  const [user] = await db.insert(schema.users).values(data).returning();
  return user;
}

export async function updateUser(
  id: string,
  data: Partial<NewUser>
): Promise<User | undefined> {
  const [updated] = await db
    .update(schema.users)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(schema.users.id, id))
    .returning();
  return updated;
}

export async function listUsersByOrganization(organizationId: string): Promise<User[]> {
  return await db.query.users.findMany({
    where: eq(schema.users.organization_id, organizationId),
  });
}

export async function deleteUser(id: string): Promise<void> {
  const user = await getUserById(id);

  if (!user) {
    throw new Error(`User ${id} not found`);
  }

  const organizationId = user.organization_id;

  await db.delete(schema.users).where(eq(schema.users.id, id));

  const remainingUsers = await db.query.users.findMany({
    where: eq(schema.users.organization_id, organizationId),
  });

  if (remainingUsers.length === 0) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
  }
}

export async function getUserByWorkOSId(workosUserId: string): Promise<User | undefined> {
  return await db.query.users.findFirst({
    where: eq(schema.users.workos_user_id, workosUserId),
  });
}
