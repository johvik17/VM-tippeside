import jwt from "jsonwebtoken";
import { db } from "./db.js";

const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: "7d" }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Du må vere logga inn." });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = db
      .prepare("SELECT id, username, role, created_at FROM users WHERE id = ?")
      .get(payload.sub);

    if (!user) {
      return res.status(401).json({ message: "Ugyldig brukar." });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Ugyldig eller utløpt innlogging." });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ message: "Berre admin har tilgang." });
  }
  next();
}
