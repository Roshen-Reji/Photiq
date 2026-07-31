const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev-only-2026';

const requireAuth = (req, res, next) => {
  const agentToken = req.headers['x-agent-token'];
  if (agentToken && agentToken === (process.env.GRADSYNC_AGENT_TOKEN || 'set-the-same-value-as-GRADSYNC_AGENT_TOKEN')) {
    req.user = { role: 'agent' };
    return next();
  }

  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { role: 'admin' }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
};

module.exports = requireAuth;
