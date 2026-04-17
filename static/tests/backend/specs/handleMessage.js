'use strict';

const assert = require('assert').strict;
const common = require('ep_etherpad-lite/tests/backend/common');
const authorManager = require('ep_etherpad-lite/node/db/AuthorManager');

// Require the plugin with the loadSettings hook already triggered so that the
// module's private `settings` reference is initialised.
const plugin = require('../../../..');

describe(__filename, function () {
  before(async function () {
    await common.init();
    await new Promise((resolve, reject) => {
      plugin.loadSettings(
          'loadSettings', {settings: {trustProxy: true, users: {}}}, (err) => err ? reject(err) : resolve());
    });
  });

  const makeContext = (message) => ({
    socket: {client: {request: {session: {user: {displayname: 'Alice'}}}}},
    message,
  });

  it('uses context.socket rather than context.client (regression for #60)', async function () {
    // Calling with context.client would throw TypeError since we destructure
    // the socket-shaped property. Supplying only `socket` must work.
    await plugin.handleMessage('handleMessage',
        makeContext({type: 'COLLABROOM', data: {type: 'USERINFO_UPDATE', userInfo: {name: 'x'}}}));
  });

  it('calls getAuthorId (not deprecated getAuthor4Token) on CLIENT_READY (regression for #60)',
      async function () {
        const calls = {getAuthorId: 0, getAuthor4Token: 0, setAuthorName: []};
        const origGetAuthorId = authorManager.getAuthorId;
        const origGetAuthor4Token = authorManager.getAuthor4Token;
        const origSetAuthorName = authorManager.setAuthorName;
        authorManager.getAuthorId = async (token, user) => {
          calls.getAuthorId++;
          assert.equal(token, 'tk');
          assert.deepEqual(user, {displayname: 'Alice'});
          return 'a.123';
        };
        authorManager.getAuthor4Token = async () => { calls.getAuthor4Token++; return 'a.old'; };
        authorManager.setAuthorName = (id, name) => { calls.setAuthorName.push([id, name]); };
        try {
          await plugin.handleMessage('handleMessage',
              makeContext({type: 'CLIENT_READY', token: 'tk'}));
        } finally {
          authorManager.getAuthorId = origGetAuthorId;
          authorManager.getAuthor4Token = origGetAuthor4Token;
          authorManager.setAuthorName = origSetAuthorName;
        }
        assert.equal(calls.getAuthorId, 1);
        assert.equal(calls.getAuthor4Token, 0);
        assert.deepEqual(calls.setAuthorName, [['a.123', 'Alice']]);
      });
});
