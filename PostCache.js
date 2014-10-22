var winston = require("winston");
var sugar = require("sugar");
var _ = require("underscore");
var tools = require("./tools");

var cacheResetTimeInMillis = 1800000;
var maxCacheSize = 50;
var renderedPosts = {};


module.exports = (function () {


    var postCache = {
        fetchFromCache: function(file) {
            return renderedPosts[tools.normalizedFileName(file)] || null;
        },
        addRenderedPost: function(file, postData) {
            //console.log('Adding to cache: ' + tools.normalizedFileName(file));
            renderedPosts[tools.normalizedFileName(file)] = postData;

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
