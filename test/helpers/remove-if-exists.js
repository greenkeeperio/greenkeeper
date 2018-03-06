/**
 * Tries to delete a document in Couch, but does not fail if it doesn't exist
 *
 * @param {PouchDB} db - the PouchDB object of the database
 * @param {(string[]|...string)} ids - the ids of the documents to be deleted
 */
module.exports = async function (db, ...ids) {
  const idsToDelete = Array.isArray(ids[0]) ? ids[0] : ids
  return Promise.all(
    idsToDelete.map(async (id) => {
      try {
        return await db.remove(await db.get(id))
      } catch (e) {
        if (e.status !== 404) {
          throw e
        }
      }
    })
  )
}
