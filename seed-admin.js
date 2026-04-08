import { getAdminCredentials, syncAdminCredentials } from './services/admin-bootstrap.js';

const { username, password } = getAdminCredentials();
const result = syncAdminCredentials();

console.log(`Admin "${username}" ${result.created ? 'criado' : 'atualizado'}.`);
console.log(`Username: ${username}`);
console.log(`Password: ${password}`);
