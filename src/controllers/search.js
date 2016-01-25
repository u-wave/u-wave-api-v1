import Promise from 'bluebird';
import debug from 'debug';
import https from 'https';
import parseIsoDuration from 'parse-iso-duration';
import getArtistTitle from 'get-artist-title';

import { stringify } from 'querystring';
import { GenericError } from '../errors';

const log = debug('uwave:api:v1:search');

function sendRequest(opts) {
  return new Promise((resolve, reject) => {
    https.request(opts, res => {
      const data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data.join('')));
        } catch (e) {
          log(e);
          reject('couldn\'t fetch data from youtube');
        }
      });
    }).end();
  });
}

function selectThumbnail(thumbnails) {
  if (typeof thumbnails !== 'object') return '';

  if (typeof thumbnails.high === 'object') return thumbnails.high.url;
  if (typeof thumbnails.medium === 'object') return thumbnails.medium.url;
  if (typeof thumbnails.default === 'object') return thumbnails.default.url;
}

function getRegionRestriction(contentDetails) {
  if (contentDetails.regionRestriction) {
    return contentDetails.regionRestriction.blocked || [];
  }
  return [];
}

function convertSoundcloudMedia(media) {
  return {
    sourceType: 'soundcloud',
    sourceID: media.id,
    artist: media.user.username,
    title: media.title,
    duration: Math.round(parseInt(media.duration / 1000, 10)),
    thumbnail: media.artwork_url || media.waveform_url,
    nsfw: false,
    restricted: []
  };
}

function convertYoutubeMedia(item) {
  const [artist, title] = getArtistTitle(item.snippet.title) ||
    [item.snippet.channelTitle, item.snippet.title];

  return {
    sourceType: 'youtube',
    sourceID: item.id,
    artist, title,
    duration: Math.round(parseIsoDuration(item.contentDetails.duration) / 1000),
    thumbnail: selectThumbnail(item.snippet.thumbnails),
    nsfw: typeof item.contentDetails.contentRating === 'object',
    restricted: getRegionRestriction(item.contentDetails)
  };
}

export function fetchMediaYoutube(ids, key) {
  const params = stringify({
    key,
    part: 'snippet,contentDetails',
    id: Array.isArray(ids) ? ids.join(',') : ids
  });

  const opts = {
    host: 'www.googleapis.com',
    path: `/youtube/v3/videos?${params}`
  };

  return sendRequest(opts).then(media => {
    const _media = [];

    if (!Array.isArray(media.items) || media.items.length === 0) {
      return [];
    }

    for (let i = 0, l = media.items.length; i < l; i++) {
      if (!media.items[i].snippet || !media.items[i].contentDetails) continue;

      _media.push(convertYoutubeMedia(media.items[i]));
    }

    return _media;
  });
}

export function fetchMediaSoundcloud(id, key) {
  const params = stringify({
    client_id: key
  });

  const opts = {
    host: 'api.soundcloud.com',
    path: `/tracks/${id}?${params}`
  };

  return sendRequest(opts)
    .then(media => media && convertSoundcloudMedia(media));
}

export function fetchMedia(sourceType, sourceID, keys) {
  switch (sourceType.toLowerCase()) {
  case 'youtube':
    return fetchMediaYoutube([sourceID], keys.youtube)
    .then(media => {
      if (!media || media.length === 0) throw new GenericError(404, 'media not found');
      return media[0];
    });

  case 'soundcloud':
    return fetchMediaSoundcloud(sourceID, keys.soundcloud);

  default:
    return Promise.reject(new GenericError(404, 'unknown provider'));
  }
}

export function searchYoutube(query, key) {
  const params = stringify({
    key,
    q: query,
    safeSearch: 'none',
    videoSyndicated: true,
    part: 'snippet',
    order: 'relevance',
    maxResults: 25,
    type: 'video'
  });

  const opts = {
    host: 'www.googleapis.com',
    path: `/youtube/v3/search?${params}`
  };

  return sendRequest(opts)
  .then(body => {
    const ids = [];

    if (!Array.isArray(body.items)) return [];

    for (let i = 0, l = body.items.length; i < l; i++) {
      ids.push(body.items[i].id.videoId);
    }

    return fetchMediaYoutube(ids, key);
  });
}

export function searchSoundcloud(query, key) {
  const params = stringify({
    client_id: key,
    q: query,
    limit: 25
  });

  const opts = {
    host: 'api.soundcloud.com',
    path: `/tracks?${params}`
  };

  return sendRequest(opts)
  .then(body => {
    const items = [];

    for (let i = 0, l = body.length; i < l; i++) {
      items.push(convertSoundcloudMedia(body[i]));
    }
    return items;
  });
}

export function search(query, keys) {
  return Promise.props({
    youtube: searchYoutube(query, keys.youtube),
    soundcloud: searchSoundcloud(query, keys.soundcloud)
  });
}
