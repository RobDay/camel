var sugar = require("sugar");
var qfs = require('q-io/fs');
var postsRoot = './posts/'; //Duplicate
var postRegex = /^(.\/)?posts\/\d{4}\/\d{1,2}\/\d{1,2}\/(\w|-)*(.md)?/; //Duplicate
var metadataMarker = '@@'; //Duplicate
var _ = require("underscore");
var postFormatter = require("./PostFormatter")();
var postsPerPage = 10;


module.exports = function() {
    var PostCollection = {}

    var allPostsSortedGrouped = {};

    //Duplicate
    // Gets the external link for this file. Relative if request is
    // not specified. Absolute if request is specified.
    function externalFilenameForFile(file, request) {
        var hostname = request != undefined ? request.headers.host : '';

        var retVal = hostname.length ? ('http://' + hostname) : '';
        retVal += file.at(0) == '/' && hostname.length > 0 ? '' : '/';
        retVal += file.replace('.md', '').replace(postsRoot, '').replace(postsRoot.replace('./', ''), '');
        return retVal;
    }


    // Gets all the posts, grouped by day and sorted descending.
    // Completion handler gets called with an array of objects.
    // Array
    //   +-- Object
    //   |     +-- 'date' => Date for these articles
    //   |     `-- 'articles' => Array
    //   |            +-- (Article Object)
    //   |            +-- ...
    //   |            `-- (Article Object)
    //   + ...
    //   |
    //   `-- Object
    //         +-- 'date' => Date for these articles
    //         `-- 'articles' => Array
    //                +-- (Article Object)
    //                +-- ...
    //                `-- (Article Object)
    PostCollection.allPostsSortedAndGrouped = function allPostsSortedAndGrouped(completion) {
        console.log("HERE4");
        if (Object.size(allPostsSortedGrouped) != 0) {
            console.log("HERE5");
            completion(allPostsSortedGrouped);
        } else {
            console.log("Here6");
            qfs.listTree(postsRoot, function (name, stat) {
                console.log("HERE7");
                return postRegex.test(name);
            }).then(function (files) {
                console.log("HERE8");
                // Lump the posts together by day
                var groupedFiles = _.groupBy(files, function (file) {
                    console.log("HERE9");
                    var parts = file.split('/');
                    return new Date(parts[1], parts[2] - 1, parts[3]);
                });

                // Sort the days from newest to oldest
                console.log("HERE10");
                var retVal = [];
                var sortedKeys = _.sortBy(_.keys(groupedFiles), function (date) {
                    return new Date(date);
                }).reverse();
                console.log("HERE11");
                // For each day...
                _.each(sortedKeys, function (key) {
                    // Get all the filenames...
                    var articleFiles = groupedFiles[key];
                    var articles = [];
                    // ...get all the data for that file ...
                    _.each(articleFiles, function (file) {
                        articles.push(postFormatter.generateHtmlAndMetadataForFile(file));
                    });

                    // ...so we can sort the posts...
                    articles = _.sortBy(articles, function (article) {
                        // ...by their post date and TIME.
                        return Date.create(article['metadata']['Date']);
                    }).reverse();
                    // Array of objects; each object's key is the date, value
                    // is an array of objects
                    // In that array of objects, there is a body & metadata.
                    retVal.push({date: key, articles: articles});
                });

                allPostsSortedGrouped = retVal;
                completion(retVal);
            });
        }
    }


    // Gets all the posts, paginated.
    // Goes through the posts, descending date order, and joins
    // days together until there are 10 or more posts. Once 10
    // posts are hit, that's considered a page.
    // Forcing to exactly 10 posts per page seemed artificial, and,
    // frankly, harder.
    PostCollection.allPostsPaginated = function allPostsPaginated(completion) {
        console.log("HERE2");
        PostCollection.allPostsSortedAndGrouped(function (postsByDay) {
            console.log("HERE3");
            var pages = [];
            var thisPageDays = [];
            var count = 0;
            postsByDay.each(function (day) {
                console.log("HERE4");
                count += day['articles'].length;
                thisPageDays.push(day);
                // Reset count if need be
                if (count >= postsPerPage) {
                    console.log("HERE6");
                    pages.push({ page: pages.length + 1, days: thisPageDays });
                    thisPageDays = [];
                    count = 0;
                }
            });
            console.log("HERE5");
            if (thisPageDays.length > 0) {
                pages.push({ page: pages.length + 1, days: thisPageDays});
            }

            completion(pages);
        });
    }

    //TODO: refactor to not take a request and response
    // Sends a listing of an entire year's posts.
    PostCollection.sendYearListing = function sendYearListing(request, response) {
        var year = request.params.slug;
        var retVal = '<h1>Posts for ' + year + '</h1>';
        var currentMonth = null;

        PostCollection.allPostsSortedAndGrouped(function (postsByDay) {
            postsByDay.each(function (day) {
                var thisDay = Date.create(day['date']);
                if (thisDay.is(year)) {
                    // Date.isBetween() is not inclusive, so back the from date up one
                    var thisMonth = new Date(Number(year), Number(currentMonth)).addDays(-1);
                    // ...and advance the to date by two (one to offset above, one to genuinely add).
                    var nextMonth = Date.create(thisMonth).addMonths(1).addDays(2);

                    //console.log(thisMonth.short() + ' <-- ' + thisDay.short() + ' --> ' + nextMonth.short() + '?   ' + (thisDay.isBetween(thisMonth, nextMonth) ? 'YES' : 'NO'));
                    if (currentMonth == null || !thisDay.isBetween(thisMonth, nextMonth)) {
                        // If we've started a month list, end it, because we're on a new month now.
                        if (currentMonth >= 0) {
                            retVal += '</ul>'
                        }

                        currentMonth = thisDay.getMonth();
                        retVal += '<h2><a href="/' + year + '/' + (currentMonth + 1) + '/">' + thisDay.format('{Month}') + '</a></h2>\n<ul>';
                    }

                    day['articles'].each(function (article) {
                        retVal += '<li><a href="' + externalFilenameForFile(article['file']) + '">' + article['metadata']['Title'] + '</a></li>';
                    });
                }
            });

            var header = postFormatter.headerSource.replace(metadataMarker + 'Title' + metadataMarker, 'Posts for ' + year);
            response.send(header + retVal + postFormatter.footerSource);
        });

    }
    return PostCollection;

}
