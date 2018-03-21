const md = require('./template')

// TODO: write something better!

module.exports = ({errors}) =>
md`We have detected a Problem with your Greenkeeper Config File 🚨

Errors: ${errors}

Example of a valid config object link

`
