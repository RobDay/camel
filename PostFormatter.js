
var winston = require("winston");
var marked = require('marked');
var Handlebars = require('handlebars');
var fs = require("fs");
var _ = require("underscore");
var sugar = require("sugar");
var config = require('./config')
var postCache = require('./postCache');
var tools = require("./tools")
var postHeaderTemplate = null;


module.exports = (function () {


    function loadHeaderFooter(file, completion) {
        fs.exists(config.templateRoot + file, function(exists) {
            if (exists) {
                fs.readFile(config.templateRoot + file, {encoding: 'UTF8'}, function (error, data) {
                    if (!error) {
                        completion(data);
                    }
                });
            } else {

            }
        });
    }

    // Parses the metadata in the file
    function parseMetadata(lines) {
        var retVal = {};
        lines.each(function (line) {
            line = line.replace(config.metadataMarker, '');
            line = line.compact();
            if (line.has('=')) {
                var firstIndex = line.indexOf('=');
                retVal[line.first(firstIndex)] = line.from(firstIndex + 1);
            }
        });

        // NOTE: Some metadata is added in generateHtmlAndMetadataForFile().

        // Merge with site default metadata
        Object.merge(retVal, postFormatter.siteMetadata, false, function(key, targetVal, sourceVal) {
            // Ensure that the file wins over the defaults.
            console.log('overwriting "' + sourceVal + '" with "' + targetVal);
            return targetVal;
        });

        return retVal;
    }


    // Parses the HTML and renders it.
    function parseHtml(lines, replacements, postHeader) {
        // Convert from markdown
        var body = postFormatter.performMetadataReplacements(replacements, marked(lines));
        // Perform replacements
        var header = postFormatter.performMetadataReplacements(replacements, postFormatter.headerSource);
        // Concatenate HTML
        return header + postHeader + body + postFormatter.footerSource;
    }


    // Gets all the lines in a post and separates the metadata from the body
    function getLinesFromPost(file) {
        file = file.endsWith('.md') ? file : file + '.md';
        var data = fs.readFileSync(file, {encoding: 'UTF8'});

        // Extract the pieces
        var lines = data.lines();
        var metadataLines = _.filter(lines, function (line) { return line.startsWith(config.metadataMarker); });
        var body = _.difference(lines, metadataLines).join('\n');

        return {metadata: metadataLines, body: body};
    }


    // Gets the body HTML for this file, no header/footer.
    function generateBodyHtmlForFile(file) {
        var parts = getLinesFromPost(file);
        var body = marked(parts['body']);
        var metadata = parseMetadata(parts['metadata']);
        metadata['relativeLink'] = tools.externalFilenameForFile(file);
        return body;
    }



    var postFormatter = {
        siteMetadata: {}, //TODO: Metadata could go elsewhere
        performMetadataReplacements: function(replacements, haystack){
            _.keys(replacements).each(function (key) {
                // Ensure that it's a global replacement; non-regex treatment is first-only.
                // console.log("Key: " + key + "; haystack: " + haystack);
                haystack = haystack.replace(new RegExp(config.metadataMarker + key + config.metadataMarker, 'g'), replacements[key]);
            });
            return haystack;
        },
        generateHtmlForFile: function(file) {
            return this.generateHtmlAndMetadataForFile(file)['body'];
        },
        generateHtmlAndMetadataForFile: function(file) {
            var retVal = postCache.fetchFromCache(file);
            if (retVal == undefined) {
                console.log("Dont have a cached copy of: " + file);
                var lines = getLinesFromPost(file);
                var metadata = parseMetadata(lines['metadata']);
                metadata['relativeLink'] = tools.externalFilenameForFile(file);
                metadata['header'] = postHeaderTemplate(metadata);
                // If this is a post, assume a body class of 'post'.
                if (config.postRegex.test(file)) {
                    metadata['BodyClass'] = 'post';
                }
                var html =  parseHtml(lines['body'], metadata, postHeaderTemplate(metadata));
                retVal = {
                    metadata: metadata,
                    body: html,
                    unwrappedBody: postFormatter.performMetadataReplacements(metadata, generateBodyHtmlForFile(file)),
                    file: tools.normalizedFileName(file),
                    date: new Date()
                };
                postCache.addRenderedPost(file, retVal);
            } else {
                console.log("Returning a cached copy of: " + file);
            }
            return retVal;
        }
    };

    function init() {
        loadHeaderFooter('defaultTags.html', function (data) {
            // Note this comes in as a flat string; split on newlines for parsing metadata.
            postFormatter.siteMetadata = parseMetadata(data.split('\n'));

            // This relies on the above, so nest it.
            loadHeaderFooter('header.html', function (data) {
                postFormatter.headerSource = postFormatter.performMetadataReplacements(postFormatter.siteMetadata, data);
            });
        });
        loadHeaderFooter('footer.html', function (data) { postFormatter.footerSource = data; });
        loadHeaderFooter('postHeader.html', function (data) {
            Handlebars.registerHelper('formatPostDate', function (date) {
                return new Handlebars.SafeString(new Date(date).format('{Weekday} {Month} {d}, {yyyy} at {h}:{mm} {TT}'));
            });
            Handlebars.registerHelper('formatIsoDate', function (date) {
                return new Handlebars.SafeString(date !== undefined ? new Date(date).iso() : '');
            });
            postHeaderTemplate = Handlebars.compile(data);
        });

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

    init();

    return postFormatter;
})();
