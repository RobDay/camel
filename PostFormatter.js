
var winston = require("winston");
var marked = require('marked');
var Handlebars = require('handlebars');
var fs = require("fs");

module.exports = function () {


    function loadHeaderFooter(file, completion) {
        fs.exists(templateRoot + file, function(exists) {
            if (exists) {
                fs.readFile(templateRoot + file, {encoding: 'UTF8'}, function (error, data) {
                    if (!error) {
                        completion(data);
                    }
                });
            }
        });
    }

    // Parses the metadata in the file
    function parseMetadata(lines) {
        var retVal = {};

        lines.each(function (line) {
            line = line.replace(metadataMarker, '');
            line = line.compact();
            if (line.has('=')) {
                var firstIndex = line.indexOf('=');
                retVal[line.first(firstIndex)] = line.from(firstIndex + 1);
            }
        });

        // NOTE: Some metadata is added in generateHtmlAndMetadataForFile().

        // Merge with site default metadata
        Object.merge(retVal, siteMetadata, false, function(key, targetVal, sourceVal) {
            // Ensure that the file wins over the defaults.
            console.log('overwriting "' + sourceVal + '" with "' + targetVal);
            return targetVal;
        });

        return retVal;
    }


    // Parses the HTML and renders it.
    function parseHtml(lines, replacements, postHeader) {
        // Convert from markdown
        var body = performMetadataReplacements(replacements, marked(lines));
        // Perform replacements
        var header = performMetadataReplacements(replacements, headerSource);
        // Concatenate HTML
        return header + postHeader + body + footerSource;
    }


    // Gets all the lines in a post and separates the metadata from the body
    function getLinesFromPost(file) {
        file = file.endsWith('.md') ? file : file + '.md';
        var data = fs.readFileSync(file, {encoding: 'UTF8'});

        // Extract the pieces
        var lines = data.lines();
        var metadataLines = _.filter(lines, function (line) { return line.startsWith(metadataMarker); });
        var body = _.difference(lines, metadataLines).join('\n');

        return {metadata: metadataLines, body: body};
    }


    // Gets the body HTML for this file, no header/footer.
    function generateBodyHtmlForFile(file) {
        var parts = getLinesFromPost(file);
        var body = marked(parts['body']);
        var metadata = parseMetadata(parts['metadata']);
        metadata['relativeLink'] = externalFilenameForFile(file);
        return body;
    }



    function init() {
        loadHeaderFooter('defaultTags.html', function (data) {
            // Note this comes in as a flat string; split on newlines for parsing metadata.
            siteMetadata = parseMetadata(data.split('\n'));

            // This relies on the above, so nest it.
            loadHeaderFooter('header.html', function (data) {
                headerSource = performMetadataReplacements(siteMetadata, data);
            });
        });
        loadHeaderFooter('footer.html', function (data) { footerSource = data; });
        loadHeaderFooter('postHeader.html', function (data) {
            Handlebars.registerHelper('formatPostDate', function (date) {
                return new Handlebars.SafeString(new Date(date).format('{Weekday} {Month} {d}, {yyyy} at {h}:{mm} {TT}'));
            });
            Handlebars.registerHelper('formatIsoDate', function (date) {
                return new Handlebars.SafeString(date !== undefined ? new Date(date).iso() : '');
            });
            postHeaderTemplate = Handlebars.compile(data);
        });

        // Kill the cache every 30 minutes.
        setInterval(emptyCache, cacheResetTimeInMillis);

        marked.setOptions({
            renderer: new marked.Renderer(),
            gfm: true,
            tables: true,
            smartLists: true,
            smartypants: true,
            highlight: function (code) {
                return require('highlight.js').highlightAuto(code).value;
              }
        });
    }

    var PostFormatter = {};

    PostFormatter.performMetatadataReplacements = function performMetadataReplacements(replacements, haystack) {
        _.keys(replacements).each(function (key) {
            // Ensure that it's a global replacement; non-regex treatment is first-only.
            haystack = haystack.replace(new RegExp(metadataMarker + key + metadataMarker, 'g'), replacements[key]);
        });

        return haystack;
    }

    // Gets the rendered HTML for this file, with header/footer.
    PostFormatter.generateHtmlForFile =  function generateHtmlForFile(file) {
        return generateHtmlAndMetadataForFile(file)['body'];
    }

    // Gets the metadata for this file
    PostFormatter.generateMetadataForFile = function generateMetadataForFile(file) {
        return generateHtmlAndMetadataForFile(file)['metadata'];
    }

    // Gets the metadata & rendered HTML for this file
    PostFormatter.generateHtmlAndMetadataForFile = function generateHtmlAndMetadataForFile(file) {
        var retVal = fetchFromCache(file);
        if (retVal == undefined) {
            var lines = getLinesFromPost(file);
            var metadata = parseMetadata(lines['metadata']);
            metadata['relativeLink'] = externalFilenameForFile(file);
            metadata['header'] = postHeaderTemplate(metadata);
            // If this is a post, assume a body class of 'post'.
            if (postRegex.test(file)) {
                metadata['BodyClass'] = 'post';
            }
            var html =  parseHtml(lines['body'], metadata, postHeaderTemplate(metadata));
            addRenderedPostToCache(file, {
                metadata: metadata,
                body: html,
                unwrappedBody: performMetadataReplacements(metadata, generateBodyHtmlForFile(file)) }
            );
        }

        return fetchFromCache(file);
    }

    return PostFormatter;
}
