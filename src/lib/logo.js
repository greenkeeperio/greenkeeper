var ansi = require('ansi')

var cursor = ansi(process.stderr)

module.exports = function () {
  cursor.green()
  console.error([
    '                        oooo',
    '                        `888',
    '             .ooooooooo  888  ooooo',
    "            8888' `8888  888 .88P'",
    '            8888   8888  8888888.       g r e e n k e e p e r . i o',
    "            `888bod88P'  888 `888b.",
    '             `Yooooooo. o888o o8888o',
    '                  `Y88b',
    '            d88P   d888',
    "            `Y8888888P'",
    '\n'
  ].join('\n'))
  cursor.reset()
}
