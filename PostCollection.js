var sugar = require("sugar");
var qfs = require('q-io/fs');
var rss = require('rss');
var _ = require("underscore");

var config = require("./config");
var postFormatter = require("./PostFormatter")();
var postCache = require("./PostCache");
var rssKey = 'rss';
var utcOffset = 5;
var postsPerPage = 10;

module.exports = function() {
    var PostCollection = {};
    // var renderedRss = {};
    var allPostsSortedGrouped = {};

    //Duplicate
    // Gets the external link for this file. Relative if request is
    // not specified. Absolute if request is specified.
    function externalFilenameForFile(file, request) {
        var hostname = request != undefined ? request.headers.host : '';

        var retVal = hostname.length ? ('http://' + hostname) : '';
        retVal += file.at(0) == '/' && hostname.length > 0 ? '' : '/';
        retVal += file.replace('.md', '').replace(config.postsRoot, '').replace(config.postsRoot.replace('./', ''), '');
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
        //TODO: Remove teh false
        if (false && Object.size(allPostsSortedGrouped) != 0) {
            completion(allPostsSortedGrouped);
        } else {
            qfs.listTree(config.postsRoot, function (name, stat) {
                return config.postRegex.test(name);
            }).then(function (files) {
                // Lump the posts together by day
                var groupedFiles = _.groupBy(files, function (file) {
                    var parts = file.split('/');
                    return new Date(parts[1], parts[2] - 1, parts[3]);
                });

                // Sort the days from newest to oldest
                var retVal = [];
                var sortedKeys = _.sortBy(_.keys(groupedFiles), function (date) {
                    return new Date(date);
                }).reverse();
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
        PostCollection.allPostsSortedAndGrouped(function (postsByDay) {
            var pages = [];
            var thisPageDays = [];
            var count = 0;
            postsByDay.each(function (day) {
                count += day['articles'].length;
                thisPageDays.push(day);
                // Reset count if need be
                if (count >= postsPerPage) {
                    pages.push({ page: pages.length + 1, days: thisPageDays });
                    thisPageDays = [];
                    count = 0;
                }
            });
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

            var header = postFormatter.headerSource.replace(config.metadataMarker + 'Title' + config.metadataMarker, 'Posts for ' + year);
            response.send(header + retVal + postFormatter.footerSource);
        });

    }

    PostCollection.postForFile = function(file) {
        //TODO: This needs to check the cache
        var html = postFormatter.generateHtmlForFile(file);
        return html;
    }

    PostCollection.getRss = function (request) {
        var renderedRss = postCache.fetchFromCache(rssKey);
        if (renderedRss == undefined || renderedRss['date'] == undefined || new Date().getTime() - renderedRss['date'].getTime() > 3600000) {
            var feed = new rss({
                title: postFormatter.siteMetadata['SiteTitle'],
                description: 'Posts to ' + postFormatter.siteMetadata['SiteTitle'],
                feed_url: 'http://www.developingday.com/rss',
                site_url: 'http://www.developingday.com',
                author: 'Robert Day',
                webMaster: 'Robert Day',
                copyright: '2014-' + new Date().getFullYear() + ' Robert Day',
                image_url: 'http://www.blah.com/images/favicon.png',
                language: 'en',
                //categories: ['Category 1','Category 2','Category 3'],
                pubDate: new Date().toString(),
                ttl: '60'
            });

            var max = 10;
            var i = 0;
            PostCollection.allPostsSortedAndGrouped(function (postsByDay) {
                postsByDay.forEach(function (day) {
                    day['articles'].forEach(function (article) {
                        if (i < max) {
                            ++i;
                            feed.item({
                                title: article['metadata']['Title'],
                                // Offset the time because Heroku's servers are GMT, whereas these dates are EST/EDT.
                                date: new Date(article['metadata']['Date']).addHours(utcOffset),
                                url: externalFilenameForFile(article['file'], request),
                                description: article['unwrappedBody'].replace(/<script[\s\S]*?<\/script>/gm, "")
                            });
                        }
                    });
                });

                renderedRss = {
                    date: new Date(),
                    rss: feed.xml()
                };
                postCache.addRenderedPost(rssKey, renderedRss);
                return feed.xml();


                // response.send(renderedRss['rss']);
            });
        } else {
            return renderedRss['rss'];
            // response.send(renderedRss['rss']);
        }
    }
    return PostCollection;

}
