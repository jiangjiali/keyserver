/**
 * Mailvelope - secure email with OpenPGP encryption for Webmail
 * Copyright (C) 2016 Mailvelope GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

const uuid = require('node-uuid');
const util = require('./util');

/**
 * Database documents have the format:
 * {
 *   _id: ObjectID, // randomly generated by MongoDB
 *   email: "jon@example.com", // the email address in lowercase
 *   name: "Jon Smith",
 *   keyid: "02C134D079701934", // id of the public key document in uppercase hex
 *   nonce: "123e4567-e89b-12d3-a456-426655440000", // verifier used to prove ownership
 *   verified: true // if the user ID has been verified
 * }
 */
const DB_TYPE = 'userid';

/**
 * A service that handles User ID queries to the database
 */
class UserId {

  /**
   * Create an instance of the service
   * @param {Object} mongo   An instance of the MongoDB client
   */
  constructor(mongo) {
    this._mongo = mongo;
  }

  /**
   * Generate nonces for verification and store a list of user ids. There
   * can only be one verified user ID for an email address at any given time.
   * @param {String} keyid     The public key id
   * @param {Array}  userIds   The userIds to persist
   * @yield {Array}            A list of user ids with generated nonces
   */
  *batch(options) {
    let userIds = options.userIds, keyid = options.keyid;
    userIds.forEach(u => {
      u.keyid = keyid;     // set keyid on docs
      u.nonce = uuid.v4(); // generate nonce for verification
    });
    let r = yield this._mongo.batch(userIds, DB_TYPE);
    if (r.insertedCount !== userIds.length) {
      util.throw(500, 'Failed to persist user ids');
    }
    return userIds;
  }

  /**
   * Verify a user id by proving knowledge of the nonce.
   * @param {string} keyid   Correspronding public key id
   * @param {string} nonce   The verification nonce proving email address ownership
   * @yield {undefined}
   */
  *verify(options) {
    let uid = yield this._mongo.get(options, DB_TYPE);
    if (!uid) {
      util.throw(404, 'User id not found');
    }
    yield this._mongo.update(uid, { verified:true, nonce:null }, DB_TYPE);
  }

  /**
   * Get a verified user IDs either by key id or email address.
   * There can only be one verified user ID for an email address
   * at any given time.
   * @param {String} keyid     The public key id
   * @param {String} userIds   A list of user ids to check
   * @yield {Object}           The verified user ID document
   */
  *getVerfied(options) {
    let keyid = options.keyid, userIds = options.userIds;
    if (keyid) {
      let verified = yield this._mongo.get({ keyid, verified:true }, DB_TYPE);
      if (verified) {
        return verified;
      }
    }
    if (userIds) {
      for (let uid of userIds) {
        let verified = yield this._mongo.get({ email:uid.email, verified:true }, DB_TYPE);
        if (verified) {
          return verified;
        }
      }
    }
  }

  /**
   * Remove all user ids matching a certain query
   * @param {String} keyid   The public key id
   * @yield {undefined}
   */
  *remove(options) {
    yield this._mongo.remove({ keyid:options.keyid }, DB_TYPE);
  }

}

module.exports = UserId;