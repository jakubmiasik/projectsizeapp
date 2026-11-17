const path = require('node:path');
const express = require('express');
const root = path.resolve(__dirname, '..', '..');
let stored = {rates: {}, projectTypes: {}, sizing: null};
let count = 2;
const db = {
  initialize: async () => {},
  countAppUsers: async () => count,
  getUserRole: async email => count && ['admin@test.local', 'explorer@test.local'].includes(email)
    ? {role: email.split('@')[0]} : (email === 'invalid@test.local' ? {role: 'viewer'} : null),
  getRateDefaults: async () => structuredClone(stored),
  listAppUsers: async () => [],
  listAllEstimations: async () => [],
  saveRateDefaults: async (rates, meta, projectTypes, sizing) => {
    stored = {rates, projectTypes: projectTypes || stored.projectTypes,
      sizing: sizing === undefined ? stored.sizing : sizing, updatedBy: meta.userName};
    return structuredClone(stored);
  }
};
require.cache[path.join(root, 'db.js')] = {exports: db};
const listen = express.application.listen;
express.application.listen = function (...args) {
  const server = listen.apply(this, args);
  server.once('listening', () => process.send({port: server.address().port}));
  return server;
};
process.on('message', message => {
  if (message.count !== undefined) { count = message.count; process.send({count}); }
});
process.env.PORT = '0';
require(path.join(root, 'server.js'));
