const Joi = require('joi')

// a package path is either the term 'package.json' or
// a releative path that ends in package.json
// alternitive regex: ^([^/]|p).*ackage\.json$
// const packagePathSchema = Joi.string().regex(/^(\w+\/[\w/]*)?package\.json$/)
//
// const packagesSchema = Joi.object().keys({
//   packages: Joi.array().items(
//     Joi.string().regex(/^(\w+\/[\w/]*)?package\.json$/)
//   )
// })

const schema = Joi.object().keys({
  groups: Joi.object().pattern(/[a-zA-Z0-9_]+/,
    Joi.object().keys({
      packages: Joi.array().items(
        Joi.string().regex(/^(\w+\/[\w/]*)?package\.json$/)
      )
    })
  ).required(),
  ignore: Joi.array()
})

function validate (file) {
  return Joi.validate(file, schema)
}

module.exports = {
  validate
}
