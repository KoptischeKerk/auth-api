import bcrypt from 'bcrypt';
import { sign, verify } from 'hono/jwt'
import { Context, type Next } from 'hono'
import { every } from 'hono/combine';
import { type AuthUser } from '@/src/types/prisma';

/* Constant values */
export const apiPort: number = +(process.env.API_PORT ?? 8080);
export const databasePort: number = +(process.env.DB_PORT ?? 5432);
export const { DATABASE_URL } = process.env;
export const JWT_SECRET = String(process.env.JWT_SECRET);
export const JWT_REFRESH_SECRET = String(process.env.JWT_REFRESH_SECRET);

/* bCrypt helpers */
export const SALT_ROUNDS = 12;
export const hashPassword = async (password: string) => { return await bcrypt.hash(password, SALT_ROUNDS); };
export const comparePassword = async (password: string, hash: string) => { return await bcrypt.compare(password, hash); };

/* JWT helpers */
export const generateToken = async (user: any) => {
  const payload = {
    sub: user.id,
    username: user.username,
    disabled: user.disabled,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // Set 1 Hour Expiry on token
    tokenVersion: user.tokenVersion,
  }

  return await sign(payload, JWT_SECRET, 'HS256');
}

export const generateRefreshToken = async (user: AuthUser) => {
  const payload = {
    sub: user.id,
    username: user.username,
    disabled: user.disabled,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // Set 7 Days Expiry
    refreshTokenVersion: user.refreshTokenVersion,
  }

  return await sign(payload, JWT_REFRESH_SECRET, 'HS256');
}

export const verifySession = () => {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: "Unauthorized: Missing or invalid token format" }, 401);
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = await verify(token, JWT_SECRET, 'HS256');
      c.set('user', decoded);

      if (decoded.disabled) {
        return c.json({ success: false, message: "Invalid credentials." }, 401);
      }

      await next();
    } catch (error) {
      return c.json({ error: "Unauthorized: Token is invalid or expired" }, 401);
    }
  };
};

export const checkRole = (allowedRole: string) => {

  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Token not provided' }, 401);
    };

    const token: string = authHeader.split(' ')[1];

    try {
      const payload = await verify(token, JWT_SECRET, 'HS256');

      if (payload.role !== allowedRole) {
        return c.json({ success: false, error: `Access denied` }, 403);
      }

      await next();
    } catch (error) {
      return c.json({ success: false, error: 'Session has expired' }, 401);
    }

    await next()
  }
}
/* Input validators */
export const validateInput = (required: string[]) => {
  return async (c: Context, next: Next) => {
    const body = await c.req.json().catch(() => ({}));

    for (const key of required) {
      if (!body[key] || String(body[key]).trim() === "") {
        return c.json({ success: false, error: `${key} is required` }, 400);
      }
    }

    // Sla de body op in de context zodat de controller erbij kan
    c.set('parsedBody', body);
    await next();
  };
};

/* Middleware functions, call as an optional function with ...<var> e.g. ...adminRole */
export const verifyJWT = () => every(verifySession());
export const verifyInput = (keys: string[]) => every(validateInput(keys));
export const verifyUser = (keys: string[]) => every(validateInput(keys), verifySession(), checkRole('user'));
export const verifyAdmin = (keys: string[]) => every(validateInput(keys), verifySession(), checkRole('admin'));
