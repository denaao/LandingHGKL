import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import ranking from './ranking-data.js';
import { createFeed } from './services/stackplus-feed.js';
import { respostaRanking, respostaPremio } from './services/ranking-rotas.js';
import { premioDoRanking, TEMPORADA_HISTORICO } from './services/ranking-ao-vivo.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import { syncAdminCredentials } from './services/admin-bootstrap.js';

const app = express();
const PORT = process.env.PORT || 3010;
const adminSync = syncAdminCredentials();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'hgkl-admin-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const host = (req.headers.host || '').toLowerCase();
    const proto = (req.headers['x-forwarded-proto'] || '').toLowerCase();
    const isHttps = proto === 'https';
    const isApex = host === 'kingjogos.com.br';

    if (!isHttps || isApex) {
      const targetHost = isApex ? 'www.kingjogos.com.br' : host;
      return res.redirect(301, `https://${targetHost}${req.originalUrl}`);
    }

    return next();
  });
}

app.use((req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  if (host.startsWith('admin.') && req.path === '/') {
    return res.redirect('/login.html');
  }
  return next();
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);
app.use(publicRoutes);

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.use(express.static('public'));

// Ranking de Jogadores: com RANKING_FONTE=stackplus, histórico + StackPlus ao vivo.
// Sem a env, o histórico como sempre foi (caminho de volta).
let feedDoRanking = null;
function rankingAoVivo() {
  if (process.env.RANKING_FONTE !== 'stackplus') return null;
  if (!feedDoRanking) {
    feedDoRanking = createFeed({
      baseUrl: String(process.env.STACKPLUS_API_URL || '').replace(/\/$/, ''),
      apiKey: process.env.STACKPLUS_EQUIPES_KEY || '',
    });
  }
  return feedDoRanking;
}

app.get('/ranking', async (req, res) => {
  const feed = rankingAoVivo();
  res.json(feed ? await respostaRanking(feed, ranking) : ranking);
});

app.get('/api/public/premio-ranking', async (req, res) => {
  const feed = rankingAoVivo();
  res.json(feed ? await respostaPremio(feed) : premioDoRanking({ temporada: { eventId: TEMPORADA_HISTORICO } }));
});

app.get('/health', (req, res) => {
  res.send('Backend KING Live Landing - OK');
});

app.listen(PORT, () => {
  console.log(`Admin credentials ${adminSync.created ? 'created' : 'updated'} for user ${adminSync.username}`);
  console.log(`Backend KING Live Landing rodando em http://localhost:${PORT}`);
});
