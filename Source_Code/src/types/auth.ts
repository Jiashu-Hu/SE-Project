export interface AuthUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface AuthSession {
  readonly token: string;
  readonly userId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface RegisterPayload {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface LoginPayload {
  readonly email: string;
  readonly password: string;
}

export interface UpdateProfilePayload {
  readonly name: string;
  readonly email: string;
}

export interface ChangePasswordPayload {
  readonly currentPassword: string;
  readonly newPassword: string;
}
