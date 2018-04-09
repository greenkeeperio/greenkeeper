const Joi = require('joi')

// a package path is either the term 'package.json' or
// a releative path that ends in package.json
// alternative regex: ^([^/]|p).*ackage\.json$
const packagePathSchema = Joi.string().regex(/^([a-zA-Z0-9_@-]+\/[a-zA-Z0-9_@/-]*)?package\.json$/)

const schema = Joi.object().keys({
  groups: Joi.object().pattern(/^[a-zA-Z0-9_-]+$/,
    Joi.object().keys({
      packages: Joi.array().items(packagePathSchema).required(),
      ignore: Joi.array()
    }).optionalKeys(['ignore'])
  ),
  ignore: Joi.array()
}).optionalKeys(['ignore'])

function validate (file) {
  // Abort early still doesn’t handle multiple _nested_ errors (in the same branch of the JSON tree).
  let errors = Joi.validate(file, schema, {
    abortEarly: false
  })
  if (errors.error) {
    errors.error.details.map((e) => {
      // Fall back to the standard Joi message if we don’t have a better one
      e.formattedMessage = e.message
      if (e.type === 'object.base' && e.path.length === 0) {
        e.formattedMessage = 'It seems as if your `greenkeeper.json` is not valid JSON. You can check the validity of JSON files with [JSONLint](https://jsonlint.com/), for example.'
      }
      if (e.type === 'string.regex.base') {
        e.formattedMessage = `The package path \`${e.context.value}\` in the group \`${e.path[1]}\` is invalid. It must be a relative path to a \`package.json\` file. The path may not start with a slash, and it must end in \`package.json\`. Allowed characters for a path are alphanumeric, underscores, dashes and the @ symbol (a-zA-Z_-@).`
      }
      if (e.type === 'string.regex.base' && e.context.value.startsWith('/')) {
        e.formattedMessage = `The package path \`${e.context.value}\` in the group \`${e.path[1]}\` must be relative and not start with a slash.`
      }
      if (e.type === 'string.regex.base' && !e.context.value.endsWith('package.json')) {
        e.formattedMessage = `The package path \`${e.context.value}\` in the group \`${e.path[1]}\` must end with \`package.json\`.`
      }
      if (e.type === 'object.allowUnknown' && e.path[0] === 'groups') {
        e.formattedMessage = `The group name \`${e.context.child}\` is invalid. Group names may only contain alphanumeric characters, underscores and dashes (a-zA-Z_-).`
      }
      if (e.type === 'object.allowUnknown' && e.path[0] !== 'groups') {
        e.formattedMessage = `The root-level key \`${e.context.child}\` is invalid. If you meant to add a group named \`${e.context.child}\`, please put it in a root-level \`groups\` object. Valid root-level keys are \`groups\` and \`ignore\`.`
      }
      if (e.message === '"packages" is required') {
        e.formattedMessage = `The group \`${e.path[1]}\` must contain a \`packages\` key. This must contain an array of paths to the \`package.json\` files you want handled in this group, eg. \`packages: ['cli-tool/package.json', 'analytics/package.json']\`.`
      }
    })
  }

  return errors
}

module.exports = {
  validate
}
