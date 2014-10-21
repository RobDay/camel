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

var mkdirp = require('mkdirp');
var app = express();
app.use(compress());
app.use(express.static("public"));
var server = http.createServer(app);

var config = require('./config');
var postFormatter = require("./PostFormatter")();
var postCollection = require("./PostCollection")();
var postCache = require("./PostCache")();

/***************************************************
 * HELPER METHODS                                  *
 ***************************************************/


// Gets the external link for this file. Relative if request is
// not specified. Absolute if request is specified.
function externalFilenameForFile(file, request) {
    var hostname = request != undefined ? request.headers.host : '';

    var retVal = hostname.length ? ('http://' + hostname) : '';
    retVal += file.at(0) == '/' && hostname.length > 0 ? '' : '/';
    retVal += file.replace('.md', '').replace(config.postsRoot, '').replace(config.postsRoot.replace('./', ''), '');
    return retVal;
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
    } else {
        fs.exists(file + '.md', function (exists) {
            if (!exists) {
                console.log('404: ' + file);
                response.send(404, {error: 'A post with that address is not found.'});
                return;
            }

        });
        var html = postCollection.postForFile(file);
        response.send(200, html);
    }
}

// Handles a route by trying the cache first.
// file: file to try.
// sender: function to send result to the client. Only parameter is an object that has the key 'body', which is raw HTML
// generator: function to generate the raw HTML. Only parameter is a function that takes a completion handler that takes the raw HTML as its parameter.
// bestRouteHandler() --> generator() to build HTML --> completion() to add to cache and send
function baseRouteHandler(file, sender, generator) {
    //TODO: Use the cache again
    console.log("BLAH");
    var cached = postCache.fetchFromCache(file);
    if (cached == null) {
        console.log('Not in cache: ' + file);
        generator(function (postData) {
            // console.log("HERE");
            postCache.addRenderedPost(file, {body: postData});
            sender({body: postData});
        });
    } else {
        console.log('In cache: ' + file);
        sender(cached);
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
        var indexInfo = postFormatter.generateHtmlAndMetadataForFile(config.postsRoot + 'index.md');
        Handlebars.registerPartial('article', indexInfo['metadata']['ArticlePartial']);
        var dayTemplate = Handlebars.compile(indexInfo['metadata']['DayTemplate']);
        var footerTemplate = Handlebars.compile(indexInfo['metadata']['FooterTemplate']);

        var bodyHtml = '';
        postCollection.allPostsPaginated(function (pages) {
            // If we're asking for a page that doesn't exist, redirect.
            if (page < 0 || page > pages.length) {
                response.redirect(pages.length > 1 ? '/?p=' + pages.length : '/');
            }
            var days = pages[page - 1]['days'];
            days.forEach(function (day) {
                bodyHtml += dayTemplate(day);
            });
            // If we have more data to display, set up footer links.
            var footerData = {};
            if (page > 1) {
                footerData['prevPage'] = page - 1;
            }
            if (pages.length > page) {
                footerData['nextPage'] = page + 1;
            }
            var metadata = indexInfo['metadata'];
            var header = postFormatter.performMetadataReplacements(metadata, postFormatter.headerSource);
            // Replace <title>...</title> with one-off for homepage, because it doesn't show both Page & Site titles.
            var titleBegin = header.indexOf('<title>') + "<title>".length;
            var titleEnd = header.indexOf('</title>');
            header = header.substring(0, titleBegin) + metadata['SiteTitle'] + header.substring(titleEnd);
            // Carry on with body
            bodyHtml = postFormatter.performMetadataReplacements(metadata, bodyHtml);
            var fullHtml = header + bodyHtml + footerTemplate(footerData) + postFormatter.footerSource;
            completion(fullHtml);
        });
    });
});

app.get('/rss', function (request, response) {
    response.type('application/rss+xml');
    var rss = postCollection.getRss(request);
    response.send(rss);
});

// Month view
app.get('/:year/:month', function (request, response) {
    var path = config.postsRoot + request.params.year + '/' + request.params.month;

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

         var header = postFormatter.headerSource.replace(config.metadataMarker + 'Title' + config.metadataMarker, "Day Listing");
         response.send(header + html + postFormatter.footerSource);
    });
 });

// Day view
app.get('/:year/:month/:day', function (request, response) {
    var path = config.postsRoot + request.params.year + '/' + request.params.month + '/' + request.params.day;

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

        var header = postFormatter.headerSource.replace(config.metadataMarker + 'Title' + config.metadataMarker, day.format('{Weekday}, {Month} {d}'));
        response.send(header + html + PostFormatter.footerSource);
    })
 });


// Get a blog post, such as /2014/3/17/birthday
app.get('/:year/:month/:day/:slug', function (request, response) {
    var file = config.postsRoot + request.params.year + '/' + request.params.month + '/' + request.params.day + '/' + request.params.slug;

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
        var file = config.postsRoot + request.params.slug;
        loadAndSendMarkdownFile(file, response);
    // If it's a year, handle that.
    } else {
        postCollection.sendYearListing(request, response);
    }
});

/***************************************************
 * STARTUP                                         *
 ***************************************************/
// init();
function setupHandlebars() {
    Handlebars.registerHelper('formatDate', function (date) {
        return new Handlebars.SafeString(new Date(date).format('{Weekday}<br />{d}<br />{Month}<br />{yyyy}'));
    });
    Handlebars.registerHelper('dateLink', function (date) {
        var parsedDate = new Date(date);
        return '/' + parsedDate.format("{yyyy}") + '/' + parsedDate.format("{M}") + '/' + parsedDate.format('{d}') + '/';
    });
}

setupHandlebars();
var port = Number(process.env.PORT || 5000);
server.listen(port, function () {
   console.log('Express server started on port %s', server.address().port);
});
