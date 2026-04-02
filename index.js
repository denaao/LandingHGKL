import express from 'express';
import cors from 'cors';
import ranking from './ranking-data.js';
import publicRoutes from './routes/public.js';

const app = express();
const PORT = process.env.PORT || 3010;

app.use(cors());

app.use(publicRoutes);

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
