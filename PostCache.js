var winston = require("winston");
var sugar = require("sugar");
var _ = require("underscore");

var cacheResetTimeInMillis = 1800000;
var maxCacheSize = 50;
var renderedPosts = {};


module.exports = function () {
    var PostCache = {};


    //Used for caching
    function normalizedFileName(file) {
        var retVal = file;
        if (file.startsWith('posts')) {
            retVal = './' + file;
        }
        retVal = retVal.replace('.md', '');

        return retVal;
    }

    PostCache.fetchFromCache = function fetchFromCache(file) {
        return renderedPosts[normalizedFileName(file)] || null;
    }


    PostCache.addRenderedPost = function addRenderedPost(file, postData) {
        //console.log('Adding to cache: ' + normalizedFileName(file));
        renderedPosts[normalizedFileName(file)] = postData;

        if (_.size(renderedPosts) > maxCacheSize) {
            var sorted = _.sortBy(renderedPosts, function (post) { return post['date']; });
            delete renderedPosts[sorted.first()['file']];
        }
        //console.log('Cache has ' + JSON.stringify(_.keys(renderedPosts)));
    }


    // Empties the caches.
    PostCache.emptyCache = function emptyCache() {
        console.log('Emptying the cache.');
        renderedPosts = {};
        // renderedRss = {};
        // allPostsSortedGrouped = {};
    }


    function init() {
        // Kill the cache every 30 minutes.
        setInterval(PostCache.emptyCache, cacheResetTimeInMillis);
    }

    init();
    return PostCache

}
