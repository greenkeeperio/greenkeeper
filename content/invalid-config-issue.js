const md = require('./template')

// TODO: write something better!

module.exports = ({message, errors}) =>
md`We have detected a Problem with your Greenkeeper Config File 🚨

${message}

Example of a valid config object link

`
