var winston = require("winston");
var sugar = require("sugar");
var _ = require("underscore");

var cacheResetTimeInMillis = 1800000;
var maxCacheSize = 50;
var renderedPosts = {};


module.exports = (function () {


    //Used for caching
    function normalizedFileName(file) {
        var retVal = file;
        if (file.startsWith('posts')) {
            retVal = './' + file;
        }
        retVal = retVal.replace('.md', '');

        return retVal;
    }

    var postCache = {
        fetchFromCache: function(file) {
            return renderedPosts[normalizedFileName(file)] || null;
        },
        addRenderedPost: function(file, postData) {
            //console.log('Adding to cache: ' + normalizedFileName(file));
            renderedPosts[normalizedFileName(file)] = postData;

            if (_.size(renderedPosts) > maxCacheSize) {
                var sorted = _.sortBy(renderedPosts, function (post) { return post['date']; });
                delete renderedPosts[sorted.first()['file']];
            }
            //console.log('Cache has ' + JSON.stringify(_.keys(renderedPosts)));
        },
        emptyCache: function () {
            console.log('Emptying the cache.');
            renderedPosts = {};
            // renderedRss = {};
            // allPostsSortedGrouped = {};
        }
    };
    setInterval(postCache.emptyCache, cacheResetTimeInMillis);
    return postCache

})();
