const https = require('https');
const http  = require('http');

const PORT = process.env.PORT || 3000;
const CAIXA = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON inválido')); }
      });
    }).on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS — libera qualquer origem
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', app: 'LotoLab Proxy' }));
    return;
  }

  // /lotofacil/ultimo  ou  /lotofacil/3500
  const match = req.url.match(/^\/lotofacil\/(.+)$/);
  if (!match) { res.writeHead(404); res.end(JSON.stringify({ error: 'Rota não encontrada' })); return; }

  const concurso = match[1]; // "ultimo" ou número
  try {
    const data = await fetchJSON(`${CAIXA}/${concurso}`);
    res.writeHead(200);
    res.end(JSON.stringify(data));
  } catch(err) {
    res.writeHead(502);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => console.log(`LotoLab Proxy rodando na porta ${PORT}`));
