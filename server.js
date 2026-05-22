const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;

// Busca direta na Caixa com headers que simulam browser
function fetchCaixa(concurso) {
  return new Promise((resolve, reject) => {
    const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil/${concurso}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://loterias.caixa.gov.br/',
        'Origin': 'https://loterias.caixa.gov.br',
        'Connection': 'keep-alive',
      },
      timeout: 10000
    };
    const req = https.get(url, options, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        fetchCaixa(concurso).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch(e) {
          reject(new Error(`Parse error: ${data.substring(0,100)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Fallback: loteriascaixa-api no Heroku
function fetchHeroku(concurso) {
  return new Promise((resolve, reject) => {
    const path = concurso === 'ultimo' ? '/api/lotofacil/latest' : `/api/lotofacil/${concurso}`;
    const options = {
      hostname: 'loteriascaixa-api.herokuapp.com',
      path,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 10000
    };
    const req = https.get(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Normaliza resposta para formato padrão { numero, dezenas[] }
function normalizar(data) {
  if (!data) return null;
  const dezenas = (data.dezenas || data.listaDezenas || [])
    .map(n => String(n).padStart(2, '0'));
  const numero = data.numero || data.concurso || data.contest;
  if (!dezenas.length || !numero) return null;
  return { numero, dezenas };
}

async function buscarConcurso(concurso) {
  // Tenta Caixa direto
  try {
    const d = await fetchCaixa(concurso === 'ultimo' ? '' : concurso);
    const norm = normalizar(d);
    if (norm) return norm;
  } catch(e) {}

  // Fallback Heroku
  try {
    const d = await fetchHeroku(concurso);
    const norm = normalizar(d);
    if (norm) return norm;
  } catch(e) {}

  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', app: 'LotoLab Proxy v3' }));
    return;
  }

  const match = req.url.match(/^\/lotofacil\/(.+)$/);
  if (!match) { res.writeHead(404); res.end(JSON.stringify({ error: 'Rota inválida' })); return; }

  try {
    const data = await buscarConcurso(match[1]);
    if (!data) throw new Error('Sem dados');
    res.writeHead(200);
    res.end(JSON.stringify(data));
  } catch(e) {
    res.writeHead(502);
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => console.log(`LotoLab Proxy v3 na porta ${PORT}`));
