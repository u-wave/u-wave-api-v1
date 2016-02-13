import debug from 'debug';

import * as controller from '../controllers/playlists';
import { checkFields } from '../utils';
import handleError from '../errors';

const log = debug('uwave:api:v1:playlists');

export default function playlistRoutes(router) {
  router.route('/playlists')
  .get((req, res) => {
    const { page, limit } = req.query;
    controller.getPlaylists(parseInt(page, 10), parseInt(limit, 10), req.user.id, req.uwave.mongo)
    .then(playlists => res.status(200).json(playlists))
    .catch(e => handleError(res, e, log));
  })

  .post((req, res) => {
    if (!checkFields(req.body, res, [
      'name',
      'description',
      'shared'
    ], [
      'string',
      'string',
      'boolean'
    ])) return;

    const data = {
      name: req.body.name,
      description: req.body.description,
      shared: req.body.shared,
      author: req.user.id
    };

    controller.createPlaylist(data, [], req.uwave.mongo)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  });

  router.route('/playlists/:id')
  .get((req, res) => {
    controller.getPlaylist(req.user.id, req.params.id, req.uwave.mongo)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  })

  .delete((req, res) => {
    controller.deletePlaylist(req.user.id, req.params.id, req.uwave)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  });

  router.put('/playlists/:id/rename', (req, res) => {
    if (!req.body.name) {
      return res.status(422).json('name is not set');
    }
    if (typeof req.body.name !== 'string') {
      return res.status(422).json('name has to be of type string');
    }

    controller.renamePlaylist(req.user.id, req.params.id, req.body.name, req.uwave.mongo)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  });

  router.put('/playlists/:id/share', (req, res) => {
    if (typeof req.body.share === 'undefined') {
      return res.status(422).json('share is not set');
    }
    if (typeof req.body.share !== 'boolean') {
      return res.status(422).json('share has to be of type boolean');
    }

    controller.sharePlaylist(req.user.id, req.params.id, req.body.share, req.uwave.mongo)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  });

  router.put('/playlists/:id/move', (req, res) => {
    if (!checkFields(req.body, res, ['items', 'after'])) {
      return res.status(422).json('missing items or after property');
    }

    const { after, items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(422).json('items has to be an array');
    }

    controller.movePlaylistItems(req.user.id, req.params.id, after, items, req.uwave.mongo)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  });

  router.put('/playlists/:id/activate', (req, res) => {
    controller.activatePlaylist(req.user.id, req.params.id, req.uwave)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  });

  router.route('/playlists/:id/media')
  .get((req, res) => {
    const { page, limit } = req.query;
    controller.getPlaylistItems(parseInt(page, 10), parseInt(limit, 10),
                                req.user.id, req.params.id, req.uwave.mongo)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  })

  .post((req, res) => {
    if (!checkFields(req.body, res, ['items', 'after'])) {
      return res.status(422).json('missing items or after property');
    }
    const { after, items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(422).json('items has to be an array');
    }

    controller.createPlaylistItems(req.user.id, req.params.id, after, items, req.uwave)
    .then(media => res.status(200).json(media))
    .catch(e => handleError(res, e, log));
  })

  .delete((req, res) => {
    if (!Array.isArray(req.body.items)) return res.status(422).json('items is not set');

    controller.deletePlaylistItems(req.user.id, req.params.id, req.body.items, req.uwave.mongo)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  });

  router.route('/playlists/:id/media/:mediaID')
  .get((req, res) => {
    controller.getPlaylistItem(req.user.id, req.params.id, req.params.mediaID, req.uwave.mongo)
    .then(media => res.status(200).json(media))
    .catch(e => handleError(res, e, log));
  })

  .put((req, res) => {
    if (!checkFields(req.body, res, [
      'artist',
      'title',
      'start',
      'end'
    ], [
      'string',
      'string',
      'number',
      'number'
    ])) return;

    const { body, params, user, uwave } = req;

    const metadata = {
      artist: body.artist,
      title: body.title,
      start: body.start,
      end: body.end
    };

    controller.updatePlaylistItem(user.id, params.id, params.mediaID, metadata, uwave.mongo)
    .then(media => res.status(200).json(media))
    .catch(e => handleError(res, e, log));
  })

  .delete((req, res) => {
    const { params, user, uwave } = req;
    controller.deletePlaylistItems(user.id, params.id, [params.mediaID], uwave.mongo)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  });

  router.post('/playlists/:id/media/:mediaID/copy', (req, res) => {
    if (!checkFields(req.body, res, ['toPlaylistID'], 'string')) return;

    controller.copyPlaylistItem(req.user.id, req.params.id, req.params.mediaID, req.uwave.mongo)
    .then(playlist => res.status(200).json(playlist))
    .catch(e => handleError(res, e, log));
  });
}
