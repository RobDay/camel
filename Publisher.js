function publishPendingPosts(callback) {
    fs.readdir(pendingPostsRoot, function (err, files){
        if(err || !files) {
            callback(err);
        } else {
            async.each(files, function (file, callback) {

                var fullFilename = pendingPostsRoot + file;
                var lines = getLinesFromPost(fullFilename);
                var metadata = parseMetadata(lines['metadata']);
                var pubDate = Date.create(metadata['Date']);
                var link = postsRoot + pubDate.format("{yyyy}") + '/' + pubDate.format("{MM}") + '/' + pubDate.format('{dd}') + '/';
                mkdirp(link, function (err) {
                    console.log("HERE" + err);
                    fs.rename(fullFilename, link + file, function (err) {
                        console.log(err);
                        callback(err);
                    })
                })

            }, function (err) {
                callback(err);
            })

        }
    })
}
