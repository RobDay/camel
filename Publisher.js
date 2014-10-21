var config = require("./config");
var async = require("async");
var postFormatter = require("./PostFormatter");
var fs = require("fs");
var mkdirp = require("mkdirp");

module.exports = function publishPendingPosts(functionCallback) {
    fs.readdir(config.pendingPostsRoot, function (err, files){
        if(err || !files) {
            functionCallback(err);
        } else {
            async.each(files, function (file, callback) {

                var fullFilename = config.pendingPostsRoot + file;
                var parsedFile = postFormatter.generateHtmlAndMetadataForFile(fullFilename);
                var pubDate = Date.create(parsedFile['metadata']['Date']);
                var link = config.postsRoot + pubDate.format("{yyyy}") + '/' + pubDate.format("{MM}") + '/' + pubDate.format('{dd}') + '/';
                mkdirp(link, function (err) {
                    fs.rename(fullFilename, link + file, function (err) {
                        callback(err);
                    })
                })

            }, function (err) {
                functionCallback(err);
            })

        }
    })
}

if (require.main === module) {

    setTimeout(function() {
        module.exports(function(err) {
            console.log("DONE");
            process.exit(1);
        });
    }, 100);
}
