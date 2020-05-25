/**
 * Copyright (C) 2020 Mailvelope GmbH
 * Licensed under the GNU Affero General Public License version 3
 */

'use strict';

const Hapi = require('@hapi/hapi');
const Vision = require('@hapi/vision');
const Inert = require('@hapi/inert');
const ejs = require('ejs');
const config = require('../config/config');
const path = require('path');
const i18n = require('hapi-i18n');
const log = require('./lib/log');

const Mongo = require('./modules/mongo');
const Email = require('./modules/email');
const PGP = require('./modules/pgp');
const PublicKey = require('./modules/public-key');

const HKP = require('./route/hkp');
const REST = require('./route/rest');
const WWW = require('./route/www');
const CSP = require('./lib/csp');

const init = async () => {
  const server = Hapi.server({
    port: config.server.port,
    host: config.server.host,
  });
  // modules
  const mongo = new Mongo();
  const email = new Email();
  const pgp = new PGP();
  server.app.publicKey = new PublicKey(pgp, mongo, email);
  email.init(config.email);
  await mongo.init(config.mongo);
  // views
  await server.register(Vision);
  server.views({
    engines: {
      html: ejs
    },
    path: path.join(__dirname, 'view'),
    layout: true
  });
  // static
  await server.register(Inert);
  server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: path.join(__dirname, 'static')
      }
    }
  });
  // content security policy
  if (config.server.csp) {
    await server.register({plugin: CSP.plugin});
  }
  // routes
  await server.register({plugin: HKP.plugin, options: config});
  await server.register({plugin: REST.plugin, options: config});
  await server.register({plugin: WWW.plugin, options: config});
  // translation
  await server.register({
    plugin: i18n,
    options: {
      locales: ['de', 'en'],
      directory: path.join(__dirname, '../locales'),
      languageHeaderField: 'Accept-Language',
      defaultLocale: 'en'
    }
  });
  // start
  await server.start();
  log.info('Server running on %s', server.info.uri);
};

process.on('unhandledRejection', err => {
  console.log(err);
  process.exit(1);
});

init();