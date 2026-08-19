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
import { type AccessTokenPayload, type AuthUser } from '@/src/types'
import { type Context } from "hono";

const auth = new Hono();

/* Production - Login */
auth.post('/login', verifyInput(['identifier', 'password']), async (c: Context) => {
  const body = await c.req.json();
  const { identifier, password } = body;
  const now = new Date();

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: identifier },
        { email: identifier }
      ]
    }
  }) as AuthUser;

  if (!user) {
    return c.json({ success: false, message: "Invalid credentials." }, 401);
  }

  if (user.disabled) {
    return c.json({ success: false, message: "Invalid credentials." }, 403);
  }

  if (user.login_timeout_untill && user.login_timeout_untill > now) {
    return c.json({
      success: false,
      message: "Invalid credentials.",
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
      message: "Invalid credentials.",
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
      message: "Invalid credentials.",
    }, 401);
  }
});

auth.get('/me', verifyJWT(), async (c: Context) => {
  // @ts-ignore
  const user: AccessTokenPayload = c.get('user');
  const refresh = (user.exp - Math.floor(Date.now() / 1000)) < (10 * 60);

  return c.json({ valid: true, role: user.role, name: user.name, refresh }, 200)
});

auth.post('/refresh', async (c: Context) => {
  const body = await c.req.json().catch(() => ({}));
  const { refreshToken } = body;

  if (!refreshToken) {
    return c.json({ success: false, error: "Refresh token is required" }, 400);
  }

  try {
    const decoded = await verify(refreshToken, JWT_REFRESH_SECRET, 'HS256');

    let user: AuthUser = await prisma.user.findUnique({
      where: { id: decoded.sub as string }
    }) as AuthUser;

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
      }) as AuthUser;

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
    }) as AuthUser;

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
    return c.json({ success: false, error: "Unauthorized: Refresh token is invalid or expired" }, 401);
  }
});

auth.post('/register', verifyInput(['username', 'email', 'password', 'name']), async (c: Context) => {
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
    }) as AuthUser;

    const token = await generateToken(newUser);
    const refreshToken = await generateRefreshToken(newUser);

    return c.json({ success: true, token, refreshToken }, 201);

  } catch (error) {
    return c.json({ success: false, message: "An error occurred during registration." }, 500);
  }
});

auth.post('/picture', verifyJWT(), async (c: Context) => {
  const user = c.get('user') as AccessTokenPayload;
  const body = await c.req.parseBody();
  const file = body['image'];

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: 'No valid file uploaded' }, 400);
  }

  const MAX_SIZE = 4 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    return c.json({ success: false, error: `File is too large. Maximum 4MB allowed. (${sizeInMB}MB)` }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await prisma.user.update({
      where: { id: user.sub },
      data: { picture: buffer },
    });

    return c.json({ success: true, message: 'Profile picture updated successfully' }, 200);
  } catch (error) {
    return c.json({ success: false, error: 'Failed to save profile picture' }, 500);
  }
});

auth.get('/picture', verifyJWT(), async (c: Context) => {
  const user = c.get('user') as AccessTokenPayload;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { picture: true },
    }) as AuthUser;

    if (!dbUser || !dbUser.picture) {
      return c.json({ success: false, error: 'Profile picture not found' }, 404);
    }

    const imageArray = new Uint8Array(dbUser.picture);

    return c.body(imageArray, 200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to retrieve profile picture' }, 500);
  }
});

export default auth;
