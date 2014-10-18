/***************************************************
 * INITIALIZATION                                  *
 ***************************************************/
var async = require('async');
var express = require('express');
var compress = require('compression');
var http = require('http');
var fs = require('fs');
var qfs = require('q-io/fs');
var _ = require('underscore');
var sugar = require("sugar");
var Handlebars = require("handlebars");

var rss = require('rss');

var mkdirp = require('mkdirp');
var app = express();
app.use(compress());
app.use(express.static("public"));
var server = http.createServer(app);

// "Statics"
var postsRoot = './posts/';
var pendingPostsRoot = './pendingPosts/';
var templateRoot = './templates/';
var metadataMarker = '@@';
var maxCacheSize = 50;
var postsPerPage = 10;
var postRegex = /^(.\/)?posts\/\d{4}\/\d{1,2}\/\d{1,2}\/(\w|-)*(.md)?/;
var utcOffset = 5;
var cacheResetTimeInMillis = 1800000;

var renderedPosts = {};
var renderedRss = {};
var allPostsSortedGrouped = {};
var headerSource = undefined;
var footerSource = null;
// var postHeaderTemplate = null;
var siteMetadata = {};

var postFormatter = require("./PostFormatter")();

/***************************************************
 * HELPER METHODS                                  *
 ***************************************************/

function init() {
    // Kill the cache every 30 minutes.
    setInterval(emptyCache, cacheResetTimeInMillis);
}


//Used for caching
function normalizedFileName(file) {
    console.log("File is" + file);
    var retVal = file;
    if (file.startsWith('posts')) {
        retVal = './' + file;
    }

    retVal = retVal.replace('.md', '');

    return retVal;
}

function addRenderedPostToCache(file, postData) {
    //console.log('Adding to cache: ' + normalizedFileName(file));
    renderedPosts[normalizedFileName(file)] = _.extend({ file: normalizedFileName(file), date: new Date() }, postData);

    if (_.size(renderedPosts) > maxCacheSize) {
        var sorted = _.sortBy(renderedPosts, function (post) { return post['date']; });
        delete renderedPosts[sorted.first()['file']];
    }

    //console.log('Cache has ' + JSON.stringify(_.keys(renderedPosts)));
}

function fetchFromCache(file) {
    return renderedPosts[normalizedFileName(file)] || null;
}


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
function allPostsSortedAndGrouped(completion) {
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
function allPostsPaginated(completion) {
    console.log("HERE2");
    allPostsSortedAndGrouped(function (postsByDay) {
        console.log("HERE3");
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

// Empties the caches.
function emptyCache() {
    console.log('Emptying the cache.');
    renderedPosts = {};
    renderedRss = {};
    allPostsSortedGrouped = {};
}

/***************************************************
 * ROUTE HELPERS                                   *
 ***************************************************/

function loadAndSendMarkdownFile(file, response) {
    if (file.endsWith('.md')) {
        // Send the source file as requested.
        console.log('Sending source file: ' + file);
        fs.exists(file, function (exists) {
            if (exists) {
                fs.readFile(file, {encoding: 'UTF8'}, function (error, data) {
                    if (error) {
                        response.send(500, {error: error});
                        return;
                    }
                    response.type('text/x-markdown; charset=UTF-8');
                    response.send(data);
                    return;
                });
            } else {
                response.send(400, {error: 'Markdown file not found.'});
            }
        });
    } else if (fetchFromCache(file) != null) {
        // Send the cached version.
        console.log('Sending cached file: ' + file);
        response.send(200, fetchFromCache(file)['body']);
        return;
    } else {
        // Fetch the real deal.
        fs.exists(file + '.md', function (exists) {
            if (!exists) {
                console.log('404: ' + file);
                response.send(404, {error: 'A post with that address is not found.'});
                return;
            }

            console.log('Sending file: ' + file)
            var html = generateHtmlForFile(file);
            response.send(200, html);
        });
    }
}

// Sends a listing of an entire year's posts.
function sendYearListing(request, response) {
    var year = request.params.slug;
    var retVal = '<h1>Posts for ' + year + '</h1>';
    var currentMonth = null;

    allPostsSortedAndGrouped(function (postsByDay) {
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

        var header = headerSource.replace(metadataMarker + 'Title' + metadataMarker, 'Posts for ' + year);
        response.send(header + retVal + footerSource);
    });

}

// Handles a route by trying the cache first.
// file: file to try.
// sender: function to send result to the client. Only parameter is an object that has the key 'body', which is raw HTML
// generator: function to generate the raw HTML. Only parameter is a function that takes a completion handler that takes the raw HTML as its parameter.
// bestRouteHandler() --> generator() to build HTML --> completion() to add to cache and send
function baseRouteHandler(file, sender, generator) {
    if (fetchFromCache(file) == null) {
        console.log('Not in cache: ' + file);
        generator(function (postData) {
            console.log("HERE");
            addRenderedPostToCache(file, {body: postData});
            sender({body: postData});
        });
    } else {
        console.log('In cache: ' + file);
        sender(fetchFromCache(file));
    }
}

/***************************************************
 * ROUTES                                          *
 ***************************************************/

app.get('/', function (request, response) {
    // Determine which page we're on, and make that the filename
    // so we cache by paginated page.
    var page = 1;
    if (request.query.p != undefined) {
        page = Number(request.query.p);
        if (isNaN(page)) {
            response.redirect('/');
        }
    }

    // Do the standard route handler. Cough up a cached page if possible.
    baseRouteHandler('/?p=' + page, function (cachedData) {
        response.send(cachedData['body']);
    }, function (completion) {
        var indexInfo = postFormatter.generateHtmlAndMetadataForFile(postsRoot + 'index.md');
        Handlebars.registerHelper('formatDate', function (date) {
            return new Handlebars.SafeString(new Date(date).format('{Weekday}<br />{d}<br />{Month}<br />{yyyy}'));
        });
        Handlebars.registerHelper('dateLink', function (date) {
            var parsedDate = new Date(date);
            return '/' + parsedDate.format("{yyyy}") + '/' + parsedDate.format("{M}") + '/' + parsedDate.format('{d}') + '/';
        });
        Handlebars.registerPartial('article', indexInfo['metadata']['ArticlePartial']);
        var dayTemplate = Handlebars.compile(indexInfo['metadata']['DayTemplate']);
        var footerTemplate = Handlebars.compile(indexInfo['metadata']['FooterTemplate']);

        var bodyHtml = '';
        console.log("BLAH");
        allPostsPaginated(function (pages) {
            console.log("HERE0");
            // If we're asking for a page that doesn't exist, redirect.
            if (page < 0 || page > pages.length) {
                console.log("BLAH1")
                response.redirect(pages.length > 1 ? '/?p=' + pages.length : '/');
            }
            console.log("blah2");
            var days = pages[page - 1]['days'];
            days.forEach(function (day) {
                bodyHtml += dayTemplate(day);
            });
            console.log("blah3");
            // If we have more data to display, set up footer links.
            var footerData = {};
            if (page > 1) {
                footerData['prevPage'] = page - 1;
            }
            if (pages.length > page) {
                footerData['nextPage'] = page + 1;
            }
            console.log("Blah4");
            var metadata = postFormatter.generateMetadataForFile(postsRoot + 'index.md');
            console.log("blah7");
            console.log(postFormatter.headerSource);
            var header = postFormatter.performMetadataReplacements(metadata, postFormatter.headerSource);
            // Replace <title>...</title> with one-off for homepage, because it doesn't show both Page & Site titles.
            console.log("blah6");
            var titleBegin = header.indexOf('<title>') + "<title>".length;
            console.log("blah8");
            var titleEnd = header.indexOf('</title>');
            console.log("blah9");
            header = header.substring(0, titleBegin) + metadata['SiteTitle'] + header.substring(titleEnd);
            console.log("blah10");
            // Carry on with body
            bodyHtml = postFormatter.performMetadataReplacements(metadata, bodyHtml);
            console.log("blah11");
            var fullHtml = header + bodyHtml + footerTemplate(footerData) + postFormatter.footerSource;
            console.log("blah5");
            completion(fullHtml);
        });
    });
});

app.get('/rss', function (request, response) {
    response.type('application/rss+xml');
    if (renderedRss['date'] == undefined || new Date().getTime() - renderedRss['date'].getTime() > 3600000) {
        var feed = new rss({
            title: siteMetadata['SiteTitle'],
            description: 'Posts to ' + siteMetadata['SiteTitle'],
            feed_url: 'http://www.yoursite.com/rss',
            site_url: 'http://www.yoursite.com',
            author: 'Your Name',
            webMaster: 'Your Name',
            copyright: '2013-' + new Date().getFullYear() + ' Your Name',
            image_url: 'http://www.yoursite.com/images/favicon.png',
            language: 'en',
            //categories: ['Category 1','Category 2','Category 3'],
            pubDate: new Date().toString(),
            ttl: '60'
        });

        var max = 10;
        var i = 0;
        allPostsSortedAndGrouped(function (postsByDay) {
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

            response.send(renderedRss['rss']);
        });
    } else {
        response.send(renderedRss['rss']);
    }
});

// Month view
app.get('/:year/:month', function (request, response) {
    var path = postsRoot + request.params.year + '/' + request.params.month;

    var postsByDay = {};

    qfs.listTree(path, function (name, stat) {
        return name.endsWith('.md');
    }).then(function (files) {
        _.each(files, function (file) {
            // Gather by day of month
            var metadata = generateHtmlAndMetadataForFile(file)['metadata'];
            var date = Date.create(metadata['Date']);
            var dayOfMonth = date.getDate();
            if (postsByDay[dayOfMonth] == undefined) {
                postsByDay[dayOfMonth] = [];
            }

            postsByDay[dayOfMonth].push({title: metadata['Title'], date: date, url: externalFilenameForFile(file)});
         });

         var html = "";
         // Get the days of the month, reverse ordered.
         var orderedKeys = _.sortBy(Object.keys(postsByDay), function (key) { return parseInt(key); }).reverse();
         // For each day of the month...
         _.each(orderedKeys, function (key) {
             var day = new Date(request.params.year, request.params.month - 1, parseInt(key));
             html += "<h1>" + day.format('{Weekday}, {Month} {d}') + '</h1><ul>';
             _.each(postsByDay[key], function (post) {
                 html += '<li><a href="' + post['url'] + '">' + post['title']  + '</a></li>';
             });
             html += '</ul>';
         });

         var header = headerSource.replace(metadataMarker + 'Title' + metadataMarker, "Day Listing");
         response.send(header + html + footerSource);
    });
 });

// Day view
app.get('/:year/:month/:day', function (request, response) {
    var path = postsRoot + request.params.year + '/' + request.params.month + '/' + request.params.day;

    // Get all the files in the directory
    fs.readdir(path, function (error, files) {
        if (error) {
            response.send(400, {error: "This path doesn't exist."});
            return;
        }

        var day = new Date(request.params.year, request.params.month - 1, request.params.day);
        var html = "<h1>Posts from " + day.format('{Weekday}, {Month} {d}') + "</h1><ul>";

        // Get all the data for each file
        var postsToday = [];
        files.each(function (file) {
            postsToday.push(generateHtmlAndMetadataForFile(path + '/' + file));
        });

        // Go ahead and sort...
        postsToday = _.sortBy(postsToday, function (post) {
            // ...by their post date and TIME...
            return Date.create(post['metadata']['Date']);
        }); // ...Oldest first.

        postsToday.each(function (post) {
            var title = post['metadata']['Title'];
            html += '<li><a href="' + post['metadata']['relativeLink'] + '">' + post['metadata']['Title'] + '</a></li>';
        });

        var header = headerSource.replace(metadataMarker + 'Title' + metadataMarker, day.format('{Weekday}, {Month} {d}'));
        response.send(header + html + footerSource);
    })
 });


// Get a blog post, such as /2014/3/17/birthday
app.get('/:year/:month/:day/:slug', function (request, response) {
    var file = postsRoot + request.params.year + '/' + request.params.month + '/' + request.params.day + '/' + request.params.slug;

    loadAndSendMarkdownFile(file, response);
});

// Empties the cache.
// app.get('/tosscache', function (request, response) {
//     emptyCache();
//     response.send(205);
// });

// Support for non-blog posts, such as /about, as well as years, such as /2014.
app.get('/:slug', function (request, response) {
    // If this is a typical slug, send the file
    if (isNaN(request.params.slug)) {
        var file = postsRoot + request.params.slug;
        loadAndSendMarkdownFile(file, response);
    // If it's a year, handle that.
    } else {
        sendYearListing(request, response);
    }
});

/***************************************************
 * STARTUP                                         *
 ***************************************************/
init();
var port = Number(process.env.PORT || 5000);
server.listen(port, function () {
   console.log('Express server started on port %s', server.address().port);
});

// publishPendingPosts(function (err) {
//     console.log("Err is " + err);
// })
