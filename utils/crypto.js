const crypto = require('crypto');

const APP_SECRET = process.env.APP_SECRET || (() => {
  console.warn('[WARNUNG] APP_SECRET nicht gesetzt — verwende unsicheren Standard.');
  console.warn('[WARNUNG] Setze APP_SECRET als Umgebungsvariable vor dem Start!');
  return 'dev-default-change-me-schwarzmarkt-2024';
})();

/**
 * Generiert einen kryptografisch sicheren 8-stelligen Zahlen-Code.
 */
function generateCode() {
  const bytes = crypto.randomBytes(4);
  const num = (bytes.readUInt32BE(0) % 90000000) + 10000000;
  return num.toString();
}

/**
 * Erstellt einen HMAC-SHA256-Hash des Codes mit dem App-Secret.
 * Ermöglicht O(1)-Lookup ohne bcrypt-Iteration.
 */
function hashCode(code) {
  return crypto.createHmac('sha256', APP_SECRET).update(code).digest('hex');
}

module.exports = { generateCode, hashCode };
