export interface AuthUser {
  id?: string;
  email?: string;
  username?: string;
  name?: string;
  disabled?: boolean;
  role?: string;
  picture?: Buffer | null;
  password?: string;
  tokenVersion?: number;
  refreshTokenVersion?: number;
  failed_login_tries?: number;
  login_timeout_untill?: Date | null;
  previous_blocks?: number;
  last_blocked_at?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}