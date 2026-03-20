import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ profile }) {
      const allowedDomain = process.env.ALLOWED_DOMAIN;
      if (allowedDomain && (profile as { hd?: string })?.hd !== allowedDomain) {
        return false;
      }
      return true;
    },
    async jwt({ token, user, profile }) {
      if (user && profile) {
        const dbUser = await prisma.user.upsert({
          where: { email: profile.email! },
          update: {
            name: profile.name || user.name || '',
            avatarUrl: (profile as { picture?: string }).picture || user.image,
          },
          create: {
            email: profile.email!,
            name: profile.name || user.name || '',
            avatarUrl: (profile as { picture?: string }).picture || user.image,
          },
        });
        token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
};
