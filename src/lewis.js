var woerter = [
  'WAAAT?',
  'VOLL!',
  'JA!',
  'wunderbar',
  'genau',
  'wie bitte?',
  'nochmal',
  'zusammen oder getrennt?',
  'entschlüdigung',
  'SCHMETTERLING!!!'
]

module.exports = function (flags) {
  console.log(woerter[Math.floor(Math.random() * woerter.length)])
}
