var config = {
    metadataMarker: '@@',
    postsRoot: './posts/',
    templateRoot: './templates/',
    postRegex: /^(.\/)?posts\/\d{4}\/\d{1,2}\/\d{1,2}\/(\w|-)*(.md)?/,
    pendingPostsRoot: "./pendingPosts/"

}

module.exports = config;
