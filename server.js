const https = require('https');
const http  = require('http');

const PORT = process.env.PORT || 3000;

const APIS = [
  num => `https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil/${num}`,
  num => `https://api.guidi.dev.br/loteria/lotofacil/${num}`,
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Origin': 'https://lotolab-proxy.onrender.com'
      },
      timeout: 8000
    }, res => {
      // Seguir redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJSON(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON inválido')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchConcurso(num) {
  for (const apiBuilder of APIS) {
    try {
      const data = await fetchJSON(apiBuilder(num));
      if (data && (data.dezenas || data.listaDezenas)) return data;
    } catch(e) { continue; }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', app: 'LotoLab Proxy v2' }));
    return;
  }

  const match = req.url.match(/^\/lotofacil\/(.+)$/);
  if (!match) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Rota não encontrada' }));
    return;
  }

  const concurso = match[1];
  try {
    const data = await fetchConcurso(concurso);
    if (!data) throw new Error('Sem dados disponíveis');
    res.writeHead(200);
    res.end(JSON.stringify(data));
  } catch(err) {
    res.writeHead(502);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => console.log(`LotoLab Proxy v2 rodando na porta ${PORT}`));
