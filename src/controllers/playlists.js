import mongoose from 'mongoose';
import Promise from 'bluebird';
import debug from 'debug';

import { createCommand } from '../sockets';
import { GenericError } from '../errors';
import { fetchMedia } from './search';

const ObjectId = mongoose.Types.ObjectId;
const log = debug('uwave:api:v1:playlists');

const addGlobalMedia = function addGlobalMedia(sourceType, sourceID, keys, GlobalMedia) {
  return fetchMedia(sourceType, sourceID, keys)
  .then(media => {
    return new GlobalMedia(media).save();
  });
};

export const getPlaylists = function getPlaylists(id, mongo) {
  const Playlist = mongo.model('Playlist');

  return Playlist.find({'author': id});
};

export const createPlaylist = function createPlaylist(data, mediaArray, mongo) {
  const Playlist = mongo.model('Playlist');
  const Media = mongo.model('Media');

  const playlist = new Playlist(data);

  return playlist.validate()
  .then(() => {
    let pending = mediaArray.length;
    const cb = (err, media) => {
      if (err) {
        playlist.remove();
        throw err;
      }

      pending--;
      playlist.media.push(media.id);
      if (!pending) return playlist.save();
    };

    if (!pending) return playlist.save();

    for (let i = 0, l = mediaArray.length; i < l; i++) {
      const media = new Media(mediaArray[i]);
      media.save(cb);
    }
  });
};

export const getPlaylist = function getPlaylist(id, playlistID, populate, mongo) {
  const Playlist = mongo.model('Playlist');

  return (
    populate ?
    Playlist.findOne(ObjectId(playlistID)) :
    Playlist.findOne(ObjectId(playlistID)).populate('media')
  )
  .then(playlist => {
    if (!playlist) throw new GenericError(404, `playlist with ID ${playlistID} not found`);
    if (id !== playlist.author.toString() && playlist.shared) {
      throw new GenericError(403, 'this playlist is private');
    }

    return playlist.populate('media');
  });
};

export const deletePlaylist = function deletePlaylist(id, playlistID, uwave) {
  const Playlist = uwave.mongo.model('Playlist');
  let _active = null;

  return uwave.redis.get(`playlist:${id}`)
  .then(active => {
    _active = active;
    return Playlist.findOne(ObjectId(playlistID));
  })
  .then(playlist => {
    if (!playlist) throw new GenericError(404, `playlist with ID ${playlistID} not found`);
    if (id !== playlist.author.toString()) {
      throw new GenericError(403, 'you can\'t delete the playlist of another user');
    }
    if (_active && _active === playlist.id) {
      throw new GenericError(403, 'you can\'t delete an active playlist');
    }

    return playlist.remove();
  });
};

export const renamePlaylist = function renamePlaylist(id, playlistID, name, mongo) {
  const Playlist = mongo.model('Playlist');

  return Playlist.findOne(ObjectId(playlistID))
  .then(playlist => {
    if (!playlist) throw new GenericError(404, `playlist with ID ${playlistID} not found`);
    if (id !== playlist.author.toString()) {
      throw new GenericError(403, 'you can\'t rename the playlist of another user');
    }

    playlist.name = name;
    return playlist.save();
  });
};

export const sharePlaylist = function sharePlaylist(id, playlistID, shared, mongo) {
  const Playlist = mongo.model('Playlist');

  return Playlist.findOne(ObjectId(playlistID))
  .then(playlist => {
    if (!playlist) throw new GenericError(404, `playlist with ID ${playlistID} not found`);
    if (id !== playlist.author.toString()) {
      throw new GenericError(403, 'you can\'t share the playlist of another user');
    }

    playlist.shared = shared;
    return playlist.save();
  });
};

export const activatePlaylist = function activatePlaylist(id, playlistID, uwave) {
  const Playlist = uwave.mongo.model('Playlist');
  return Playlist.findOne(ObjectId(playlistID)).populate('author')
  .then(playlist => {
    if (!playlist) throw new GenericError(404, `playlist with ID ${playlistID} not found`);
    if (id !== playlist.author.id && playlist.shared) {
      throw new GenericError(403, `${playlist.author.username} has made ${playlist.name} private`);
    }

    uwave.redis.set(`playlist:${id}`, playlist.id);
    return uwave.redis.get(`playlist:${id}`);
  });
};

export const createMedia = function createMedia(id, playlistID, sourceType, sourceID, uwave) {
  const GlobalMedia = uwave.mongo.model('GlobalMedia');
  const Playlist = uwave.mongo.model('Playlist');
  const Media = uwave.mongo.model('Media');

  let _media = null;

  const removeOnFailure = e => {
    if (_media) _media.remove();
    throw new GenericError(500, 'couldn\'t save media');
  };

  return GlobalMedia.findOne({ 'sourceType': sourceType, 'sourceID': sourceID })
  .then(gmedia => {
    if (!gmedia) {
      return addGlobalMedia(sourceType, sourceID, uwave.keys, GlobalMedia);
    } else {
      return gmedia;
    }
  })
  .then(gmedia => {
    return new Media({
      'global': gmedia.id,
      'artist': gmedia.artist,
      'title': gmedia.title
    }).save();
  })
  .then(media => {
    if (!media) throw new Error('couldn\'t save media');
    _media = media;
    return Playlist.findOne(ObjectId(playlistID));
  }, removeOnFailure)
  .then(playlist => {
    if (!playlist) throw new GenericError(404, `playlist with ID ${playlistID} not found`);
    if (playlist.author.toString() !== id) throw new GenericError(403, 'you can\'t edit the playlist of another user');

    playlist.media.push(_media.id);
    return playlist.save();
  }, removeOnFailure);
};

export const getMedia = function getMedia(id, playlistID, mediaID, mongo) {
  const Playlist = mongo.model('Playlist');

  return Playlist.findOne(ObjectId(playlistID)).populate('media')
  .then(playlist => {
    if (!playlist) throw new GenericError(404, `playlist with ID ${playlistID} not found`);
    if (id !== playlist.author.toString() && playlist.shared) {
      throw new GenericError(403, 'this playlist is private');
    }

    return new Promise((resolve, reject) => {
      for (let i = playlist.media.length - 1; i >= 0; i--) {
        if (playlist.media[i].id === mediaID) {
          return resolve(playlist.media[i]);
        }
      }
      reject(new GenericError(404, 'media not found'));
    });
  });
};

export const updateMedia = function updateMedia(id, playlistID, mediaID, metadata, mongo) {
  const Playlist = mongo.model('Playlist');
  const Media = mongo.model('Media');

  return Playlist.findOne(ObjectId(playlistID))
  .then(playlist => {
    if (!playlist) throw new GenericError(404, `playlist with ID ${playlistID} not found`);
    if (id !== playlist.author.toString() && playlist.shared) {
      throw new GenericError(403, 'playlist is private');
    }

    for (let i = playlist.media.length - 1; i >= 0; i--) {
      if (playlist.media[i].toString() === mediaID) {
        return Media.findOneAndUpdate(playlist.media[i], metadata, { 'new': true });
      }
    }

    throw new GenericError(404, 'media not found');
  });
};

export const deleteMedia = function deleteMedia(id, playlistID, mediaID, mongo) {
  const Playlist = mongo.model('Playlist');
  const Media = mongo.model('Media');

  return Playlist.findOne(ObjectId(playlistID))
  .then(playlist => {
    if (!playlist) throw new GenericError(404, `playlist with ID ${id} not found`);
    if (id !== playlist.author.toString()) {
      throw new GenericError(403, 'playlist is private');
    }

    for (let i = playlist.media.length - 1; i >= 0; i--) {
      if (playlist.media[i].toString() === mediaID) {
        Media.findOneAndRemove(playlist.media[i]);

        playlist.media.splice(i, 1);
        return playlist.save();
      }
    }

    throw new GenericError(404, 'media not found');
  });
};
