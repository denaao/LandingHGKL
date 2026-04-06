import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import ranking from './ranking-data.js';
import publicRoutes from './routes/public.js';

const app = express();
const PORT = process.env.PORT || 3010;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use(publicRoutes);

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.use(express.static('public'));

app.get('/ranking', (req, res) => {
  res.json(ranking);
});

app.get('/health', (req, res) => {
  res.send('Backend KING Live Landing - OK');
});

app.listen(PORT, () => {
  console.log(`Backend KING Live Landing rodando em http://localhost:${PORT}`);
});
