module.exports = (api) => {
  api.cache.never();

  return {
    plugins: [
      '@babel/plugin-proposal-object-rest-spread',
      '@babel/plugin-proposal-class-properties',
      '@babel/plugin-transform-flow-comments',
    ],
  };
};
