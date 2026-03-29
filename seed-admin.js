import bcrypt from 'bcryptjs';
import db from './db/database.js';

const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'hgkl2026';

const existing = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
if (existing) {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE admin SET password_hash = ? WHERE username = ?').run(hash, username);
  console.log(`Admin "${username}" atualizado.`);
} else {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`Admin "${username}" criado.`);
}

console.log(`Username: ${username}`);
console.log(`Password: ${password}`);
