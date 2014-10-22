var config = require("./config");
var sugar = require("sugar");
module.exports = {

    externalFilenameForFile: function(file, request) {
        var hostname = request != undefined ? request.headers.host : '';

        var retVal = hostname.length ? ('http://' + hostname) : '';
        retVal += file.at(0) == '/' && hostname.length > 0 ? '' : '/';
        retVal += file.replace('.md', '').replace(config.postsRoot, '').replace(config.postsRoot.replace('./', ''), '');
        return retVal;
    },
    normalizedFileName: function(file) {
        var retVal = file;
        if (file.startsWith('posts')) {
            retVal = './' + file;
        }
        retVal = retVal.replace('.md', '');

        return retVal;
    }
}
