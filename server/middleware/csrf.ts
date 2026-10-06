import { doubleCsrf } from "csrf-csrf";
import { Request, Response, NextFunction } from "express";

const getCsrfSecret = () => {
  const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("CSRF_SECRET or JWT_SECRET environment variable is required");
  }
  return secret;
};

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => getCsrfSecret(),

  getSessionIdentifier: () => "anonymous",

  cookieName: "__csrf",

  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },

  getCsrfTokenFromRequest: (req: Request) =>
    req.headers["x-csrf-token"] as string,
});

// Endpoint to get CSRF token
export const getCsrfToken = (req: Request, res: Response) => {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
};

// Middleware — skip for GET/HEAD/OPTIONS
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  doubleCsrfProtection(req, res, next);
};
