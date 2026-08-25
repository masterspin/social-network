import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import {
  accounts,
  sessions,
  socialVerifications,
  users,
  verificationTokens,
} from "@/lib/db/schema";

const providers: Provider[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID ?? "",
    clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
  }),
];

if (process.env.AUTH_LINKEDIN_ID && process.env.AUTH_LINKEDIN_SECRET) {
  providers.push(
    LinkedIn({
      clientId: process.env.AUTH_LINKEDIN_ID,
      clientSecret: process.env.AUTH_LINKEDIN_SECRET,
      authorization: { params: { scope: "openid profile email" } },
    }),
  );
}

if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) {
  providers.push(
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      authorization: { params: { scope: "identify email" } },
    }),
  );
}

function getProfileUrl(provider: string, providerAccountId: string) {
  if (provider === "discord") return `https://discord.com/users/${providerAccountId}`;
  return null;
}

async function saveSocialVerification({
  userId,
  provider,
  providerAccountId,
  profile,
}: {
  userId: string | undefined;
  provider: string;
  providerAccountId: string | undefined;
  profile: unknown;
}) {
  if (!userId || !providerAccountId) return;
  if (provider !== "linkedin" && provider !== "discord") return;

  const profileData = (profile ?? {}) as Record<string, unknown>;
  const displayName =
    (profileData.name as string | undefined) ??
    (profileData.global_name as string | undefined) ??
    (profileData.username as string | undefined) ??
    null;
  const avatarUrl =
    (profileData.picture as string | undefined) ??
    (profileData.image as string | undefined) ??
    (profileData.image_url as string | undefined) ??
    (profileData.avatar as string | undefined) ??
    null;
  const email = (profileData.email as string | undefined) ?? null;
  const profileUrl = getProfileUrl(provider, providerAccountId);

  await db
    .insert(socialVerifications)
    .values({
      userId,
      provider,
      providerAccountId,
      displayName,
      avatarUrl,
      profileUrl,
      email,
    })
    .onConflictDoUpdate({
      target: [socialVerifications.userId, socialVerifications.provider],
      set: {
        providerAccountId,
        displayName,
        avatarUrl,
        profileUrl,
        email,
        verifiedAt: new Date(),
      },
    });
}

async function trySaveSocialVerification(
  input: Parameters<typeof saveSocialVerification>[0],
) {
  try {
    await saveSocialVerification(input);
  } catch (error) {
    console.error("[auth] Failed to save social verification", error);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  pages: {
    error: "/auth/error",
  },
  session: { strategy: "database" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account) {
        await trySaveSocialVerification({
          userId: user.id,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          profile,
        });
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async linkAccount({ user, account, profile }) {
      await trySaveSocialVerification({
        userId: user.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        profile,
      });
    },
  },
});
