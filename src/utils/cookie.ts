import * as fs from 'fs';
import * as path from 'path';

// This puts the file in your main project folder
const COOKIE_PATH = path.join(process.cwd(), 'last_cookie.txt');

export function getStoredCookie(): string {
  if (fs.existsSync(COOKIE_PATH)) {
    return fs.readFileSync(COOKIE_PATH, 'utf-8').trim();
  }
  // Fallback to .env if the file doesn't exist yet
  return (process.env.HUMBLE_COOKIE || "").replace(/^"|"$/g, "");
}

export function saveCookie(cookie: string): void {
  try {
    fs.writeFileSync(COOKIE_PATH, cookie, 'utf-8');
  } catch (err) {
    console.error("Failed to save cookie to disk:", err);
  }
}