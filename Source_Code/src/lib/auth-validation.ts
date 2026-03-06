interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(name: string): ValidationResult {
  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: "Name must be at least 2 characters long." };
  }

  if (trimmed.length > 80) {
    return { valid: false, error: "Name must be 80 characters or fewer." };
  }

  return { valid: true };
}

export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address." };
  }

  return { valid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      valid: false,
      error: "Password must include uppercase, lowercase, and a number.",
    };
  }

  return { valid: true };
}
