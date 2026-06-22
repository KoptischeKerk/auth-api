import { Hono } from "hono";
import { verify, sign } from 'hono/jwt'
import { prisma } from "@/src/lib/prisma";
import { 
  comparePassword,
  verifyInput,
  hashPassword,
  generateToken,
  generateRefreshToken,
  verifyJWT,
  JWT_REFRESH_SECRET,
  JWT_SECRET
} from '@/src/utils/core'
import { type AccessTokenPayload, type AuthUser} from '@/src/types'

const auth = new Hono();

  /* Production - Login */
auth.post('/login', verifyInput(['identifier', 'password']), async (c) => {
  const body = await c.req.json();
  const { identifier, password } = body;
  const now = new Date();

  // 1. Find user by username OR email
  const user: AuthUser | null = await prisma.user.findFirst({
    where: {
      OR: [
        { username: identifier },
        { email: identifier }
      ]
    }
  });

  if (!user) {
    return c.json({ success: false, message: "Invalid credentials." }, 401);
  }

  if (user.login_timeout_untill && user.login_timeout_untill > now) {
    const minutesLeft = Math.ceil((user.login_timeout_untill.getTime() - now.getTime()) / 60000);
    return c.json({ 
      success: false, 
      message: `Account is temporarily locked. Please try again in ${minutesLeft} minutes.` 
    }, 423);
  }

  const isPasswordCorrect = await comparePassword(password, (user.password ?? ""));
;

  if (isPasswordCorrect) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failed_login_tries: 0,
        login_timeout_untill: null,
      },
    });

    const token = await generateToken(user);
    const refreshToken = await generateRefreshToken(user);

    return c.json({ success: true, token, refreshToken });
  }

  const newFailedTries = (user.failed_login_tries ?? 0) + 1;

  if (newFailedTries >= 5) {
    const extraMinutes = (user.previous_blocks ?? 0) * 5; 
    const totalCooldownMinutes = 15 + extraMinutes;
    const timeoutDate = new Date(now.getTime() + totalCooldownMinutes * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failed_login_tries: newFailedTries,
        previous_blocks: { increment: 1 },
        last_blocked_at: now,
        login_timeout_untill: timeoutDate,
      },
    });

    return c.json({ 
      success: false, 
      message: `Too many failed attempts. Account locked for ${totalCooldownMinutes} minutes.` 
    }, 429);

  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failed_login_tries: { increment: 1 },
      },
    });

    return c.json({ 
      success: false, 
      message: `Incorrect password. You have ${5 - newFailedTries} attempts remaining.` 
    }, 401);
  }
});

auth.get('/me', verifyJWT(), async (c) => {
  // @ts-ignore
  const user: AccessTokenPayload = c.get('user');
  const refresh = (user.exp - Math.floor(Date.now() / 1000)) < (10 * 60);

  return c.json({valid: true, refresh}, 200)
});

auth.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { refreshToken } = body;

  if (!refreshToken) {
    return c.json({ error: "Refresh token is required" }, 400);
  }

  try {
    const decoded = await verify(refreshToken, JWT_REFRESH_SECRET, 'HS256');

    let user: AuthUser | null = await prisma.user.findUnique({
      where: { id: decoded.sub as string }
    });

    if (!user || user.refreshTokenVersion !== decoded.refreshTokenVersion) {
      return c.json({ error: "Unauthorized: Refresh session has been revoked" }, 401);
    }

    const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    const shouldRotate = currentTimeInSeconds > (decoded.exp as number) - ONE_DAY_IN_SECONDS;

    let responseTokens: { accessToken: string; refreshToken?: string } = {
      accessToken: ""
    };

    if (shouldRotate) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenVersion: { increment: 1 } }
      });

      const newRefreshToken = await sign({
        sub: user.id,
        refreshTokenVersion: user.refreshTokenVersion, 
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7)
      }, JWT_REFRESH_SECRET, 'HS256');

      responseTokens.refreshToken = newRefreshToken;
    }

    user = await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } }
    });

    const newAccessToken = await sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion,
      exp: Math.floor(Date.now() / 1000) + (60 * 60)
    }, JWT_SECRET, 'HS256');

    responseTokens.accessToken = newAccessToken;

    return c.json({
      success: true,
      rotated: shouldRotate,
      ...responseTokens
    }, 200);

  } catch (error) {
    return c.json({ error: "Unauthorized: Refresh token is invalid or expired" }, 401);
  }
});

auth.post('/register', verifyInput(['username', 'email', 'password', 'name']), async (c) => {
  try {
    const body = await c.req.json();
    const { username, email, password, name } = body;
    const lowerUsername = username.toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      return c.json({ success: false, message: "Username or email already taken." }, 400);
    }

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        username: lowerUsername,
        email,
        name: name || null,
        password: passwordHash,
        failed_login_tries: 0,
        previous_blocks: 0,
        login_timeout_untill: null,
        last_blocked_at: null,
      }
    });

    const token = await generateToken(newUser);
    const refreshToken = await generateRefreshToken(newUser);

    return c.json({ success: true, token, refreshToken }, 201);

  } catch (error) {
    console.error("Registration error:", error);
    return c.json({ success: false, message: "An error occurred during registration." }, 500);
  }
});


export default auth;