import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET || 'fallback-secret-for-development-32-chars-min',
  session: { strategy: 'jwt', maxAge: 60 * 60 }, // 1 hour session
  pages: {
    signIn: '/auth/signin',
    newUser: '/onboarding/wizard',
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        const password = credentials.password as string;

        const user = await db.user.findUnique({
          where: { email },
          include: {
            memberships: { include: { organization: true } },
            preferences: true,
          },
        });

        if (!user || !user.passwordHash) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        const primaryMembership = user.memberships[0];

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          activeOrgId: user.preferences?.activeOrgId || primaryMembership?.organizationId || null,
          role: primaryMembership?.role || 'MEMBER',
          isSuperAdmin: user.isSuperAdmin ?? false,
          onboardingComplete: user.preferences?.onboardingComplete ?? false,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || 'mock-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock-secret',
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.activeOrgId = (user as any).activeOrgId;
        token.role = (user as any).role;
        token.isSuperAdmin = (user as any).isSuperAdmin;
        token.onboardingComplete = (user as any).onboardingComplete;
      }

      if (trigger === 'update' && session) {
        if (session.activeOrgId) token.activeOrgId = session.activeOrgId;
        if (session.onboardingComplete !== undefined) token.onboardingComplete = session.onboardingComplete;
        if (session.isSuperAdmin !== undefined) token.isSuperAdmin = session.isSuperAdmin;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).activeOrgId = token.activeOrgId as string | null;
        (session.user as any).role = token.role as string;
        (session.user as any).isSuperAdmin = token.isSuperAdmin as boolean ?? false;
        (session.user as any).onboardingComplete = token.onboardingComplete as boolean;
      }
      return session;
    },
  },
});
